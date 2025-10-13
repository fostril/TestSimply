const projectsList = document.getElementById("projects");
const projectSummary = document.getElementById("project-summary");
const executionDetail = document.getElementById("execution-detail");
const emptyState = document.getElementById("empty-state");

let projects = [];
let activeProjectId = null;

const statusBadge = (status) => {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "PASS") return "badge badge--pass";
  if (normalized === "FAIL") return "badge badge--fail";
  return "badge badge--skipped";
};

const formatStatusLabel = (status) => {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "PASS") return "Pass";
  if (normalized === "FAIL") return "Fail";
  if (normalized === "SKIPPED") return "Skipped";
  return normalized || "Unknown";
};

const renderProjects = () => {
  projectsList.innerHTML = "";
  projects.forEach((project) => {
    const item = document.createElement("button");
    item.className = "sidebar__item" + (project.id === activeProjectId ? " sidebar__item--active" : "");
    item.innerHTML = `
      <span class="sidebar__item-title">${project.key}</span>
      <span class="sidebar__item-subtitle">${project.name}</span>
    `;
    item.addEventListener("click", () => selectProject(project.id));
    projectsList.appendChild(item);
  });
};

const renderProjectSummary = (project) => {
  if (!project) return;
  projectSummary.classList.remove("hidden");
  const metrics = `
    <div class="metrics">
      <div class="metric">
        <p class="metric__label">Test Cases</p>
        <p class="metric__value">${project.cases}</p>
      </div>
      <div class="metric">
        <p class="metric__label">Executions</p>
        <p class="metric__value">${project.executions}</p>
      </div>
      <div class="metric">
        <p class="metric__label">Last Run</p>
        <p class="metric__value">${project.latestExecution ? project.latestExecution.name : "—"}</p>
      </div>
    </div>
  `;

  let latest = "";
  if (project.latestExecution) {
    const latestExec = project.latestExecution;
    latest = `
      <div class="metrics">
        <div class="metric">
          <p class="metric__label">Passed</p>
          <p class="metric__value">${latestExec.passCount}</p>
        </div>
        <div class="metric">
          <p class="metric__label">Failed</p>
          <p class="metric__value">${latestExec.failCount}</p>
        </div>
        <div class="metric">
          <p class="metric__label">Skipped</p>
          <p class="metric__value">${latestExec.skippedCount}</p>
        </div>
      </div>
    `;
  }

  projectSummary.innerHTML = `
    <h2>${project.name}</h2>
    <p>${project.description ?? ""}</p>
    ${metrics}
    ${latest}
  `;
};

const renderExecutionDetail = async (executionId) => {
  if (!executionId) {
    executionDetail.classList.add("hidden");
    return;
  }
  const response = await fetch(`/api/executions/${executionId}`);
  if (!response.ok) {
    executionDetail.classList.add("hidden");
    return;
  }
  const payload = await response.json();
  executionDetail.classList.remove("hidden");
  executionDetail.innerHTML = `
    <h2>${payload.execution.name} <span class="badge">${payload.execution.environment ?? "Unknown env"}</span></h2>
    <div class="metrics">
      <div class="metric">
        <p class="metric__label">Pass</p>
        <p class="metric__value">${payload.aggregates.PASS}</p>
      </div>
      <div class="metric">
        <p class="metric__label">Fail</p>
        <p class="metric__value">${payload.aggregates.FAIL}</p>
      </div>
      <div class="metric">
        <p class="metric__label">Skipped</p>
        <p class="metric__value">${payload.aggregates.SKIPPED}</p>
      </div>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>Case</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${payload.results
          .map(
            (result) => `
              <tr>
                <td>
                  <strong>${result.caseKey}</strong>
                  <div class="sidebar__item-subtitle">${result.caseName}</div>
                </td>
                <td><span class="${statusBadge(result.status)}">${formatStatusLabel(result.status)}</span></td>
                <td>${result.durationMs ? `${(result.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                <td>${result.errorMessage ?? "—"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const selectProject = async (projectId) => {
  activeProjectId = projectId;
  const project = projects.find((item) => item.id === projectId);
  renderProjects();
  renderProjectSummary(project);
  if (project?.latestExecution?.id) {
    await renderExecutionDetail(project.latestExecution.id);
    emptyState.classList.add("hidden");
  } else {
    executionDetail.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }
};

const bootstrap = async () => {
  const response = await fetch("/api/projects");
  if (!response.ok) {
    projectsList.innerHTML = "<li>Unable to load projects</li>";
    return;
  }
  projects = await response.json();
  renderProjects();
  if (projects[0]) {
    selectProject(projects[0].id);
  }
};

bootstrap().catch((error) => {
  console.error(error);
  projectsList.innerHTML = "<li>Failed to initialise dashboard</li>";
});
