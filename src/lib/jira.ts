import { prisma } from "@/lib/prisma";

export class JiraClient {
    private baseUrl: string;
    private email: string;
    private apiToken: string;

    constructor(baseUrl: string, email: string, apiToken: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
        this.email = email;
        this.apiToken = apiToken;
    }

    private get authHeader() {
        return `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString("base64")}`;
    }

    async getIssue(issueKey: string) {
        const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}?fields=status,summary`;

        const response = await fetch(url, {
            headers: {
                Authorization: this.authHeader,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            key: data.key,
            summary: data.fields.summary,
            status: data.fields.status.name,
            statusColor: data.fields.status.statusCategory.colorName, // e.g., "green", "yellow"
        };
    }

    async createIssue(projectKey: string, summary: string, description: string, issueType: string = "Bug") {
        const url = `${this.baseUrl}/rest/api/3/issue`;

        // Basic ADF format for description if it's a string
        const descriptionADF = {
            type: "doc",
            version: 1,
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: description || "No description provided."
                        }
                    ]
                }
            ]
        };

        const body = {
            fields: {
                project: {
                    key: projectKey
                },
                summary: summary,
                description: descriptionADF,
                issuetype: {
                    name: issueType
                }
            }
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: this.authHeader,
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Jira creation failed:", JSON.stringify(errorData, null, 2));
            throw new Error(`Failed to create Jira issue: ${response.status} ${JSON.stringify(errorData.errors || errorData)}`);
        }

        const data = await response.json();
        return {
            id: data.id,
            key: data.key,
            self: data.self
        };
    }

    static async forProject(projectId: string) {
        const settings = await prisma.projectSetting.findUnique({
            where: { projectId },
        });

        if (!settings || !settings.jiraUrl || !settings.jiraEmail || !settings.jiraApiToken) {
            return null;
        }

        return new JiraClient(settings.jiraUrl, settings.jiraEmail, settings.jiraApiToken);
    }
}
