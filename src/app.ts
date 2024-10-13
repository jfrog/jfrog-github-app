import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import { App } from 'octokit';
import { createNodeMiddleware, EmitterWebhookEvent } from '@octokit/webhooks';
import {FrogbotService} from "./services/FrogbotService.js";
import {GitHubRepo} from "./utils/types.js";
import {webhookEvents} from "./utils/consts.js";


//setup secrets and environment variables for server
dotenv.config();
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


app.webhooks.on(webhookEvents.ADD_REPOSITORIES, async ({ payload }: EmitterWebhookEvent<any>) => {
  console.log('Installation event received');
  if (payload.action === "added") {
    console.time('Frogbot installation time');
    const frogbotService = new FrogbotService(await app.getInstallationOctokit(payload.installation.id));
    const installFrogbotPromises = payload.repositories_added.map((repo : GitHubRepo) => frogbotService.installFrogbot(repo));
    try {
      await Promise.all(installFrogbotPromises);
      console.timeEnd('Frogbot installation time');
    } catch (error) {
      console.error('Error installing Frogbot:', error);
    }
  }
});


http.createServer(middleware).listen(port, () => {
  console.log(`Server is listening for events at: ${localWebhookUrl}`);
  console.log('Press Ctrl + C to quit.');
});
