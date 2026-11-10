# CI/CD & Deployment

[← Back to Home](./README.md) · [Development & Testing](./Development-And-Testing.md)

This repository uses **GitHub Actions** (`.github/workflows/ci.yml`) for CI. This page describes what it actually does.

## GitHub Actions: `.github/workflows/ci.yml`

```mermaid
flowchart LR
    subgraph Triggers
        P[push: devel, main]
        PR[pull_request: devel, main]
    end
    Triggers --> J1["Job: test\nubuntu-latest"]
    J1 --> J2["Job: docker\nubuntu-latest\n(needs: test)"]

    subgraph J1steps [test]
        direction TB
        S1[actions/checkout@v5] --> S2["actions/setup-node@v5\nnode-version-file: auth_service/.nvmrc"]
        S2 --> S3["npm ci --legacy-peer-deps\n(cwd: auth_service)"]
        S3 --> S4["npm run test:coverage\n(cwd: auth_service)"]
    end

    subgraph J2steps [docker]
        direction TB
        D1[actions/checkout@v5] --> D2["docker build -t auth-service:$GITHUB_SHA auth_service"]
    end
```

- **Triggers:** `push` and `pull_request` against `devel` and `main` only.
- **Concurrency:** `group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` — a new push to the same branch/PR cancels any in-flight run for that ref.
- **Permissions:** `contents: read` only (no write-back to the repo).
- **Job `test`:** checks out the repo, sets up Node from `auth_service/.nvmrc` (`22.23.4`) with npm caching keyed on `auth_service/package-lock.json`, installs with `npm ci --legacy-peer-deps` (required — see [Development & Testing](./Development-And-Testing.md) and the Dockerfile comment about pinned legacy dependencies), then runs `npm run test:coverage`. This is the same command a developer runs locally, so a failing coverage threshold (see [Development & Testing → Coverage thresholds](./Development-And-Testing.md#coverage-thresholds)) fails CI identically.
- **Job `docker`:** depends on (`needs: test`) the test job passing, then simply builds the production image (`docker build -t auth-service:${{ github.sha }} auth_service`) to prove the Dockerfile is buildable. **The image is not pushed anywhere** — no registry login/push step exists in this workflow.

There is no separate lint job (no linter exists in the repo — see [Development & Testing](./Development-And-Testing.md#linting--formatting--type-checking)) and no deploy job in this workflow.

## Docker image: `auth_service/Dockerfile`

```dockerfile
FROM node:22.23.4-bookworm-slim
WORKDIR /auth_service
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev --legacy-peer-deps
COPY . /auth_service
CMD ["node", "app.js"]
```

Key points:
- Base image and Node version match `.nvmrc`/`package.json#engines.node` exactly (`22.23.4`).
- `package.json`/`package-lock.json` (and `scripts/`, needed by the `postinstall` hook) are copied and installed **before** the rest of the source, so Docker's layer cache is reused when only application code changes.
- `--omit=dev` — devDependencies (`jest`, `sequelize-cli`) are not present in the production image; the image cannot run the test suite.
- `--legacy-peer-deps` — required because of intentionally pinned legacy packages (`sequelize@3`, `swagger-express-mw@0.1.0`, `ldapjs@1`) that predate modern npm peer-dependency resolution (per the inline Dockerfile comment).
- No `EXPOSE` directive is present (informational only in Docker; the container listens on `8080` per `env_config.PORT`, mapped by the operator at `docker run` time, e.g. `docker run --env-file .env -p 8080:8080 auth-service` per the root [README](../README.md#installation)).
- No `HEALTHCHECK` directive; the `/health` route (see [API Reference](./Api-Reference.md#logging--operations)) exists but is not wired into the image itself.

## Running the container

This repository does not include `docker-compose.yml`, a `Makefile`, or any other orchestration/compose files — deployment topology (how the built image is networked with MySQL, Redis, and any reverse proxy) is **not documented in the repository** and is left to the operator. The root [README](../README.md#3-install-dependencies-and-run) documents building and running the image directly:

```bash
docker build -t auth-service .
docker run --env-file .env -p 8080:8080 auth-service
```

MySQL and Redis must be separately provisioned and reachable at the hostnames `env_config.js` expects (`MYSQL_HOST`, default `auth_service_mysql`; and the hard-coded `auth_service_redis:6379` in `auth_service/redis.js`, which has no environment-variable override) — see [Configuration](./Configuration.md).

## Cross-references

- [Development & Testing](./Development-And-Testing.md) — the exact commands run by the `test` job.
- [Configuration](./Configuration.md) — every environment variable the container needs at runtime.
- [Extending & Troubleshooting](./Extending-And-Troubleshooting.md) — known setup gaps.
