import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { assertSafeExternalUrl, assertSafeExternalUrlSyntax } from "@/lib/ssrf";

export class JiraClient {
    private baseUrl: string;
    private email: string;
    private apiToken: string;

    constructor(baseUrl: string, email: string, apiToken: string) {
        // Ensures scheme/hostname/literal-IP are safe synchronously
        assertSafeExternalUrlSyntax(baseUrl);
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.email = email;
        this.apiToken = apiToken;
    }

    private get authHeader() {
        return `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString("base64")}`;
    }

    async testConnection(projectKey?: string | null): Promise<{ success: boolean; message?: string }> {
        await assertSafeExternalUrl(this.baseUrl);
        try {
            const meRes = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(10_000),
            });
            if (!meRes.ok) {
                if (meRes.status === 401 || meRes.status === 403) {
                    return { success: false, message: "Invalid Jira email or API token." };
                }
                return { success: false, message: `Jira API Error: ${meRes.status} ${meRes.statusText}` };
            }
            const me = await meRes.json();

            if (projectKey?.trim()) {
                const projRes = await fetch(
                    `${this.baseUrl}/rest/api/3/project/${encodeURIComponent(projectKey.trim())}`,
                    {
                        headers: {
                            Authorization: this.authHeader,
                            Accept: "application/json",
                        },
                        signal: AbortSignal.timeout(10_000),
                    },
                );
                if (!projRes.ok) {
                    return {
                        success: false,
                        message: `Authenticated as ${me.displayName || me.emailAddress}, but project "${projectKey.trim()}" was not found (${projRes.status}).`,
                    };
                }
                const proj = await projRes.json();
                return {
                    success: true,
                    message: `Connected to ${proj.name} (${proj.key}) as ${me.displayName || me.emailAddress}`,
                };
            }

            return {
                success: true,
                message: `Connected to Jira as ${me.displayName || me.emailAddress}`,
            };
        } catch (err) {
            return { success: false, message: (err as Error).message };
        }
    }

    async getIssue(issueKey: string) {
        await assertSafeExternalUrl(this.baseUrl);
        const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status,summary`;

        const response = await fetch(url, {
            headers: {
                Authorization: this.authHeader,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(10_000),
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
        await assertSafeExternalUrl(this.baseUrl);
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
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
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

        await assertSafeExternalUrl(settings.jiraUrl);
        const decryptedToken = decrypt(settings.jiraApiToken);
        return new JiraClient(settings.jiraUrl, settings.jiraEmail, decryptedToken);
    }
}
