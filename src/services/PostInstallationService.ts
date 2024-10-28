import {Octokit} from "octokit";


export class PostInstallationService {
    private readonly octokit: Octokit;
    constructor(octokit : Octokit) {
        this.octokit = octokit;
    }

    public async finishUpInstallation(repo: string, owner: string, defaultBranch: string): Promise<void> {
        await Promise.all([
            this.runScanRepository(owner, repo, defaultBranch),
            // this.runScanPullRequest(owner, repo)
        ]);
    }


    private async runScanPullRequest( owner: string, repo: string) {
        try {
            const { data: pullRequests } = await this.octokit.rest.pulls.list({
                owner: owner,
                repo: repo,
                state: 'open',
            });

            const workflowPromises = pullRequests.map(async (pr) => {
                const branch = pr.head.ref;
                console.log(`Triggering workflow for PR #${pr.number} on branch ${branch}`);

                return this.octokit.rest.actions.createWorkflowDispatch({
                    owner: owner,
                    repo: repo,
                    workflow_id: 'frogbot-scan-pull-request',
                    ref: branch,
                });
            });
            await Promise.all(workflowPromises);
            console.log(`Workflows triggered successfully for all open pull requests.`);
        } catch (error) {
            console.error(`Error triggering workflows: ${error.message}`);
        }
    };

    private runScanRepository = async (owner: string, repo: string , branch: string) => {
        try {
            await this.octokit.rest.actions.createWorkflowDispatch({
                owner: owner,
                repo: repo,
                workflow_id: 'frogbot-scan-repository.yml',
                ref: branch,
            });
            console.log("Workflow triggered successfully for the main branch");
        } catch (error) {
            console.error("Failed to trigger workflow:", error.message);
        }
    }
}
