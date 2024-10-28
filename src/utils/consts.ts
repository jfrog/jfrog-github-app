import fs from 'fs';

export const PULL_REQUEST_DATA = {
    branchName: "jfrog-github-app/add-frogbot-configurations",
    comment: fs.readFileSync('./message.md', 'utf8'),
    prTitle: "Set Up Frogbot Capabilities for Security and Compliance",
};


export enum webhookEvents {
    ADD_REPOSITORIES = "installation_repositories",
    MERGED_PULL_REQUEST = "pull_request.closed",
}

export const JFROG_APP_USER_NAME = 'jfrog-app[bot]';
