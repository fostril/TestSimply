const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const url = require("node:url");

const DATA_PATH = path.resolve(__dirname, "../data/demo-data.json");
const PUBLIC_DIR = path.resolve(__dirname, "../web");
const PORT = Number(process.env.PORT ?? 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const loadData = () => {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return {
      projects: [],
      cases: [],
      plans: [],
      executions: [],
      results: [],
      users: [],
      tokens: [],
      requirements: [],
      attachments: [],
      accounts: [],
      sessions: [],
      verificationTokens: []
    };
  }
};

const buildSummary = (data) => {
  return data.projects.map((project) => {
    const projectCases = data.cases.filter((testCase) => testCase.projectId === project.id);
    const projectExecutions = data.executions.filter((execution) => execution.projectId === project.id);
    const latestExecution = projectExecutions.at(-1);
    const executionResults = latestExecution
      ? data.results.filter((result) => result.executionId === latestExecution.id)
      : [];

    const passCount = executionResults.filter((result) => result.status === "PASS").length;
    const failCount = executionResults.filter((result) => result.status === "FAIL").length;
    const skippedCount = executionResults.filter((result) => result.status === "SKIPPED").length;

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
      cases: projectCases.length,
      executions: projectExecutions.length,
      latestExecution: latestExecution
        ? {
            id: latestExecution.id,
            name: latestExecution.name,
            environment: latestExecution.environment,
            passCount,
            failCount,
            skippedCount,
            total: executionResults.length
          }
        : null
    };
  });
};

const buildExecutionDetail = (data, executionId) => {
  const execution = data.executions.find((item) => item.id === executionId);
  if (!execution) return null;
  const project = data.projects.find((proj) => proj.id === execution.projectId);
  const results = data.results
    .filter((result) => result.executionId === execution.id)
    .map((result) => {
      const testCase = data.cases.find((item) => item.id === result.caseId);
      return {
        id: result.id,
        caseKey: testCase?.key ?? "Unknown",
        caseName: testCase?.name ?? "Unknown case",
        status: result.status,
        durationMs: result.durationMs,
        errorMessage: result.errorMessage,
        stepsLog: result.stepsLog ?? []
      };
    });

  const aggregates = {
    PASS: results.filter((result) => result.status === "PASS").length,
    FAIL: results.filter((result) => result.status === "FAIL").length,
    SKIPPED: results.filter((result) => result.status === "SKIPPED").length
  };

  return {
    execution: {
      id: execution.id,
      name: execution.name,
      key: execution.key,
      environment: execution.environment,
      projectName: project?.name ?? "Unknown project"
    },
    results,
    aggregates
  };
};

const serveStaticFile = (filePath, res) => {
  const ext = path.extname(filePath);
  const mime = mimeTypes[ext] ?? "application/octet-stream";
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
};

const server = http.createServer((req, res) => {
  const data = loadData();
  const parsed = url.parse(req.url ?? "/", true);

  if (parsed.pathname === "/api/projects") {
    const summary = buildSummary(data);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(summary));
    return;
  }

  if (parsed.pathname?.startsWith("/api/executions/")) {
    const executionId = parsed.pathname.split("/").at(-1);
    const detail = buildExecutionDetail(data, executionId);
    if (!detail) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Execution not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(detail));
    return;
  }

  let relativePath = parsed.pathname;
  if (!relativePath || relativePath === "/") {
    relativePath = "/index.html";
  }
  const safePath = path.normalize(relativePath).replace(/^\.\/+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  serveStaticFile(filePath, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TestSimply local dashboard available at http://localhost:${PORT}`);
});
