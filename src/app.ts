import dotenv from 'dotenv';
import fs from 'fs';
import { App, Octokit } from 'octokit';
import express, {json} from 'express';
import helmet from "helmet";
import {EmitterWebhookEvent } from '@octokit/webhooks';
import { FrogbotService } from "./services/FrogbotService.js";
import { JFROG_APP_USER_NAME, webhookEvents } from "./utils/consts.js";
import { WebSocketService } from './services/WebsocketService.js';
import path, { dirname } from 'path';
import { SetupService } from "./services/SetupService.js";
import { PostInstallationService } from "./services/PostInstallationService.js";
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const expressServer = express();
const port: number = parseInt(process.env.PORT || '3000', 10);

const githubAppId: number = parseInt(process.env.APP_ID ?? '0', 0);
const privateKeyPath: string = process.env.PRIVATE_KEY_PATH as string;
const privateKey: string = fs.readFileSync(privateKeyPath, 'utf-8');
const webhookPath = '/webhooks';
const appWebhookSecret: string = process.env.WEBHOOK_SECRET as string;
const app = new App({
    appId: githubAppId,
    privateKey,
    webhooks: { secret: appWebhookSecret },
});

expressServer.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: ["'self'", `ws://localhost:${port}`], // Allow WebSocket connection on the same port
            },
        },
    })
);
expressServer.use(json());
expressServer.use(express.static(path.join(__dirname, '../jfrog-github-app-client/dist')));
expressServer.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, '../jfrog-github-app-client/dist', 'index.html'));
});

expressServer.post(webhookPath, express.json(), async (req, res) => {
    try {
        await app.webhooks.receive({
            id: req.headers['x-github-delivery'] as string,
            name: req.headers['x-github-event'] as any,
            payload: req.body,
        });
        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling webhook:", error);
        res.sendStatus(500);
    }
});

const httpServer = http.createServer(expressServer);

const webSocketService = new WebSocketService(httpServer);

app.webhooks.on(webhookEvents.ADD_REPOSITORIES, async ({ payload }: EmitterWebhookEvent<webhookEvents.ADD_REPOSITORIES>) => {
    if (payload.action === "added") {
        const frogbotService = new FrogbotService(await app.getInstallationOctokit(payload.installation.id));
        await frogbotService.installFrogbotMultiple(payload.repositories_added);
    }
});

app.webhooks.on(webhookEvents.MERGED_PULL_REQUEST, async ({ payload }: EmitterWebhookEvent<webhookEvents.MERGED_PULL_REQUEST>) => {
    if (payload.pull_request.merged && payload.pull_request.user.login === JFROG_APP_USER_NAME) {
        const octokit = await app.getInstallationOctokit(payload.installation.id);
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const defaultBranch = payload.repository.default_branch;
        const postInstallationService = new PostInstallationService(octokit);
        await postInstallationService.finishUpInstallation(repo, owner, defaultBranch);
    }
});

expressServer.post('/submitForm', async (req, res) => {
    const { platformUrl, accessToken, installationId, advancedConfig } = req.body;
    try {
        const setupService = new SetupService(await app.getInstallationOctokit(installationId), webSocketService, advancedConfig);
        const response = await setupService.submitSetupForm(platformUrl, accessToken, installationId.toString());
        response.isPartial ? res.status(206).send(response.results) : res.status(200).send(response.results);
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

expressServer.get('/isAlive', (req, res) => {
    res.send(true);
});

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`WebSocket server is running on ws://localhost:${port}`);
});
