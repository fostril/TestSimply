import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { assertSafeExternalUrl, assertSafeExternalUrlSyntax } from "@/lib/ssrf";

const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const OUTBOUND_TIMEOUT_MS = 10_000;

export interface CiClient {
    triggerWorkflow(workflowId: string, inputs?: Record<string, string>, branch?: string): Promise<{ success: boolean; message?: string; workflowUrl?: string }>;
    testConnection(): Promise<{ success: boolean; message?: string }>;
}

function validateSafeSegment(segment: string, label: string): string {
    if (!segment || segment === "." || segment === ".." || !SAFE_SEGMENT_RE.test(segment)) {
        throw new Error(`Invalid ${label}`);
    }
    return segment;
}

export class GitHubCiClient implements CiClient {
    private baseUrl: string;
    private apiBase: string;
    private webBase: string;
    private token: string;
    private owner: string;
    private repo: string;

    constructor(baseUrl: string, token: string) {
        assertSafeExternalUrlSyntax(baseUrl);
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;

        const parsed = new URL(this.baseUrl);
        const cleanPath = parsed.pathname
            .replace(/\/+$/, "")
            .replace(/\/actions(?:\/.*)?$/, "")
            .replace(/\.git$/, "");
        const parts = cleanPath.split("/").filter(Boolean);
        if (parts[0] === "repos") {
            parts.shift();
        }
        if (parts.length < 2) {
            throw new Error("Invalid GitHub repository URL. Expected format: https://github.com/owner/repo");
        }

        this.owner = validateSafeSegment(parts[0], "GitHub owner");
        this.repo = validateSafeSegment(parts[1], "GitHub repository");

        const host = parsed.hostname.toLowerCase();
        if (host === "github.com" || host === "api.github.com") {
            this.apiBase = "https://api.github.com";
            this.webBase = "https://github.com";
        } else {
            this.apiBase = `${parsed.origin}/api/v3`;
            this.webBase = parsed.origin;
        }
    }

    private get headers() {
        return {
            "Authorization": `Bearer ${this.token}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "TestSimply-CI",
        };
    }

    private get repoApiUrl() {
        return `${this.apiBase}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    }

    private async fetchRepoInfo(): Promise<{ ok: boolean; status: number; data?: any; errorText?: string }> {
        await assertSafeExternalUrl(this.repoApiUrl);
        const response = await fetch(this.repoApiUrl, {
            method: "GET",
            headers: this.headers,
            signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
        });
        if (response.ok) {
            return { ok: true, status: response.status, data: await response.json() };
        }
        return { ok: false, status: response.status, errorText: await response.text() };
    }

    async testConnection(): Promise<{ success: boolean; message?: string }> {
        await assertSafeExternalUrl(this.baseUrl);
        try {
            const res = await this.fetchRepoInfo();
            if (res.ok) {
                return {
                    success: true,
                    message: `Connected to ${res.data.full_name} (default branch: ${res.data.default_branch})`,
                };
            }
            if (res.status === 404) {
                return { success: false, message: "Repository not found. Check the URL." };
            }
            if (res.status === 401) {
                return { success: false, message: "Invalid or expired token." };
            }
            return { success: false, message: `GitHub API Error: ${res.status} - ${res.errorText}` };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    async triggerWorkflow(workflowId: string, inputs?: Record<string, string>, branch?: string): Promise<{ success: boolean; message?: string; workflowUrl?: string }> {
        await assertSafeExternalUrl(this.baseUrl);
        const safeWorkflowId = validateSafeSegment(workflowId.trim(), "workflow filename or ID");
        const apiUrl = `${this.repoApiUrl}/actions/workflows/${encodeURIComponent(safeWorkflowId)}/dispatches`;
        await assertSafeExternalUrl(apiUrl);

        try {
            let targetBranch = branch?.trim();
            if (!targetBranch) {
                const info = await this.fetchRepoInfo();
                targetBranch = info.ok && info.data?.default_branch ? String(info.data.default_branch) : "main";
            }

            const dispatch = async (payloadInputs?: Record<string, string>) =>
                fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        ...this.headers,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ref: targetBranch,
                        ...(payloadInputs && Object.keys(payloadInputs).length > 0 ? { inputs: payloadInputs } : {}),
                    }),
                    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
                });

            let response = await dispatch(inputs);
            if (response.status === 422 && inputs && Object.keys(inputs).length > 0) {
                const errBody = await response.text();
                if (errBody.includes("Unexpected inputs")) {
                    // Retry without inputs when target workflow_dispatch declares no inputs
                    response = await dispatch(undefined);
                } else {
                    return { success: false, message: `GitHub API Error: 422 - ${errBody}` };
                }
            }

            if (response.status === 204) {
                const workflowUrl = `${this.webBase}/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/actions`;
                return { success: true, workflowUrl };
            }
            const errorText = await response.text();
            return { success: false, message: `GitHub API Error: ${response.status} - ${errorText}` };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    static async forProject(projectId: string): Promise<CiClient | null> {
        return createCiClientForProject(projectId);
    }
}

export class GitLabCiClient implements CiClient {
    private baseUrl: string;
    private origin: string;
    private projectPath: string;
    private token: string;

