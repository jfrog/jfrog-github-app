export interface GitHubRepo {
    full_name: string;
    id: number;
    name: string;
    node_id: string;
    private: boolean;
}

export interface InstallationResult{
    repoName: string;
    prLink?: string;
    errormessage?: string;
    addedMaintainers?: string[];
}

export interface Secret {
    secretName: string;
    secretValue: string;
}
