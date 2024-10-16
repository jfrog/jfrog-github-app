import dotenv from 'dotenv';
import fs from 'fs';
import {App, Octokit} from 'octokit';
import cors from 'cors';
import express from 'express';
import helmet from "helmet";
import { createNodeMiddleware, EmitterWebhookEvent } from '@octokit/webhooks';
import {FrogbotService} from "./services/FrogbotService.js";
import {GitHubRepo} from "./utils/types.js";
import {JFROG_APP_USER_NAME, webhookEvents} from "./utils/consts.js";
import {WebSocketService} from './services/WebsocketService.js';
import {SetupService} from "./services/SetupService.js";
import {PostInstallationService} from "./services/PostInstallationService.js";


//Setup secrets and environment variables for server
dotenv.config();
const expressServer = express();
const githubAppId: number = parseInt(process.env.APP_ID ?? '0', 0);
const privateKeyPath: string = process.env.PRIVATE_KEY_PATH as string;
const privateKey: string = fs.readFileSync(privateKeyPath, 'utf8');
const appWebhookSecret: string = process.env.WEBHOOK_SECRET as string;
const port: number = parseInt(process.env.PORT || '3000', 10);
const path = '/api/webhook';
const app = new App({
  appId:githubAppId,
  privateKey,
  webhooks: {
    secret: appWebhookSecret,
  },
});
const octokitMiddleware = (req: any, res: any, next: any) => {
  createNodeMiddleware(app.webhooks, { path: '' })(req, res).catch(next);
};
expressServer.use(express.json());
expressServer.use(cors());
expressServer.use(helmet());
expressServer.post(path, octokitMiddleware);
const webSocketService = new WebSocketService(5000);

app.webhooks.on(webhookEvents.ADD_REPOSITORIES, async ({ payload }: EmitterWebhookEvent<webhookEvents.ADD_REPOSITORIES>) => {
  if (payload.action === "added" ) {
    const frogbotService = new FrogbotService(await app.getInstallationOctokit(payload.installation.id));
    await frogbotService.installFrogbotMultiple(payload.repositories_added);
  }
});

app.webhooks.on(webhookEvents.MERGED_PULL_REQUEST, async ({ payload }: EmitterWebhookEvent<webhookEvents.MERGED_PULL_REQUEST>): Promise<void> => {
  if (payload.pull_request.merged && payload.pull_request.user.login === JFROG_APP_USER_NAME) {
   const octokit = new Octokit(app.getInstallationOctokit(payload.installation.id));
    const owner: string = payload.repository.owner.login;
    const repo : string = payload.repository.name;
    const defaultBranch : string = payload.repository.default_branch;

    const postInstallationService = new PostInstallationService(octokit);
    await postInstallationService.finishUpInstallation(repo, owner, defaultBranch);
}});


expressServer.post('/submitForm', async (req: any, res: any) => {
  const { platformUrl, accessToken, installationId } = req.body;
  try {
    const setupService = new SetupService(await app.getInstallationOctokit(installationId), webSocketService);
    const response = await setupService.submitSetupForm(platformUrl, accessToken, installationId.toString());
    response.isPartial ? res.status(206).send(response.results) : res.status(200).send(response.results);
  } catch (error) {
    res.status(500).send(error.message);
  }
});


expressServer.listen(port, () => {

  console.log(`Express server listening on port ${port}`);
  console.log(`Webhook URL: http://localhost:${port}${path}`);
});
