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
    errorMessage?: string;
    addedMaintainers?: string[];
}

export interface Secret {
    secretName: string;
    secretValue: string;
}

export enum InstallStages {
    VALIDATING_CREDENTIALS = 'Validating credentials',
    ADDING_GLOBAL_SECRETS = 'Adding global secrets',
    INSTALLING_FROGBOT = 'Installing Frogbot',
    FROGBOT_INSTALLED = 'Frogbot installed',
}
