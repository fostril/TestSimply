# TestSimply

TestSimply is a lightweight, self-contained test management dashboard that can run entirely offline. The application ships with a Node.js-powered static server, a pre-generated dataset, and utilities for importing automated test results so you can explore the workflow without external services or package registries.

## Quick start

1. **Install Node.js 18 or newer** and install the local toolchain:
   ```bash
   npm install
   ```
   The project has no third-party dependencies, so installation works without network access.

2. **Generate demo data** (this can be repeated at any time to refresh the dataset):
   ```bash
   npm run seed
   ```

3. **Launch the dashboard** on [http://localhost:3000](http://localhost:3000):
   ```bash
   npm run dev
   ```
   The development server automatically serves both the HTML frontend and a small JSON API backed by the generated dataset.

4. **Run the unit tests** that cover the import helpers:
   ```bash
   npm test
   ```

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
