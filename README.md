# Welcome to the JFrog GitHub App!

The **JFrog GitHub App** simplifies the process of integrating **Frogbot** into your organization's repositories. Follow the steps below to get started:

## Getting Started

1. **Install the App**: Go to the [GitHub Marketplace](#) and install the JFrog GitHub App.
2. **Select Repositories**: Choose the repositories where Frogbots should be added.
3. **Complete the Setup Form**: Fill out the form with your **JFrog Platform URL** and **Access Token**.
4. **Approve Pull Requests**: Review and approve the pull requests created for each repository.

## Setup Process

After installation, you'll be redirected to a setup page where you must enter your **JFrog Platform URL** and **Access Token**. This information is securely stored as **Organization Secrets** to authenticate the app with the JFrog platform.

## Behind the Scenes

When the JFrog GitHub App is installed, it performs the following actions:

- **Adds Global Secrets**: The app stores the **JFrog Access Token** and **Platform URL** in the organization's secrets.
- **Enables Repository Workflows**: It allows the required workflows for each selected repository.
- **Creates a Frogbot Environment**: A **Frogbot** environment is created automatically for public repositories.
- **Opens a Branch**: The app opens a branch to add Frogbot workflows for pull requests and CI pipelines.
- **Creates a Pull Request**: A pull request with the required changes is automatically opened for Frogbot integration.

---

Thank you for using the **JFrog GitHub App**! We're excited to help streamline your repository management with Frogbot.
