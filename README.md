# TestSimply

TestSimply is a self-hostable test management platform inspired by Jira Xray.
It covers the full manual and automated testing lifecycle: a hierarchical test
repository, manual / BDD (Gherkin) / automated test types, test plans and sets,
executions with per-step results, bug tracking, requirements, a traceability
matrix, CSV round-tripping, and REST endpoints for CI imports.

The stack is **Next.js 14 (App Router)** with **Prisma + PostgreSQL**, **NextAuth**
for authentication (email/password + optional GitHub/Google OAuth), TailwindCSS
+ shadcn/ui, TanStack Query/Table, React Hook Form + Zod, and Vitest/Playwright
for testing.

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Manual local setup](#manual-local-setup)
- [Environment variables](#environment-variables)
- [Seeded accounts](#seeded-accounts)
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
- [CI integration](#ci-integration)
- [Feature overview](#feature-overview)
- [License](#license)

---

## Prerequisites

- **Node.js 20 LTS** (the Docker image uses `node:20-alpine`; local dev works
  on Node 18+ too but 20 is recommended).
- **Docker** + **Docker Compose v2** (only needed if you want the bundled
  Postgres/Mailhog services — you can also bring your own Postgres).
- **PostgreSQL 13+** (if you're not using the bundled container).
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
[seeded accounts](#seeded-accounts).

The setup script will:

1. Start the `db` (PostgreSQL 15) and `mailhog` containers from
   `docker-compose.yml`.
2. Wait for the database to become healthy.
3. Run `prisma migrate dev` to create / update the schema.
4. Run `npm run seed` to create demo projects, plans, executions, and users.

Mailhog's web UI is available at <http://localhost:8025> and captures all
outgoing email (password reset / verification links during local dev).

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

# seed demo data (optional but recommended for first boot)
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
| `ENCRYPTION_KEY` | **yes in prod** | Encrypts stored Jira / CI API tokens. Generate with `openssl rand -base64 32`. The app fails to start in production without this. |
| `EMAIL_SERVER` | yes | SMTP URL (e.g. `smtp://mailhog:1025` locally, or `smtps://user:pass@smtp.sendgrid.net:465`). |
| `EMAIL_FROM` | yes | Default "from" address for system emails. |
| `REQUIRE_EMAIL_VERIFICATION` | no | Set to `true` to force users to verify email before login. |
| `EMAIL_PASSWORD_DISABLED` | no | Set to `true` to disable email/password auth (OAuth-only). |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | Enables GitHub OAuth. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google OAuth. |
| `GOOGLE_ALLOWED_DOMAIN` | no | Restricts Google sign-in to a single workspace domain (e.g. `mycorp.com`). |
| `TRUSTED_PROXY` | no | Set to `true` so `X-Forwarded-For` / `X-Real-IP` are honoured behind a reverse proxy. |
| `ALLOW_PRIVATE_NETWORK_URLS` | no | Set to `true` to allow Jira/CI integrations to point at private IPs (disabled by default to mitigate SSRF). |
| `UPLOAD_DIR` | no | Directory used to persist attachments on disk. Defaults to `./uploads` (`/app/uploads` in Docker). |
| `REDIS_URL` | no | Optional Redis URL for shared rate-limiter storage (falls back to in-memory store). |
| `LOG_LEVEL` | no | `trace` / `debug` / `info` / `warn` / `error` / `fatal`. Defaults to `info`. |

Generate the two required secrets with:

```bash
openssl rand -base64 32   # use for NEXTAUTH_SECRET
openssl rand -base64 32   # use for ENCRYPTION_KEY
```

> Never commit `.env` — the repo already ignores it.

---

## Seeded accounts

`npm run seed` creates four users with the password `ChangeMe123!`:

| Role   | Email                              |
| ------ | ---------------------------------- |
| ADMIN  | `ada.admin@testsimply.local`     |
| LEAD   | `liam.lead@testsimply.local`     |
| TESTER | `tara.tester@testsimply.local`   |
| VIEWER | `vera.viewer@testsimply.local`   |

Use these to exercise the RBAC behaviour. **Change these passwords (or remove
the users) before exposing the instance to real users.**

---

## Promoting an admin

In production you'll usually register the first account through the UI and
then promote it to `ADMIN` from the command line:

```bash
npm run promote-admin -- you@yourcompany.com
```

Running this inside the Docker container:

```bash
docker compose exec app npm run promote-admin -- you@yourcompany.com
```

The script marks the user's email as verified if it wasn't already and flips
their role to `ADMIN`.

---

## Testing & quality gates

```bash
npm run lint       # ESLint via eslint-config-next
npm run typecheck  # strict tsc --noEmit
npm run test       # Vitest unit tests (importers, utilities)
npm run test:e2e   # Playwright end-to-end suite
npm run build      # production Next.js build
```

Husky + lint-staged run ESLint and Prettier on every commit. The
`.github/workflows/ci.yml` workflow runs lint, typecheck, tests, and build on
pull requests.

---

## Deployment

TestSimply is a plain Next.js application talking to Postgres. You have three
realistic deployment patterns depending on how much infra you already have.

### Option A — Docker Compose (single host)

Simplest path for a small team or internal deployment on a single VM /
home-lab box. The repo ships with a production-ready `docker-compose.yml`.

On the target host:

```bash
# 1. copy the code (or clone your fork)
git clone <your fork url> /opt/testsimply && cd /opt/testsimply

# 2. create a production .env
cp .env.example .env
# edit it and set at minimum:
#   DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY,
#   EMAIL_SERVER / EMAIL_FROM, POSTGRES_PASSWORD (for the bundled db).

# 3. build and launch (use `-f docker-compose.yml` in production to exclude dev Mailhog & exposed DB port)
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d

# 4. apply migrations (first boot only, or after every upgrade)
docker compose exec app npx prisma migrate deploy

# 5. create / promote your first admin
docker compose exec app npm run promote-admin -- you@yourcompany.com
```

After that the app is reachable on port `3000` of the host. The bundled
`db` container holds its data in the `postgres-data` Docker volume, and the
stack automatically restarts Postgres before the app (`depends_on` +
`service_healthy`). The app itself has a `/api/health` liveness probe used by
the compose health check.

> In production you should front this with a real reverse proxy that
> terminates TLS — see [Reverse proxy / TLS](#reverse-proxy--tls).

### Option B — Container image on your own infra

If you run Kubernetes / Nomad / ECS / Fly / Render / any platform that takes
a container image, the `Dockerfile` produces a small standalone image
(`node:20-alpine`, non-root user, Next.js standalone output).

```bash
docker build -t testsimply:<version> .
docker push your-registry/testsimply:<version>
```

Minimum runtime configuration:

- Connect it to a managed Postgres (`DATABASE_URL`).
- Mount a **persistent volume** at `/app/uploads` if you want local file
  attachments to survive container restarts (or set `UPLOAD_DIR` to point at
  an object-storage-backed FUSE mount).
- Inject every variable from [the env table](#environment-variables) that
  applies to you.
- Ensure the platform probes `GET /api/health` for liveness/readiness.

The container's default command starts the Next.js server (`node server.js`
from the standalone build). Run migrations as a separate init / job step:

```bash
docker run --rm --env-file .env testsimply:<version> npx prisma migrate deploy
```

### Option C — Node process behind a reverse proxy

If you already manage Node processes with systemd / PM2 / supervisord:

```bash
git clone <your fork url> /opt/testsimply && cd /opt/testsimply
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
NODE_ENV=production npm run start    # or use Next.js standalone output
```

Put the process behind nginx / Caddy / Traefik (see below) and keep `.env`
owned by the process user only.

### Running migrations on deploy

The Prisma client schema changes over time. **Run migrations as part of every
deploy, before the app starts serving traffic**:

```bash
npx prisma migrate deploy
```

This is non-interactive and only applies pending migrations. In Docker:

```bash
docker compose exec app npx prisma migrate deploy
```

In Kubernetes, use an init container or a pre-deploy Job running the same
image with the `prisma migrate deploy` command.

### Reverse proxy / TLS

A minimal nginx config for a domain like `testsimply.mycorp.net`:

```nginx
server {
    listen 443 ssl http2;
    server_name testsimply.mycorp.net;

    ssl_certificate     /etc/letsencrypt/live/testsimply.mycorp.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/testsimply.mycorp.net/privkey.pem;

    client_max_body_size 50m;   # attachment uploads

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

Then set in `.env`:

```
NEXTAUTH_URL=https://testsimply.mycorp.net
TRUSTED_PROXY=true
```

Caddy equivalent:

```
testsimply.mycorp.net {
    reverse_proxy 127.0.0.1:3000
}
```

### Health check

The app exposes an unauthenticated `GET /api/health` endpoint that runs a
lightweight query against Postgres and returns `200` with
`{ "status": "ok" }` on success, or `503` when the database is unreachable.
Use it as your liveness/readiness probe.

### Backups

The only stateful components are:

1. **Postgres** — take regular logical backups:
   ```bash
   docker compose exec -T db pg_dump -U postgres testsimplify \
     | gzip > testsimplify-$(date +%F).sql.gz
   ```
2. **`UPLOAD_DIR`** (defaults to `./uploads`) — back up the directory or use
   an object-storage-backed volume.

No other files need to be preserved across deploys.

### Upgrading

```bash
git pull
docker compose build app
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

Migrations are backwards-compatible where possible (e.g. the Jira Xray feature
migration auto-materializes a `Requirement` record for every legacy
`RequirementLink.externalUrl` so existing coverage dashboards keep working
after the upgrade).

---

## CI integration

Generate a **Personal Access Token** from **Tokens** (or **Settings → Personal
Tokens**) and use it as a bearer token when pushing results.

### JUnit XML (most test runners)

```bash
curl -X POST "https://testsimply.mycorp.net/api/import/junit?projectKey=ALPHA&createExecutionIfMissing=true&environment=staging&commitSha=${GITHUB_SHA}&labels=nightly,ui" \
  -H "Authorization: Bearer $TESTSIMPLY_TOKEN" \
  -F "report=@reports/junit.xml"
```

### Cucumber JSON

```bash
curl -X POST "https://testsimply.mycorp.net/api/import/cucumber?projectKey=ALPHA&autoCreateCases=true" \
  -H "Authorization: Bearer $TESTSIMPLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d @cucumber-report.json
```

Example GitHub Actions step:

```yaml
- name: Upload results to TestSimply
  if: always()
  env:
    TOKEN: ${{ secrets.TESTSIMPLY_TOKEN }}
  run: |
    curl -X POST "https://testsimply.mycorp.net/api/import/junit?projectKey=ALPHA&createExecutionIfMissing=true&commitSha=${GITHUB_SHA}" \
      -H "Authorization: Bearer $TOKEN" \
      -F "report=@reports/junit.xml"
```

The full REST surface is documented in [`docs/openapi.yaml`](docs/openapi.yaml)
and there's a [`docs/postman_collection.json`](docs/postman_collection.json) for
interactive exploration.

---

## Feature overview

- **Test repository** — unlimited nested folders per project, with move and
  path-based filtering.
- **Test types** — Manual (classic step table), Cucumber (Gherkin body), and
  Generic (automated test reference, e.g. a pytest node id or Playwright spec).
- **Test plans & sets** — bundle cases for releases, reorder, pick environments.
- **Test executions** — ad-hoc or plan-driven, with multi-environment results.
- **Manual runner** — per-step PASS / FAIL / BLOCKED / SKIPPED with Actual
  result and Comments fields, file attachments, bug linking, configurable Jira
  issue creation, CSV export.
- **Automated imports** — JUnit XML and Cucumber JSON with optional
  auto-creation of test cases and executions.
- **Requirements** — first-class `Requirement` entity with a searchable
  list/detail UI; can be purely local or linked to an external Jira issue.
- **Traceability matrix** — Requirements × Tests × Environments × Bugs view
  with plan/env filters and CSV export.
- **Bugs** — local bug tracking with Jira round-tripping.
- **Flakiness & automation** — heuristic flaky detection and automation flags.
- **CSV import/export** — bulk case management via a documented column layout
  ([`docs/csv-template.csv`](docs/csv-template.csv)).
- **RBAC & auth** — email/password + GitHub/Google OAuth; global ADMIN / LEAD /
  TESTER / VIEWER roles plus per-project leads and members; ADMIN escape hatch
  via the promote-admin script.
- **Personal Access Tokens** — scoped bearer tokens for CI integrations,
  hashed at rest.
- **Audit logging** — every mutation is recorded in the `AuditLog` table with
  actor, entity, and payload.

---

## License
Copyright (c) [2026] [Valdas Ginkus]. All Rights Reserved.
This software and associated documentation files are proprietary and may not be copied, distributed, modified, or used without explicit written permission from the author.