    constructor(baseUrl: string, token: string) {
        assertSafeExternalUrlSyntax(baseUrl);
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;

        const parsed = new URL(this.baseUrl);
        this.origin = parsed.origin;
        const cleanPath = parsed.pathname
            .replace(/\/-\/.*$/, "")
            .replace(/\.git$/, "")
            .replace(/^\/+|\/+$/g, "");

        if (!cleanPath) {
            throw new Error("Invalid GitLab project URL. Expected format: https://gitlab.com/group/project");
        }
        this.projectPath = cleanPath;
    }

    private get projectApiUrl() {
        return `${this.origin}/api/v4/projects/${encodeURIComponent(this.projectPath)}`;
    }

    async testConnection(): Promise<{ success: boolean; message?: string }> {
        await assertSafeExternalUrl(this.projectApiUrl);
        try {
            const response = await fetch(this.projectApiUrl, {
                method: "GET",
                headers: {
                    "PRIVATE-TOKEN": this.token,
                    "Accept": "application/json",
                },
                signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    message: `Connected to ${data.path_with_namespace} (default branch: ${data.default_branch})`,
                };
            }
            if (response.status === 404) {
                return { success: false, message: "GitLab project not found. Check the URL." };
            }
            if (response.status === 401 || response.status === 403) {
                return { success: false, message: "Invalid or insufficient GitLab token permissions." };
            }
            const err = await response.text();
            return { success: false, message: `GitLab API Error: ${response.status} - ${err}` };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    async triggerWorkflow(workflowId: string, inputs?: Record<string, string>, branch?: string): Promise<{ success: boolean; message?: string; workflowUrl?: string }> {
        await assertSafeExternalUrl(this.projectApiUrl);
        try {
            let targetBranch = branch?.trim();
            if (!targetBranch) {
                const infoRes = await fetch(this.projectApiUrl, {
                    method: "GET",
                    headers: { "PRIVATE-TOKEN": this.token, "Accept": "application/json" },
                    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
                });
                if (infoRes.ok) {
                    const info = await infoRes.json();
                    if (info.default_branch) targetBranch = String(info.default_branch);
                }
            }
            targetBranch = targetBranch || "main";

            const variables = Object.entries({
                ...(inputs ?? {}),
                ...(workflowId?.trim() ? { TESTSIMPLY_WORKFLOW: workflowId.trim() } : {}),
            }).map(([key, value]) => ({ key, value }));

            const pipelineUrl = `${this.projectApiUrl}/pipeline`;
            const response = await fetch(pipelineUrl, {
                method: "POST",
                headers: {
                    "PRIVATE-TOKEN": this.token,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ref: targetBranch,
                    ...(variables.length > 0 ? { variables } : {}),
                }),
                signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, workflowUrl: data.web_url };
            }
            const err = await response.text();
            return { success: false, message: `GitLab API Error: ${response.status} - ${err}` };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }
}

export class JenkinsCiClient implements CiClient {
    private baseUrl: string;
    private token: string;
    private defaultJob?: string;

    constructor(baseUrl: string, token: string, defaultJob?: string) {
        assertSafeExternalUrlSyntax(baseUrl);
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.token = token;
        this.defaultJob = defaultJob?.trim() || undefined;
    }

    private get authHeader() {
        if (this.token.includes(":")) {
            return `Basic ${Buffer.from(this.token).toString("base64")}`;
        }
        return `Bearer ${this.token}`;
    }

    private resolveJobUrl(jobOverride?: string): string {
        const parsed = new URL(this.baseUrl);
        if (parsed.pathname.includes("/job/")) {
            return this.baseUrl;
        }
        const job = jobOverride?.trim() || this.defaultJob;
        if (!job) {
            return this.baseUrl;
        }
        const segments = job
            .split("/")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => encodeURIComponent(s));
        return `${this.baseUrl}/job/${segments.join("/job/")}`;
    }

    async testConnection(): Promise<{ success: boolean; message?: string }> {
        const targetUrl = `${this.resolveJobUrl()}/api/json`;
        await assertSafeExternalUrl(targetUrl);
        try {
            const response = await fetch(targetUrl, {
                method: "GET",
                headers: {
                    "Authorization": this.authHeader,
                    "Accept": "application/json",
                },
                signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
            });

            if (response.ok) {
                const data = await response.json();
                const name = data.fullDisplayName || data.name || data.nodeDescription || this.baseUrl;
                return { success: true, message: `Connected to Jenkins: ${name}` };
            }
            if (response.status === 401 || response.status === 403) {
                return { success: false, message: "Invalid Jenkins credentials (use username:apiToken)." };
            }
            if (response.status === 404) {
                return { success: false, message: "Jenkins URL or job not found." };
            }
            const err = await response.text();
            return { success: false, message: `Jenkins API Error: ${response.status} - ${err}` };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    async triggerWorkflow(workflowId: string, inputs?: Record<string, string>): Promise<{ success: boolean; message?: string; workflowUrl?: string }> {
        const jobUrl = this.resolveJobUrl(workflowId);
        await assertSafeExternalUrl(jobUrl);

        try {
            const hasInputs = Boolean(inputs && Object.keys(inputs).length > 0);
            const paramsUrl = hasInputs
                ? `${jobUrl}/buildWithParameters?${new URLSearchParams(inputs).toString()}`
                : `${jobUrl}/build`;

            let response = await fetch(paramsUrl, {
                method: "POST",
                headers: {
                    "Authorization": this.authHeader,
                },
                signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
            });

            // Fallback to /build if job is not configured as parameterized
            if (!response.ok && hasInputs && response.status >= 400 && response.status < 500) {
                response = await fetch(`${jobUrl}/build`, {
                    method: "POST",
                    headers: { "Authorization": this.authHeader },
                    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
                });
            }

            if (response.status === 200 || response.status === 201 || response.status === 202) {
                const queueLocation = response.headers.get("location");
                return { success: true, workflowUrl: queueLocation || jobUrl };
            }
            const err = await response.text();
            return { success: false, message: `Jenkins API Error: ${response.status} - ${err}` };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }
}

export async function createCiClientForProject(projectId: string): Promise<CiClient | null> {
    const settings = await prisma.projectSetting.findUnique({
        where: { projectId },
    });

    if (!settings || !settings.ciProvider || !settings.ciUrl || !settings.ciToken) {
        return null;
    }

    await assertSafeExternalUrl(settings.ciUrl);
    const decryptedToken = decrypt(settings.ciToken);

    if (settings.ciProvider === "GITHUB") {
        return new GitHubCiClient(settings.ciUrl, decryptedToken);
    }
    if (settings.ciProvider === "GITLAB") {
        return new GitLabCiClient(settings.ciUrl, decryptedToken);
    }
    if (settings.ciProvider === "JENKINS") {
        return new JenkinsCiClient(settings.ciUrl, decryptedToken, settings.ciWorkflowId ?? undefined);
    }

    return null;
}


