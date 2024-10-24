import dotenv from 'dotenv';
import fs from 'fs';
import { App, Octokit } from 'octokit';
import cors from 'cors';
import express, {json} from 'express';
import helmet from "helmet";
import { createNodeMiddleware, EmitterWebhookEvent } from '@octokit/webhooks';
import { FrogbotService } from "./services/FrogbotService.js";
import { JFROG_APP_USER_NAME, webhookEvents } from "./utils/consts.js";
import { WebSocketService } from './services/WebsocketService.js';
import path, { dirname } from 'path';
import { SetupService } from "./services/SetupService.js";
import { PostInstallationService } from "./services/PostInstallationService.js";
import { fileURLToPath } from 'url';
import http from 'http'; // Import HTTP to create the server

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const expressServer = express();
const port: number = parseInt(process.env.PORT || '3000', 10);

const githubAppId: number = parseInt(process.env.APP_ID ?? '0', 0);
const privateKeyPath: string = process.env.PRIVATE_KEY_PATH as string;
const privateKey: string = fs.readFileSync(privateKeyPath, 'utf-8');
const appWebhookSecret: string = process.env.WEBHOOK_SECRET as string;
const app = new App({
    appId: githubAppId,
    privateKey,
    webhooks: { secret: appWebhookSecret },
});

// Use helmet with WebSocket support
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
// Serve static files
expressServer.use(express.static(path.join(__dirname, '../jfrog-github-app-client/dist')));
expressServer.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, '../jfrog-github-app-client/dist', 'index.html'));
});

// Create the HTTP server
const httpServer = http.createServer(expressServer);

// Initialize WebSocket service using the HTTP server
const webSocketService = new WebSocketService(httpServer);

// Handle Webhook events
app.webhooks.on(webhookEvents.ADD_REPOSITORIES, async ({ payload }: EmitterWebhookEvent<webhookEvents.ADD_REPOSITORIES>) => {
    if (payload.action === "added") {
        const frogbotService = new FrogbotService(await app.getInstallationOctokit(payload.installation.id));
        await frogbotService.installFrogbotMultiple(payload.repositories_added);
    }
});

app.webhooks.on(webhookEvents.MERGED_PULL_REQUEST, async ({ payload }: EmitterWebhookEvent<webhookEvents.MERGED_PULL_REQUEST>) => {
    if (payload.pull_request.merged && payload.pull_request.user.login === JFROG_APP_USER_NAME) {
        const octokit = new Octokit(await app.getInstallationOctokit(payload.installation.id));
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const defaultBranch = payload.repository.default_branch;

        const postInstallationService = new PostInstallationService(octokit);
        await postInstallationService.finishUpInstallation(repo, owner, defaultBranch);
    }
});

// Listen for form submissions
expressServer.post('/submitForm', async (req, res) => {
    console.log(req);
    const { platformUrl, accessToken, installationId, advancedConfig } = req.body;
    try {
        const setupService = new SetupService(await app.getInstallationOctokit(installationId), webSocketService, advancedConfig);
        const response = await setupService.submitSetupForm(platformUrl, accessToken, installationId.toString());
        response.isPartial ? res.status(206).send(response.results) : res.status(200).send(response.results);
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

// Health check route
expressServer.get('/isAlive', (req, res) => {
    res.send(true);
});

// Start the HTTP & WebSocket server
httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`WebSocket server is running on ws://localhost:${port}`);
});
