import {InstallationResult, InstallStages, Secret} from "../utils/types.js";
import {Octokit} from "octokit";
import sodium from 'libsodium-wrappers';
import {JfrogClient} from "jfrog-client-js";
import {FrogbotService} from "./FrogbotService.js";
import {WebSocketService} from "./WebsocketService.js";

export class SetupService{
    private octokit: Octokit;
    private ws : WebSocketService;
    private frogbotService : FrogbotService;

    constructor(octokit : Octokit, websocket : WebSocketService) {
        this.octokit = octokit;
        this.frogbotService = new FrogbotService(octokit);
        this.ws = websocket;
    }

    public async submitSetupForm(platformUrl: string, accessToken: string, installationId: number) {
        this.ws.sendMessageToClient(installationId, JSON.stringify({ status:  InstallStages.VALIDATING_CREDENTIALS}));
        const jfrogClient = new JfrogClient({
            platformUrl,
            accessToken,
        });
        try {
             await jfrogClient.artifactory().system().version();
        } catch (error) {
            throw new Error("error validating credentials. Please make sure your credentials are correct");
        }

        try {
            this.ws.sendMessageToClient(installationId, JSON.stringify({ status: InstallStages.ADDING_GLOBAL_SECRETS}));

            const org: string = await this.getOrganization(installationId);
            await this.addGlobalSecret({ secretName: "JF_URL", secretValue: platformUrl }, org);
            await this.addGlobalSecret({ secretName: "JF_TOKEN", secretValue: accessToken }, org);

            const { data: repositories } = await this.octokit.rest.apps.listReposAccessibleToInstallation({
                installation_id: installationId,
            });

            this.ws.sendMessageToClient(installationId, JSON.stringify({ status:  InstallStages.INSTALLING_FROGBOT, total: repositories.repositories.length }));

            const results: InstallationResult[] = [];
            for (const repo of repositories.repositories) {
                const result = await this.frogbotService.installFrogbot(repo);
                this.ws.sendMessageToClient(installationId, JSON.stringify({ status: InstallStages.FROGBOT_INSTALLED, repo: repo.name }));
                results.push(result);
            }
            const isPartial: boolean = results.some(result => result.errorMessage);

            return { results, isPartial };
        } catch (error) {
            console.error('Error during setup:', error);
            throw new Error('Error during setup');
        }
    }


    private async getOrganization(installationId: number) {
        const { data: installation } = await this.octokit.rest.apps.getInstallation({
            installation_id: installationId,
        });
         //@ts-ignore
        return installation.account.login;
    };

    private async addGlobalSecret(secret: Secret, org: string): Promise<void> {
        const { data: publicKeyData } = await this.octokit.rest.actions.getOrgPublicKey({
            org,
        });

        const { key: publicKey, key_id: keyId } = publicKeyData;

        const encryptedSecret = await this.encryptSecret(secret.secretValue, publicKey);
        await this.octokit.rest.actions.createOrUpdateOrgSecret({
            org,
            secret_name: secret.secretName,
            encrypted_value: encryptedSecret,
            key_id: keyId,
            visibility: "all",
        });
    }

    private async encryptSecret(secret: string, publicKey: string): Promise<string> {
        return sodium.ready.then(() => {
            const binaryKey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
            const binarySecret = sodium.from_string(secret);
            const encBytes = sodium.crypto_box_seal(binarySecret, binaryKey);
            return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL)
        });
    }
}
