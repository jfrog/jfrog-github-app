import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import { App } from 'octokit';
import cors from 'cors';
import express from 'express';
import helmet from "helmet";
import { createNodeMiddleware, EmitterWebhookEvent } from '@octokit/webhooks';
import {FrogbotService} from "./services/FrogbotService.js";
import {GitHubRepo} from "./utils/types.js";
import {webhookEvents} from "./utils/consts.js";
import {WebSocketService} from './services/WebsocketService.js';
import {SetupService} from "./services/SetupService.js";


//setup secrets and environment variables for server
dotenv.config();
const expressServer = express();
const githubAppId: number = parseInt(process.env.APP_ID ?? '0', 0);
const privateKeyPath: string = process.env.PRIVATE_KEY_PATH as string;
const privateKey: string = fs.readFileSync(privateKeyPath, 'utf8');
const appWebhookSecret: string = process.env.WEBHOOK_SECRET as string;
const port: number = parseInt(process.env.PORT || '3000', 10);
const path = '/api/webhook';
const localWebhookUrl = `http://localhost:${port}${path}`;
const app = new App({
  appId:githubAppId,
  privateKey,
  webhooks: {
    secret: appWebhookSecret,
  },
});
const middleware = createNodeMiddleware(app.webhooks, { path });

expressServer.use(express.json());
expressServer.use(cors());
expressServer.use(helmet());
const webSocketService = new WebSocketService(5000);

app.webhooks.on(webhookEvents.ADD_REPOSITORIES, async ({ payload }: EmitterWebhookEvent<any>) => {
  console.log('Installation event received');
  if (payload.action === "added") {
    const frogbotService = new FrogbotService(await app.getInstallationOctokit(payload.installation.id));
    const installFrogbotPromises = payload.repositories_added.map((repo : GitHubRepo) => frogbotService.installFrogbot(repo));
    try {
      await Promise.all(installFrogbotPromises);
    } catch (error) {
    }
  }
});

expressServer.post('/submitForm', async (req: any, res: any) => {
  const { platformUrl, accessToken, installationId } = req.body;

  try {
    const setupService = new SetupService(await app.getInstallationOctokit(installationId), webSocketService);
    const response = await setupService.submitSetupForm(platformUrl, accessToken, installationId.toString());
    response.isPartial ? res.status(206).send(response) : res.status(200).send(response);
  } catch (error) {
    res.status(500).send(error.message);
  }
});


expressServer.listen(port, () => {

  console.log(`Express server listening on port ${port}`);
  console.log(`Webhook URL: http://localhost:${port}${path}`);
});
