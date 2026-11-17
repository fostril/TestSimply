import fs from "fs";
import path from "path";

async function main() {
    const reportPath = path.join(process.cwd(), "junit-report.xml");
    const fileContent = fs.readFileSync(reportPath, "utf-8");

    // Create a boundary for the multipart request
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";

    // Construct the multipart body manually since we are in node environment without FormData easily available in this context 
    // (or we could use 'undici' or 'form-data' package if installed, but let's keep it dependency-free if possible or use native fetch with FormData if Node version supports it).
    // Node 18+ supports global fetch and FormData.

    const formData = new FormData();
    const blob = new Blob([fileContent], { type: "application/xml" });
    formData.append("report", blob, "junit-report.xml");

    const projectKey = "QA"; // Assuming QA project exists
    const execKey = `CI-SIM-${Date.now()}`;
    const buildUrl = "https://github.com/myorg/myrepo/actions/runs/123456";
    const commitSha = "a1b2c3d4e5f6";

    const url = `http://localhost:3000/api/import/junit?projectKey=${projectKey}&execKey=${execKey}&createExecutionIfMissing=true&autoCreateCases=true&buildUrl=${encodeURIComponent(buildUrl)}&commitSha=${commitSha}`;

    const token = process.env.TESTSIMPLY_TOKEN;
    if (!token) {
        console.warn("Warning: TESTSIMPLY_TOKEN is not set; request may fail with 401.");
    }

    console.log(`Simulating CI run for project ${projectKey}...`);
    console.log(`Uploading to: ${url}`);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: formData,
            // Note: When using FormData with fetch, do NOT set Content-Type header manually, 
            // the browser/environment sets it with the boundary.
        });

        if (res.ok) {
            const json = await res.json();
            console.log("Success!", json);
            console.log(`Execution created with Key: ${execKey}`);
        } else {
            const text = await res.text();
            console.error("Failed:", res.status, text);
        }
    } catch (e) {
        console.error("Error during fetch:", e);
    }
}

main();
