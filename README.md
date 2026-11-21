# TestSimply

TestSimply is a self-hostable test management platform inspired by Jira Xray.
It covers the full manual and automated testing lifecycle: a hierarchical test
repository with drag-and-drop folders, manual / BDD (Gherkin) / automated test
types, reusable preconditions, environments, test plans and sets, executions
with per-step results and keyboard-driven manual running, bug tracking,
requirements, a traceability matrix, CSV round-tripping, Jira Cloud & CI/CD
integrations (GitHub Actions, GitLab CI, Jenkins), and REST + browser imports
for JUnit XML and Cucumber JSON reports.

The stack is **Next.js 14 (App Router)** with **Prisma + PostgreSQL**, **NextAuth**
for authentication (email/password + optional GitHub/Google OAuth), TailwindCSS
(clean light SaaS UI), TanStack Query, React Hook Form + Zod, and
Vitest/Playwright for testing.

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Manual local setup](#manual-local-setup)
- [Environment variables](#environment-variables)
- [Seeded accounts & RBAC permissions](#seeded-accounts--rbac-permissions)
- [Promoting an admin](#promoting-an-admin)
- [Testing & quality gates](#testing--quality-gates)
- [Deployment](#deployment)
  - [Option A — Docker Compose (single host)](#option-a--docker-compose-single-host)
  - [Option B — Container image on your own infra](#option-b--container-image-on-your-own-infra)
  - [Option C — Node process behind a reverse proxy](#option-c--node-process-behind-a-reverse-proxy)
  - [Running migrations on deploy](#running-migrations-on-deploy)
  - [Reverse proxy / TLS](#reverse-proxy--tls)
  - [Health check](#health-check)
  - [Backups](#backups)
  - [Upgrading](#upgrading)
- [CI/CD & Jira integrations](#cicd--jira-integrations)
- [Feature overview](#feature-overview)
- [Security architecture](#security-architecture)
- [License](#license)

---

## Prerequisites

- **Node.js 20 LTS+** (the Docker image uses `node:20-alpine`; local dev works
  on Node 20+).
- **Docker** + **Docker Compose v2** (for running the full containerized stack
  or the bundled Postgres/Mailhog services).
- **PostgreSQL 13+** (if you are not using the bundled container).
- **OpenSSL** (or any CSPRNG) to generate secrets.

---

## Quick start (local)

```bash
# 1. clone and install
git clone <your fork url> TestSimply && cd TestSimply
npm install

# 2. create your env file
cp .env.example .env
# then edit .env and set NEXTAUTH_SECRET + ENCRYPTION_KEY (see below)

# 3. start Postgres + Mailhog, run migrations, seed demo data
./scripts/setup-local.sh

# 4. start the app
npm run dev
```

Open <http://localhost:3000> and sign in with one of the
[seeded accounts](#seeded-accounts--rbac-permissions).

The setup script will:

1. Start the `db` (PostgreSQL 15) and `mailhog` containers from
   `docker-compose.yml` + `docker-compose.override.yml`.
2. Wait for the database to become healthy.
3. Run `prisma migrate dev` to create / update the schema.
4. Run `npm run seed` to create demo projects, plans, executions, and users.

Mailhog's web UI is available at <http://localhost:8025> and captures all
outgoing email (password reset and email verification links during local dev).

---

## Manual local setup

If you prefer not to run the setup script:

```bash
# install dependencies
npm install

# start only the dependencies you need (skip if you have your own Postgres)
docker compose up -d db mailhog

# generate the Prisma client
npm run prisma:generate

# apply all migrations
npx prisma migrate dev

# seed demo data (optional, blocked in NODE_ENV=production unless --force is passed)
npm run seed

# start the app
npm run dev
```

> If you connect to an **existing** database, use `npx prisma migrate deploy`
> instead of `migrate dev` — it only applies migrations without prompting to
> reset the database.

---

## Environment variables

Duplicate `.env.example` to `.env` and fill in values. The full list:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Postgres connection string. Example: `postgresql://postgres:postgres@localhost:5432/testsimplify` |
| `POSTGRES_PASSWORD` | **yes (Docker)** | Password for the bundled Postgres container in `docker-compose.yml`. Change from `postgres` in production. |
| `NEXTAUTH_URL` | **yes** | Public URL the app is served from (e.g. `https://testsimply.mycorp.net`). |
| `NEXTAUTH_SECRET` | **yes** | Used to sign session/JWT cookies. Generate with `openssl rand -base64 32`. |
| `ENCRYPTION_KEY` | **yes in prod** | 32-byte key (44-char base64, 64-char hex, or 32-char string) used to encrypt stored Jira / CI API tokens with AES-256-GCM (`enc:v1:` envelope). Generate with `openssl rand -base64 32`. |
| `EMAIL_SERVER` | yes | SMTP URL (e.g. `smtp://mailhog:1025` locally, or `smtps://user:pass@smtp.sendgrid.net:465`). |
| `EMAIL_FROM` | yes | Default "from" address for system emails. |
| `REQUIRE_EMAIL_VERIFICATION` | no | Set to `true` to require a verified email before password login. Users can request a fresh verification link from the login banner or `/settings/profile`. |
| `EMAIL_PASSWORD_DISABLED` | no | Set to `true` to disable email/password auth (OAuth-only). |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | Enables GitHub OAuth. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google OAuth (enforces `email_verified === true`). |
| `GOOGLE_ALLOWED_DOMAIN` | no | Restricts Google sign-in to a single workspace domain (e.g. `mycorp.com`). |
| `TRUSTED_PROXY` | no | Set to `true` when deployed behind a trusted reverse proxy so the rightmost `X-Forwarded-For` / `X-Real-IP` address is used for rate limiting. |
| `ALLOW_PRIVATE_NETWORK_URLS` | no | Set to `true` to allow Jira/CI integrations to point at private/internal IPs (disabled by default to mitigate SSRF). |
| `UPLOAD_DIR` | no | Directory used to persist attachments on disk. Defaults to `./uploads` (`/app/uploads` in Docker). |
| `REDIS_URL` | no | Optional Redis URL (`redis://` or `rediss://`) for shared atomic rate-limiter storage across replicas (falls back to in-memory store). |
| `LOG_LEVEL` | no | `trace` / `debug` / `info` / `warn` / `error` / `fatal`. Defaults to `info`. |

Generate the two required secrets with:

```bash
openssl rand -base64 32   # use for NEXTAUTH_SECRET
openssl rand -base64 32   # use for ENCRYPTION_KEY
```

> Never commit `.env` — the repo already ignores it.

---

## Seeded accounts & RBAC permissions

`npm run seed` creates four local demo users with the password `ChangeMe123!`:

| Role   | Email                            | Capabilities |
| ------ | -------------------------------- | ------------ |
| `ADMIN`  | `ada.admin@testsimply.local`   | Full access to all projects, user management (`/settings/users`), project creation & deletion, settings, and system-wide audit logs. |
| `LEAD`   | `liam.lead@testsimply.local`   | Create & update projects, manage project settings/integrations (when assigned as project lead), manage test plans, executions, environments, requirements, test sets, test cases (including delete), and bugs; view project-scoped audit logs. |
| `TESTER` | `tara.tester@testsimply.local` | Create & update test cases, folders, and preconditions; manage test sets and bugs; run test executions and import JUnit/Cucumber results. Cannot create/delete projects, delete test cases, or manage test plans. |
| `VIEWER` | `vera.viewer@testsimply.local` | Read-only access to assigned projects, test cases, plans, sets, executions, bugs, requirements, and reports. All mutation buttons are hidden in the UI and blocked (`403`) by the API. |

**Note:** `npm run seed` refuses to run when `NODE_ENV=production` unless `--force` is explicitly passed. Change or remove demo accounts before exposing an instance to untrusted networks.

---

## Promoting an admin

In production you can register the first account through `/auth/register` (or provision users from `/settings/users`) and promote an account to `ADMIN` from the CLI:

```bash
npm run promote-admin -- you@yourcompany.com
```

Inside Docker Compose:

```bash
docker compose exec app npm run promote-admin -- you@yourcompany.com
```

---

## Testing & quality gates

```bash
npm run lint       # ESLint via eslint-config-next
npm run typecheck  # strict tsc --noEmit
npm run test       # Vitest unit & API integration tests
npm run test:e2e   # Playwright end-to-end suite
npm run build      # production Next.js standalone build
```

Husky runs `npm run lint`, `npm run typecheck`, and `npm run test` on `pre-commit`. The `.github/workflows/ci.yml` pipeline runs lint, typecheck, unit tests, and production build on push and pull requests.

---

## Deployment

TestSimply is a Next.js application backed by PostgreSQL.

### Option A — Docker Compose (single host)

```bash
# 1. clone the repository
git clone <your fork url> /opt/testsimply && cd /opt/testsimply

# 2. create a production .env
cp .env.example .env
# edit .env and set at minimum:
#   POSTGRES_PASSWORD, DATABASE_URL, NEXTAUTH_URL,
#   NEXTAUTH_SECRET, ENCRYPTION_KEY, EMAIL_SERVER, EMAIL_FROM

# 3. build and launch
docker compose up -d --build

# 4. apply migrations (first boot or after every upgrade)
docker compose exec app npx prisma migrate deploy

# 5. create / promote your first admin
docker compose exec app npm run promote-admin -- you@yourcompany.com
```

To exclude the local development override (`docker-compose.override.yml`, which exposes port `5432` and runs Mailhog), pass `-f docker-compose.yml`:

```bash
docker compose -f docker-compose.yml up -d --build
```

### Option B — Container image on your own infra

The `Dockerfile` builds a multi-stage `node:20-alpine` image running as a non-root `nextjs` user with Next.js standalone output and bundled Prisma CLI for `prisma migrate deploy`:

```bash
docker build -t testsimply:<version> .
docker push your-registry/testsimply:<version>
```

- Connect to PostgreSQL via `DATABASE_URL`.
- Mount a persistent volume at `/app/uploads` (or set `UPLOAD_DIR`).
- Probe `GET /api/health` for liveness/readiness.
- Run migrations before starting new replicas:
  ```bash
  docker run --rm --env-file .env testsimply:<version> npx prisma migrate deploy
  ```

### Option C — Node process behind a reverse proxy

```bash
git clone <your fork url> /opt/testsimply && cd /opt/testsimply
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
NODE_ENV=production npm run start
```

### Running migrations on deploy

Always apply pending migrations before serving traffic:

```bash
npx prisma migrate deploy
# or in Docker:
docker compose exec app npx prisma migrate deploy
```

### Reverse proxy / TLS

Example Nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name testsimply.mycorp.net;

    ssl_certificate     /etc/letsencrypt/live/testsimply.mycorp.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/testsimply.mycorp.net/privkey.pem;

    client_max_body_size 15m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
}
```

Set in `.env`:

```dotenv
NEXTAUTH_URL=https://testsimply.mycorp.net
TRUSTED_PROXY=true
```

### Health check

`GET /api/health` runs a lightweight database check and returns `200 { "status": "ok" }` when healthy or `503` when PostgreSQL is unreachable.

### Backups

1. **PostgreSQL**:
   ```bash
   docker compose exec -T db pg_dump -U postgres testsimplify \
     | gzip > testsimplify-$(date +%F).sql.gz
   ```
2. **`UPLOAD_DIR`** (`/app/uploads` in Docker): back up the `uploads` volume.

### Upgrading

```bash
git pull
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

---

## CI/CD & Jira integrations

### Triggering CI pipelines from Test Plans

Under **Project → Settings → CI/CD Integration**, configure:
- **GitHub Actions** (`GITHUB`): Repository URL (`https://github.com/owner/repo` or GitHub Enterprise URL), Fine-Grained / `repo` + `workflow` PAT, and workflow filename (`ci.yml`). Automatically discovers the repository's default branch and gracefully handles workflows with or without `workflow_dispatch.inputs`.
- **GitLab CI** (`GITLAB`): Project URL (`https://gitlab.com/group/project`), Project/Personal Access Token (`api` scope), and optional workflow variable. Triggers `/api/v4/projects/:id/pipeline` on the project's default branch.
- **Jenkins** (`JENKINS`): Base or job URL (`https://jenkins.example.com/job/my-suite`), `username:apiToken`, and optional job path. Triggers `/buildWithParameters` and falls back to `/build` for non-parameterized jobs.

Use **Test Connection** in Project Settings to validate credentials. Clicking **Run in CI** on a Test Plan pre-creates an `ACTIVE` `TestExecution` with a generated `EXEC` key and passes `{ planId, projectId, execKey }` to the CI pipeline.

### Importing JUnit XML & Cucumber JSON results

Results can be imported either **in the browser** (via the **Import Results** modal on the **Executions** page or inside the **Manual Runner** sidebar) or **from CI pipelines** using a `"import"`-scoped **Personal Access Token** (`/settings/tokens`).

Imports automatically link matching project `Environment` records (`environmentId`) when `?environment=<name|key|id>` is supplied and mark the execution `COMPLETED` by default (pass `&complete=false` for multi-part batch uploads).

#### JUnit XML (`POST /api/import/junit`)

```bash
curl -X POST "https://testsimply.mycorp.net/api/import/junit?projectKey=ALPHA&execKey=ALPHA_EXEC_12&createExecutionIfMissing=true&autoCreateCases=true&environment=Staging&commitSha=${GITHUB_SHA}&labels=nightly,ui" \
  -H "Authorization: Bearer $TESTSIMPLY_TOKEN" \
  -F "report=@reports/junit.xml"
```

#### Cucumber JSON (`POST /api/import/cucumber`)

```bash
curl -X POST "https://testsimply.mycorp.net/api/import/cucumber?projectKey=ALPHA&createExecutionIfMissing=true&autoCreateCases=true&environment=Staging" \
  -H "Authorization: Bearer $TESTSIMPLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d @cucumber-report.json
```

### Jira Cloud integration

Under **Project → Settings → Jira Integration**, configure your Jira Cloud URL (`https://your-domain.atlassian.net`), email, API token, and optional **Jira Project Key** (falls back to the local TestSimply project key), then click **Test Connection** to verify authentication and project access.

- **One-click Jira + Local Bug creation**: In the **Manual Runner**, clicking **+ Create Jira Bug** creates the issue in Jira Cloud (`POST /api/integrations/jira/create`), creates a linked local `Bug` record (`[<JIRA-KEY>] <Summary>`) attached to the active `TestCase` and `TestResult`, and records an audit log entry.
- **Live Jira status badges**: Native `Requirement` cards, the Requirement detail page, and linked Test Case requirements automatically fetch and display live Jira issue status badges via `GET /api/integrations/jira/issue`.

---

## Feature overview

- **Hierarchical test repository** — unlimited nested folders per project with drag-and-drop case organization, bulk move/priority/plan actions, and inline **`+ New Folder`** creation directly inside Test Case create/edit forms.
- **Test types** — **Manual** (step-by-step Action / Data / Expected table), **Cucumber (BDD)** (Gherkin scenario definition), and **Generic / Automated** (spec path or node ID reference).
- **Reusable preconditions with inline saving** — manage project preconditions on the **Preconditions** page, insert & link existing preconditions when creating a test case, or check **Save as reusable precondition in project** while typing precondition text on a new/edited test case to save and link it automatically.
- **Environments with inline creation** — manage test environments (`DEV`, `Staging`, `Production`) or create new environments on the fly directly inside **New Execution**, **New Test Plan**, **Test Plan Details**, and the **Import Results** modal.
- **Test plans & test sets** — bundle cases for releases, add individual cases via a searchable multi-select picker or import entire Test Sets, reorder cases, link environments, launch a manual run in one click (**Start Execution** with smart prefill), or trigger CI (**Run in CI**).
- **Keyboard-driven Manual Runner** — per-step `PASS` / `FAIL` / `BLOCKED` / `SKIPPED` buttons with Actual Result and Comments fields, **Mark all steps Pass** & **Save Derived** shortcuts, keyboard hotkeys (`P` Pass, `F` Fail, `B` Blocked, `J` / `K` Next/Prev Case), optional **Auto-advance on Pass**, color-coded case queue, file attachments, local & Jira bug creation, bulk remaining-case actions, and CSV export.
- **Requirements & Traceability Matrix** — first-class `Requirement` entity with live Jira status badges, inline creation from Test Case detail pages, and a **Requirements × Tests × Environments × Bugs** traceability matrix with plan/environment filters and CSV export.
- **Flakiness detection & reports** — automatic flaky test detection after result updates and CI imports, 14-day Pass/Fail trend charts, execution health summaries, coverage metrics, and bug distribution reports.
- **Global Command Palette (`⌘K`)** — instant keyboard navigation across all project pages, settings, and role-aware **Quick Actions** (`+ New Test Case`, `+ New Execution`, `+ New Test Plan`, `+ New Test Set`, `+ Report Bug`).
- **Server-backed pagination** — consistent 50-item pagination controls (`X-Total-Count`, `X-Total-Pages`) across Test Cases, Executions, Bugs, Requirements, and Audit Logs.
- **Self-service profile & Admin user management** — users can update their display name, change their password, and resend verification emails at `/settings/profile`; admins can provision verified accounts, delete users, change roles, and assign project membership or LEAD settings access at `/settings/users`.

---

## Security architecture

- **Defense-in-depth RBAC & project isolation** — every API route validates session or Bearer PAT authentication (`requireAuth`), checks the role permission matrix (`can(role, action)`), and enforces project-level membership (`requireProjectAccessOrForbid` / `assertProjectAccessForResource`). The UI mirrors these permissions via `usePermissions()`.
- **Immediate JWT revocation & periodic role refresh** — NextAuth JWT callbacks refresh user roles from PostgreSQL and immediately invalidate sessions if an account is deleted.
- **AES-256-GCM secret encryption** — Jira and CI tokens are encrypted at rest with a versioned `enc:v1:<base64>` envelope (`src/lib/encryption.ts`). Includes `scripts/reencrypt-secrets.ts` for key rotation.
- **SSRF protection (`src/lib/ssrf.ts`)** — outbound Jira and CI requests validate URL schemes, block private/loopback/link-local/NAT64/6to4/ULA IPv4 and IPv6 ranges (including DNS resolution checks), disable automatic HTTP 30x redirects (`redirect: "error"`), validate path segments against traversal, and enforce a 10-second timeout.
- **Attachment XSS hardening (`src/lib/upload.ts`, `/api/attachments/[id]`)** — enforces strict non-empty MIME allowlists and a 10 MB size limit, serves only safe raster images (`png`, `jpeg`, `gif`, `webp`) as `inline`, forces `Content-Disposition: attachment` for XML/PDF/CSV/JSON/text files, sets `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`, and unlinks physical files from disk on deletion.
- **Partitioned rate limiting (`src/lib/rate-limit.ts`)** — protects credentials login, registration, password reset, verification resend, and general API endpoints with per-IP, per-email, and per-PAT/session cookie buckets, backed by Redis (`REDIS_URL`) or an in-memory store.
- **HTTP security headers (`next.config.js`)** — applies `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` across all routes.

---

## License
Copyright (c) [2026] [Valdas Ginkus]. All Rights Reserved.
This software and associated documentation files are proprietary and may not be copied, distributed, modified, or used without explicit written permission from the author.
