import fs from 'fs';

export const PULL_REQUEST_DATA = {
    branchName: "jfrog-github-app/add-frogbot-configurations",
    comment: fs.readFileSync('./message.md', 'utf8'),
    prTitle: "Added Frogbot configurations",
};


export enum webhookEvents {
    ADD_REPOSITORIES = "installation_repositories",
    INSTALL_APP = "installation",
}