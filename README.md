# TestSimply

TestSimply is a lightweight, self-contained test management dashboard that can run entirely offline. The application ships with a Node.js-powered static server, a pre-generated dataset, and utilities for importing automated test results so you can explore the workflow without external services or package registries.

## Current status

This repository does **not** implement the production-ready Next.js + Prisma
stack that was requested. The existing code only serves a static HTML demo and a
read-only JSON API powered by files in `data/demo-data.json`. There is no
database, authentication, RBAC, or ability to create/update/delete projects,
test cases, plans, executions, or results through a UI or API.

Because of these limitations, the acceptance criteria outlined in the original
requirements document are **not met**.

## Running the existing demo

1. **Install Node.js 18 or newer** (no additional dependencies are required).

2. **Install packages** (this step is optional because the project has no npm
   dependencies, but running it ensures your lockfile is up to date):
   ```bash
   npm install
   ```

3. **Generate demo data** (re-run any time you want to reset the sample
   content):
   ```bash
   npm run seed
   ```

4. **Launch the static dashboard** on
   [http://localhost:3000](http://localhost:3000):
   ```bash
   npm run dev
   ```
   This serves the prebuilt HTML located in `web/` alongside a lightweight JSON
   API that exposes a project summary and execution details from the data file.

5. **Run the unit tests** that cover the import helpers:
   ```bash
   npm test
   ```

## Adding your own data

Until a real database-backed backend is implemented, the only way to create
projects, test cases, executions, or results is to edit the JSON file directly:

1. Stop the dev server if it is running.
2. Open `data/demo-data.json` in your editor.
3. Add or modify objects inside the relevant arrays (`projects`, `cases`,
   `executions`, `results`, etc.). Each entity follows the shapes documented in
   [`docs/openapi.yaml`](docs/openapi.yaml), but none of the validation or
   workflow logic is currently enforced.
4. Save the file and restart the server with `npm run dev` to see your changes.

Please note that these manual edits are not safeguarded by migrations or
business rules, so typos or inconsistent references can easily break the demo.
Implementing the full Next.js + Prisma stack with RBAC, dashboards, imports,
and automation would require significant additional development work that is not
present in this codebase.

## What’s included

- **Interactive dashboard** – browse demo projects, inspect the most recent execution, and review case-level status without needing React or Next.js.
- **Offline dataset** – data lives in `data/demo-data.json`; regenerate it with `npm run seed` to start fresh.
- **JUnit & Cucumber importers** – pure Node.js modules for translating reports into the in-memory Prisma-style client used across the tools.
- **CSV helpers** – zero-dependency CSV parser/exporter to move test cases in and out of the system.
- **Prisma-compatible client** – a minimal implementation that persists to JSON and powers both the API endpoints and the importer utilities.

## Development scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local dashboard server on port 3000. |
| `npm run start` | Alias of `npm run dev` for parity with hosted environments. |
| `npm run seed` | Regenerate `data/demo-data.json` with deterministic demo data. |
| `npm test` | Execute the Node.js unit tests for the import utilities. |

## Importing automated results

Use the importer helpers directly in your own scripts or pipelines. They accept a Prisma-style client, so you can plug in the lightweight JSON-backed implementation or your own adapter.

```js
const { importJUnit } = require("./src/lib/importers/junit.js");
const { importCucumber } = require("./src/lib/importers/cucumber.js");
const { prisma } = require("./src/lib/prisma.js");

await importJUnit(junitXml, { projectId, executionId }, prisma);
await importCucumber(cucumberJson, { projectId, executionId }, prisma);
```

## CSV template

A ready-to-use CSV template lives in [`docs/csv-template.csv`](docs/csv-template.csv). Import format:

| Column | Description |
| --- | --- |
| `name` | Test case name |
| `description` | Markdown description |
| `precondition` | Preconditions |
| `steps.action` | Pipe separated step actions |
| `steps.expected` | Pipe separated expected results |
| `expected_result` | Final expected result |
| `tags` | Comma separated labels |

## Architecture notes

- The historical Next.js codebase remains in `src/app` for reference, but the offline runtime relies on the handcrafted assets in `web/`.
- The Prisma client in `src/lib/prisma-client.{ts,js}` writes to JSON, mirroring the APIs used by the import helpers and adapter utilities.
- Authentication helpers (`src/lib/auth.ts`) are retained for context but are not wired to the offline server.

## License

MIT
