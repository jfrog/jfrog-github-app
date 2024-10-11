import { Octokit } from 'octokit';
import {GitHubRepo} from "../utils/types";
import {PULL_REQUEST_DATA} from "../utils/consts";
export class FrogbotService {
    private readonly octokit: Octokit;
    constructor(octokit : Octokit) {
        this.octokit = octokit;
    }

    public async installFrogbot(repo: GitHubRepo) {
        const owner = repo.full_name.split('/')[0];
        try {
            const { data: repoData } = await this.octokit.rest.repos.get({
                repo: repo.name,
                owner
            });
            const defaultBranch = repoData.default_branch;

            await Promise.all([
                this.allowWorkflows(owner, repo.name),
                !repo.private ? this.setUpFrogbotEnvironment( owner, repo.name) : Promise.resolve(),
                this.createBranch(owner, repo.name, defaultBranch)
            ]);

            await this.addFrogbotWorkflows(owner, repo.name, defaultBranch);
            await this.openPullRequest(owner, repo.name, defaultBranch);
        } catch (error) {
            throw error;
        }
    }

    private async setUpFrogbotEnvironment(owner: string, repo: string) {
        //TODO: add reviewers funcionality
        try {
            await this.octokit.rest.repos.createOrUpdateEnvironment({
                owner,
                repo,
                environment_name: "frogbot"
            });
        } catch (error) {
            console.error('Error adding maintainers to environment:', error);
        }
    }

    private async allowWorkflows(owner: string, repo: string) {

        try {
            await this.octokit.request(`PUT /repos/${owner}/${repo}/actions/permissions`, {
                owner,
                repo,
                enabled: true,
            });
        } catch (error) {
            throw error;
        }
    }

    private async createBranch(owner: string, repo: string, defaultBranch: string) {
        try {
            const { data: refData } = await this.octokit.rest.git.getRef({
                owner,
                repo,
                ref: `heads/${defaultBranch}`,
            });

            const latestCommitSha = refData.object.sha;
            const newBranchRef = `refs/heads/${PULL_REQUEST_DATA.branchName}`;
            await this.octokit.rest.git.createRef({
                owner,
                repo,
                ref: newBranchRef,
                sha: latestCommitSha,
            });
        } catch (error) {
            console.error('Error creating branch:', error);
        }
    }

    private async addFrogbotWorkflows(owner: string, repo: string, defaultBranch: string) {
        try {
            await Promise.all([
                this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: '.github/workflows/frogbot-scan-repository.yml',
                    message: `Added frogbot-scan-repository.yml on ${PULL_REQUEST_DATA.branchName}`,
                    content: Buffer.from(this.scanRepositoryWorkflow(defaultBranch)).toString('base64'),
                    branch: PULL_REQUEST_DATA.branchName,
                }),
                this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: '.github/workflows/frogbot-scan-pull-request.yml',
                    message: `Added frogbot-scan-pull-request.yml on ${PULL_REQUEST_DATA.branchName}`,
                    content: Buffer.from(this.pullRequestWorkflow()).toString('base64'),
                    branch: PULL_REQUEST_DATA.branchName,
                }),
            ]);
        } catch (error) {
            console.error('Error adding workflows:', error);
        }
    }

    private async openPullRequest(owner: string, repo: string, defaultBranch: string) {
        await this.octokit.rest.pulls.create({
            owner,
            repo,
            head: PULL_REQUEST_DATA.branchName,
            base: defaultBranch,
            title: PULL_REQUEST_DATA.prTitle,
            body: PULL_REQUEST_DATA.comment,
        });
    }

    private pullRequestWorkflow(): string {
        return `Name: Frogbot pull request scan"
on:
  pull_request_target:
    types: [opened, synchronize]
permissions:
  pull-requests: write
  contents: read
jobs:
  scan-pull-request:
    runs-on: ubuntu-latest
    environment: frogbot
    steps:
      - uses: jfrog/frogbot@v2.21.13
        env:
          JF_URL: \${{ secrets.JF_URL }}
          JF_ACCESS_TOKEN: \${{ secrets.JF_TOKEN }}
          JF_GIT_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
    }

    private scanRepositoryWorkflow(defaultBranch: string): string {
        return `name: "Frogbot Scan Repository"
on:
  push:
    branches:
      - "${PULL_REQUEST_DATA.branchName}"
  workflow_dispatch:
  repository_dispatch:
    types:
      - trigger-frogbot-scan
  schedule:
    - cron: "0 0 * * *"

permissions:
  contents: write
  pull-requests: write
  security-events: write

jobs:
  scan-repository:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        branch: [ "${defaultBranch}" ]
    steps:
      - uses: jfrog/frogbot@v2.21.13
        env:
          JFROG_CLI_LOG_LEVEL: "DEBUG"
          JF_URL: \${{ secrets.JF_URL }}
          JF_ACCESS_TOKEN: \${{ secrets.JF_TOKEN }}
          JF_GIT_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          JF_GIT_BASE_BRANCH: \${{ matrix.branch }}`;
    }
}
