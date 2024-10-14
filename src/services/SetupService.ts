import {InstallationResult, Secret} from "../utils/types.js";
import {Octokit} from "octokit";
import sodium from 'libsodium-wrappers';
import {JfrogClient} from "jfrog-client-js";
import {FrogbotService} from "./FrogbotService.js";
import {WebSocket} from "ws";
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

    public async submitSetupForm(platformUrl: string, accessToken: string, installationId : number)  {
        let isConnected = false;
        this.ws.sendMessageToClient(installationId,JSON.stringify({ status: 'validating credentials'}));

        const jfrogClient = new JfrogClient({
            platformUrl,
            accessToken,
            retryDelay: 1000
        })
        try {
            await jfrogClient
                .xray()
                .system()
                .ping()
                .then((result : any) => {
                    if(result.status === 'pong')
                        isConnected = true;
                })
                .catch((error) => {
                    console.error(error);
                });
            if (isConnected) {
                try {
                    this.ws.sendMessageToClient(installationId,JSON.stringify({ status: 'Adding global secrets' }));

                    const org: string = await this.getOrganization(installationId);

                    await this.addGlobalSecret({ secretName: "JF_URL", secretValue: platformUrl }, org);
                    await this.addGlobalSecret({ secretName: "JF_TOKEN", secretValue: accessToken }, org);

                    const { data: repositories } = await this.octokit.rest.apps.listReposAccessibleToInstallation({
                        installation_id: installationId,
                    });

                    this.ws.sendMessageToClient(installationId,JSON.stringify({ status: 'Installing Frogbot' , total: repositories.repositories.length}));


                    const results: InstallationResult[] = [];

                    for (const repo of repositories.repositories) {
                        const result = await this.frogbotService.installFrogbot(repo);
                        this.ws.sendMessageToClient(installationId,JSON.stringify({ status: 'Frogbot installed'}));
                        results.push(result);
                    }
                    return results;
                } catch (error) {
                    console.error('Error while handling installation:', error);
                    return "the setup failed. please try again";
                }
            } else {
                console.error('JFrog Xray is not connected.');
                return 500;
            }
        } catch (error) {
            console.error('Error while pinging JFrog Xray:', error);
            return 500;
        }
}

    private async getOrganization(installationId: number) {
        const { data: installation } = await this.octokit.rest.apps.getInstallation({
            installation_id: installationId,
        });
        return installation.account.name;
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
            let binaryKey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
            let binarySecret = sodium.from_string(secret);
            let encBytes = sodium.crypto_box_seal(binarySecret, binaryKey);
            return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL)
        });
    }


}
