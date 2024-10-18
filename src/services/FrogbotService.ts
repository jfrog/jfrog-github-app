
import { Octokit } from 'octokit';
import {GitHubRepo, InstallationResult, InstallStages} from "../utils/types.js";
import {PULL_REQUEST_DATA} from "../utils/consts.js";
import { v4 as uuidv4 } from 'uuid';
import {scanRepositoryWorkflow, pullRequestWorkflow} from "../utils/utils.js";
import {WebSocketService} from "./WebsocketService.js";

 export class FrogbotService {
    private readonly octokit: Octokit;
    constructor(octokit : Octokit) {
        this.octokit = octokit;
    }

    public async installFrogbotMultiple(repos: GitHubRepo[], installationId?:number, websocket? : WebSocketService) {
        const results: InstallationResult[] = [];
        for (const repo of repos) {
            const result = await this.installFrogbot(repo);
            if(installationId && websocket) {
                websocket.sendMessageToClient(installationId, JSON.stringify({
                    status: InstallStages.FROGBOT_INSTALLED,
                    repo: repo.name
                }));
            }
            results.push(result);
        }
        const isPartial: boolean = results.some(result => result.errorMessage);

        return { results, isPartial };
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
                this.allowWorkflowsOnRepo(owner, repo.name),
                this.setUpFrogbotEnvironment( owner, repo.name, repo.private),
                this.createBranch(owner, repo.name, defaultBranch, sourceBranch)
            ]);

            await this.addFrogbotWorkflows(owner, repo.name, defaultBranch, sourceBranch);
           result.prLink = await this.openPullRequest(owner, repo.name, defaultBranch, sourceBranch);
        } catch (error) {
            result.errorMessage = error.message;
        }
        return result;
    }

     private async setUpFrogbotEnvironment(owner: string, repo: string, isPublic: boolean) : Promise<void> {
        const GITHUB_MAX_REVIEWERS = 6;
         try {
             if(isPublic){
                 const collaborators = await this.octokit.rest.repos.listCollaborators({
                 owner,
                 repo,
                 affiliation: 'direct',
                 permission: 'maintain',
             });

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
                     return team;
                 }
                 return null;
             });

             const teams = (await Promise.all(teamPromises))
                 .filter((team): team is NonNullable<typeof team> => team !== null)
                 .slice(0, GITHUB_MAX_REVIEWERS);

             const reviewers = [
                 ...collaborators.data.map((collab) => ({
                     type: 'User' as const,
                     id: collab.id,
                 })),
                 ...teams.map((team) => ({
                     type: 'Team' as const,
                     id: team.id,
                 })),
             ].slice(0, GITHUB_MAX_REVIEWERS);

             await this.octokit.rest.repos.createOrUpdateEnvironment({
                 owner,
                 repo,
                 environment_name: 'frogbot',
                 reviewers,
             });
         }
         else{
                await this.octokit.rest.repos.createOrUpdateEnvironment({
                    owner,
                    repo,
                    environment_name: 'frogbot',
                });
            }
         } catch (error) {
             throw new Error('Failed creating Frogbot environment with reviewers');
         }
     }


     private async allowWorkflowsOnRepo(owner: string, repo: string): Promise<void> {
         try {
             await Promise.all([
                 this.octokit.rest.actions.setGithubActionsPermissionsRepository({
                     owner,
                     repo,
                     enabled: true,
                 }),
                 this.octokit.rest.actions.setGithubActionsDefaultWorkflowPermissionsRepository({
                     owner,
                     repo,
                     can_approve_pull_request_reviews: true,
                     default_workflow_permissions: 'write'
                 })
             ]);
         } catch (error) {
             console.log(error);
             throw new Error("Failed to enable workflows");
         }
     }


     private async createBranch(owner: string, repo: string, defaultBranch: string, sourceBranch : string) : Promise<void> {
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
            throw new Error('Failed to create branch');
        }
    }

    private async addFrogbotWorkflows(owner: string, repo: string, defaultBranch: string, sourceBranch : string) : Promise<void> {
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
            if(error.status === 422){
                throw new Error('failed to add workflows, Frogbot configurations already exists!');
            }
            throw new Error('failed to add workflows');
        }
    }

    private async openPullRequest(owner: string, repo: string, defaultBranch: string, sourceBranch : string):Promise<string> {
        try {
            const response = await this.octokit.rest.pulls.create({
                owner,
                repo,
                head: sourceBranch,
                base: defaultBranch,
                title: PULL_REQUEST_DATA.prTitle,
                body: PULL_REQUEST_DATA.comment,
            });
            return response.data.html_url;
        } catch (error) {
            throw new Error('failed to open pull request');
        }
    }
}
