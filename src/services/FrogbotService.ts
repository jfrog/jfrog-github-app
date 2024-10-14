
import { Octokit } from 'octokit';
import {GitHubRepo, InstallationResult} from "../utils/types.js";
import {PULL_REQUEST_DATA} from "../utils/consts.js";
import { v4 as uuidv4 } from 'uuid';
import {scanRepositoryWorkflow, pullRequestWorkflow} from "../utils/utils.js";

 export class FrogbotService {
    private readonly octokit: Octokit;
    constructor(octokit : Octokit) {
        this.octokit = octokit;
    }

    public async installFrogbot(repo: GitHubRepo): Promise<InstallationResult> {
        const result : InstallationResult = {
            repoName:repo.name,
        };
        const owner = repo.full_name.split('/')[0];
        const sourceBranch = PULL_REQUEST_DATA.branchName + "-" + uuidv4();

        try {
            const { data: repoData } = await this.octokit.rest.repos.get({
                repo: repo.name,
                owner
            });
            const defaultBranch = repoData.default_branch;

            await Promise.all([
                this.allowWorkflows(owner, repo.name),
                !repo.private ? this.setUpFrogbotEnvironment( owner, repo.name) : Promise.resolve(),
                this.createBranch(owner, repo.name, defaultBranch, sourceBranch)
            ]);

            await this.addFrogbotWorkflows(owner, repo.name, defaultBranch, sourceBranch);
           result.prLink = await this.openPullRequest(owner, repo.name, defaultBranch, sourceBranch);
           return result;
        } catch (error) {
            throw error;
        }
    }

     private async setUpFrogbotEnvironment(owner: string, repo: string) {
         try {
             const collaborators = await this.octokit.rest.repos.listCollaborators({
                 owner,
                 repo,
                 affiliation: 'direct',
                 permission: 'maintain',
             });

             console.log(collaborators);

             const allTeamsResponse = await this.octokit.rest.teams.list({
                 org: owner,
             });

             const teamPromises = allTeamsResponse.data.map(async (team) => {
                 const permissionResponse = await this.octokit.rest.teams.checkPermissionsForRepoInOrg({
                     org: owner,
                     team_slug: team.slug,
                     owner,
                     repo,
                 });
                 if (permissionResponse.data.permissions.admin || permissionResponse.data.permissions.maintain) {
                     return team.slug;
                 }
                 return null;
             });

             // Await all promises and filter out null values
             const teams = (await Promise.all(teamPromises)).filter((teamSlugs : string) => teamSlugs !== null).slice(0, 6);

             await this.octokit.rest.repos.createOrUpdateEnvironment({
                 owner,
                 repo,
                 environment_name: 'frogbot',
                 protection_rules: {
                     reviewers: [ ...teams,
                         ...collaborators.data.map((collab) => collab.login),
                     ].slice(0, 6),
                 },
             });

         } catch (error) {
             console.error('Error creating Frogbot environment with reviewers:', error);
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

    private async createBranch(owner: string, repo: string, defaultBranch: string, sourceBranch : string) {
        try {
            const { data: refData } = await this.octokit.rest.git.getRef({
                owner,
                repo,
                ref: `heads/${defaultBranch}`,
            });

            const latestCommitSha = refData.object.sha;
            const newBranchRef = `refs/heads/${sourceBranch}`;
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

    private async addFrogbotWorkflows(owner: string, repo: string, defaultBranch: string, sourceBranch : string) {
        try {
            await Promise.all([
                this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: '.github/workflows/frogbot-scan-repository.yml',
                    message: `Added frogbot-scan-repository.yml on ${sourceBranch}`,
                    content: Buffer.from(scanRepositoryWorkflow(defaultBranch)).toString('base64'),
                    branch: sourceBranch,
                }),
                this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: '.github/workflows/frogbot-scan-pull-request.yml',
                    message: `Added frogbot-scan-pull-request.yml on ${sourceBranch}`,
                    content: Buffer.from(pullRequestWorkflow()).toString('base64'),
                    branch: sourceBranch
                }),
            ]);
        } catch (error) {
            console.error('Error adding workflows:', error);
        }
    }

    private async openPullRequest(owner: string, repo: string, defaultBranch: string, sourceBranch : string):Promise<string> {
        const response = await this.octokit.rest.pulls.create({
            owner,
            repo,
            head: sourceBranch,
            base: defaultBranch,
            title: PULL_REQUEST_DATA.prTitle,
            body: PULL_REQUEST_DATA.comment,
        });
        return response.data.html_url;
    }
}
