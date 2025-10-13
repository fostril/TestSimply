# TestSimply

TestSimply is a modern test management tool inspired by Jira Xray. It provides an opinionated workflow for managing manual and automated quality assets with a polished Next.js 14 experience.

## Features
- Project level dashboards with execution trend visualizations
- Rich test case management with markdown descriptions, steps, tags, and components
- Test plans with coverage tracking and bulk case assignment
- Manual execution runner with inline step validation
- Automated result ingestion for JUnit XML and Cucumber JSON
- CSV import/export for offline editing
- Role-based access control with NextAuth (email/password & OAuth)
- REST API with OpenAPI specification
- Dockerized development environment and GitHub Actions CI pipeline

## Quick start
1. Copy the environment template:

```bash
cp .env.example .env.local
```

2. Start the stack (Next.js app, PostgreSQL, and Mailhog):

```bash
docker compose up --build
```

3. Apply Prisma migrations and seed demo data:

```bash
npm install
npx prisma migrate deploy
npm run seed
```

4. Sign in using the seeded admin account:

- **Email**: `admin@testsimplify.io`
- **Password**: `password`

Mailhog is available at [http://localhost:8025](http://localhost:8025).

## OAuth configuration
Set the following environment variables before starting the app if you want to enable social login:

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

The OAuth buttons automatically hide when credentials are not configured.

## Importing automated results

### JUnit XML
```bash
curl -X POST "http://localhost:3000/api/import/junit?projectKey=PRJ-1&execKey=PRJ-1-EXEC-1&createExecutionIfMissing=true" \
  -H "Authorization: Bearer <PERSONAL_TOKEN>" \
  -F "report=@junit.xml"
```

### Cucumber JSON
```bash
curl -X POST "http://localhost:3000/api/import/cucumber?projectKey=PRJ-1&execKey=PRJ-1-EXEC-1&autoCreateCases=true" \
  -H "Authorization: Bearer <PERSONAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d @cucumber.json
```

Personal access tokens can be generated from **Settings → CI Personal Token**.

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

## REST API
The full API contract is documented in [`docs/openapi.yaml`](docs/openapi.yaml). Import the [`docs/postman_collection.json`](docs/postman_collection.json) into Postman or Insomnia for ready-made examples.

## Development scripts
- `npm run dev` – start Next.js in development mode
- `npm run lint` – lint TypeScript/React via ESLint
- `npm run test` – run unit tests with Vitest
- `npm run test:e2e` – run Playwright smoke tests
- `npm run build` – create a production build
- `npm run seed` – populate the database with demo data

## CI integration
The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that installs dependencies, runs Prisma, executes lint/unit tests, and builds the app. Example GitHub Actions step to upload JUnit results:

```yaml
- name: Publish JUnit results
  run: |
    curl -X POST "${{ secrets.TESTSIMPLY_URL }}/api/import/junit?projectKey=PRJ-1&execKey=${{ github.run_number }}" \
      -H "Authorization: Bearer ${{ secrets.TESTSIMPLY_TOKEN }}" \
      -F "report=@junit.xml"
```

## OpenAPI client generation
Use `npx openapi-typescript docs/openapi.yaml -o src/types/api.d.ts` to generate typed clients for the REST interface.

## License
MIT
