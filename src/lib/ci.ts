import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export interface CiClient {
    triggerWorkflow(workflowId: string, inputs?: Record<string, string>): Promise<{ success: boolean; message?: string; workflowUrl?: string }>;
    testConnection(): Promise<{ success: boolean; message?: string }>;
}

export class GitHubCiClient implements CiClient {
    private baseUrl: string;
    private token: string;
    private owner: string;
    private repo: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;

        // Parse owner and repo from URL (e.g., https://github.com/owner/repo or https://api.github.com/repos/owner/repo)
        // Simple heuristic: take the last two segments
        const parts = this.baseUrl.split("/").filter(Boolean);
        if (parts.length >= 2) {
            this.repo = parts[parts.length - 1];
            this.owner = parts[parts.length - 2];
        } else {
            throw new Error("Invalid GitHub URL. Expected format: https://github.com/owner/repo");
        }
    }

    async testConnection(): Promise<{ success: boolean; message?: string }> {
        // Test by fetching repository info
        const apiUrl = `https://api.github.com/repos/${this.owner}/${this.repo}`;

        try {
            const response = await fetch(apiUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "TestSimply-CI",
                },
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, message: `Connected to ${data.full_name}` };
            } else if (response.status === 404) {
                return { success: false, message: "Repository not found. Check the URL." };
            } else if (response.status === 401) {
                return { success: false, message: "Invalid or expired token." };
            } else {
                const errorText = await response.text();
                return { success: false, message: `GitHub API Error: ${response.status} - ${errorText}` };
            }
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    async triggerWorkflow(workflowId: string, inputs?: Record<string, string>): Promise<{ success: boolean; message?: string; workflowUrl?: string }> {
        // GitHub API: POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
        const apiUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/dispatches`;

        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                    "Accept": "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                    "User-Agent": "TestSimply-CI",
                },
                body: JSON.stringify({
                    ref: "main", // Default to main branch
                    inputs: inputs || {},
                }),
            });

            if (response.status === 204) {
                // Build the URL to the Actions tab
                const workflowUrl = `https://github.com/${this.owner}/${this.repo}/actions`;
                return { success: true, workflowUrl };
            } else {
                const errorText = await response.text();
                return { success: false, message: `GitHub API Error: ${response.status} - ${errorText}` };
            }
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    static async forProject(projectId: string): Promise<CiClient | null> {
        const settings = await prisma.projectSetting.findUnique({
            where: { projectId },
        });

        if (!settings || !settings.ciProvider || !settings.ciUrl || !settings.ciToken) {
            return null;
        }

        // Decrypt the CI token before use
        const decryptedToken = decrypt(settings.ciToken);

        if (settings.ciProvider === "GITHUB") {
            return new GitHubCiClient(settings.ciUrl, decryptedToken);
        }

        // Future: Add GitLab/Jenkins support here
        return null;
    }
}


