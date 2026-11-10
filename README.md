# Ingenium Auth Service

Centralized authentication and role-based access control (RBAC) service for the Ingenium platform.

[![CI](https://github.com/OpenIngenium/auth-service/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenIngenium/auth-service/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-22.23.4-brightgreen.svg)](https://nodejs.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

## Overview

Ingenium Auth Service is a Node.js/Express REST API (described by an OpenAPI 2.0 / Swagger spec) backed by MySQL, that authenticates users and issues short-lived, RS256-signed JWT access tokens. It supports three authentication paths — LDAP bind, RSA SecurID, or a static test-user bypass for local development — and enforces access control via a `User` / `Role` / `Permission` / `Group` model, so client applications can be authorized by scope rather than by re-implementing their own auth logic. Issued tokens can be refreshed, and are blacklisted in Redis on logout so they can no longer be used.

It exists to give other Ingenium services a single place to authenticate users and manage the roles, permissions, and groups that drive authorization decisions across the platform.

## Features

- **JWT-based sessions** — RS256-signed access tokens (`auth_service/api/helpers/jwt_helper.js`) with a `/refresh_token` flow and Redis-backed blacklisting on `/logout`.
- **Multiple authentication backends** — LDAP bind, RSA SecurID (`RSA_URL`/`RSA_CLIENT_ID`/`RSA_CLIENT_KEY`), or a configurable static test user for local development, selected via `AUTH_METHOD`.
- **RBAC data model** — `User`, `Role`, `Permission`, and `Group` Sequelize models related through `RoleUser`, `RolePermission`, `RoleGroup`, `UserGroup`, and `UserPermission` join tables (see [Data Model](#data-model)).
- **OpenAPI-driven routing** — endpoints, parameters, and security requirements are defined once in `auth_service/api/swagger/swagger.yaml` and served with interactive docs via Swagger UI.
- **Database migrations & seed data** — versioned Sequelize migrations managed with Umzug via `server/migrate.js`, including seed data for base roles/permissions.
- **Structured logging** — JSON logs via Winston with a runtime-adjustable level through the `/logging` endpoint.

## Data Model

- `User` N:M `Role` through `RoleUser`
- `Role` N:M `Permission` through `RolePermission`
- `Role` N:M `Group` through `RoleGroup`
- `User` N:M `Group` through `UserGroup`

A user's effective permission `scopes` are computed at login time (`auth_service/api/helpers/login_helper.js`) as the union of permissions granted to roles assigned directly to the user, and permissions granted to roles inherited through LDAP-backed group membership.

## Installation

### Prerequisites

- git
- Node.js `22.23.4` (see `auth_service/.nvmrc`)
- A reachable MySQL server and a reachable Redis server (this repository does not include compose/orchestration files for them; provision them yourself, e.g. via standalone Docker containers, and make sure they are reachable at the hostnames configured below)

### 1. Clone the repository

```bash
git clone https://github.com/OpenIngenium/auth-service.git
cd auth-service/auth_service
```

### 2. Configure environment variables

The service is configured entirely through environment variables read in `auth_service/env_config.js` (see [Configuration](#configuration) for the full list). At minimum, set:

```env
MYSQL_HOST=<your MySQL host>
MYSQL_USERNAME=root
MYSQL_ROOT_PASSWORD=<your MySQL password>
MYSQL_DATABASE=auth
PUBLIC_PEM=<RSA public key, PEM format>
PRIVATE_PEM=<RSA private key, PEM format>
USERNAME=devuser
PASSWORD=devpass
```

The service signs and verifies access tokens with an RS256 key pair, **not** a shared secret. Generate a local development key pair with:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Set `PUBLIC_PEM`/`PRIVATE_PEM` to the contents of the generated files. `private.pem` is already excluded via `.gitignore` — never commit it. `USERNAME`/`PASSWORD` let the `basicAuth` handler in `auth_service/app.js` bypass LDAP/RSA for local development.

> **Note:** `redis.js` connects to a hardcoded host of `auth_service_redis` on port `6379` (there is no environment variable override), so Redis must be reachable under that hostname (e.g. by running it in a Docker container named/aliased `auth_service_redis` on the same network, or via a local hosts-file entry).

### 3. Install dependencies and run

```bash
npm install --legacy-peer-deps
npm start
```

Alternatively, build and run the provided `auth_service/Dockerfile` directly:

```bash
docker build -t auth-service .
docker run --env-file .env -p 8080:8080 auth-service
```

### 4. Run database migrations

```bash
node server/migrate.js up
```

`server/migrate.js` also supports `status`, `next`/`migrate-next`, `down`/`reset`, `prev`/`reset-prev`, and `reset-hard`. Running `up` against a fresh database applies every migration under `auth_service/server/migrations`, which includes seed data for the base roles/permissions and a seeded test account for the user named by `USERNAME` at migration time.

## Quick Start

Once the service is running and migrated, log in as the seeded test user and call an authenticated endpoint:

```bash
# 1. Log in with HTTP Basic auth using USERNAME/PASSWORD from your environment
curl -s -u "$USERNAME:$PASSWORD" http://localhost:8080/api/v2/login

# => {"access_token":"<jwt>","access_token_timeout":"3410s"}

# 2. Call an authenticated endpoint with the returned token
curl -s -H "Authorization: Bearer <jwt>" http://localhost:8080/api/v2/users
```

Explore every endpoint interactively via Swagger UI at `http://localhost:8080/docs` once the service is running.

## Usage

All routes are versioned under the `/api/v2` base path defined in `auth_service/api/swagger/swagger.yaml`.

| Resource | Endpoints | Description |
|---|---|---|
| Auth | `GET /login`, `POST /refresh_token`, `POST /logout` | HTTP Basic login, JWT refresh, logout (blacklists the token in Redis) |
| Users | `GET /users`, `GET /users/{user_id}` | List/filter users, fetch a single user |
| Roles | `GET /roles`, `POST /roles`, `GET/PUT/DELETE /roles/{role_id}`, plus `/permissions`, `/groups`, `/users` sub-resources | Manage roles and their permission/group/user assignments |
| Permissions | `GET /permissions`, `GET /permissions/{permission_id}`, `.../users`, `.../groups` | Inspect permissions and who holds them |
| Groups | `GET /groups`, `GET /groups/{group_id}` | List/fetch LDAP-backed groups known to the service |
| LDAP | `GET /ldap/users`, `GET /ldap/groups` | Search LDAP directly (e.g. for autocomplete) |
| Ops | `GET /health`, `GET/POST /logging` | Liveness check and runtime log-level control |

`GET /login` uses HTTP Basic auth; `POST /refresh_token`, `POST /logout`, and the `/ldap/*` endpoints require a bearer token with the `basic` scope; `GET /health` is unauthenticated. Every other endpoint listed above requires a `Bearer <jwt>` access token whose `scopes` claim includes `admin`.

## Configuration

Runtime configuration is environment-variable driven (`auth_service/env_config.js`).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Sequelize environment; selects a block in `server/config.json` |
| `MYSQL_HOST` | `auth_service_mysql` | MySQL host |
| `MYSQL_USERNAME` | `root` | MySQL username |
| `MYSQL_ROOT_PASSWORD` | *(empty)* | MySQL password |
| `MYSQL_DATABASE` | `auth` | MySQL database name |
| `PUBLIC_PEM` | *(empty)* | RSA public key (PEM) used to verify JWT access tokens (RS256) |
| `PRIVATE_PEM` | *(empty)* | RSA private key (PEM) used to sign JWT access tokens (RS256) |
| `USERNAME` / `PASSWORD` | *(empty)* | Static test-user credentials that bypass LDAP/RSA in the `basicAuth` handler |
| `LONG_EXPIRE` | `43200` (seconds) | Maximum session age; refreshing a token issued longer ago than this returns `403` |
| `AUTH_METHOD` | `password` | Expected value of the `X-AUTH-METHOD` header for non-test-user logins (`password` routes to LDAP, `rsa` routes to RSA SecurID) |
| `LDAP_URL` | *(empty)* | LDAP server URL used for authentication and group lookups |
| `LDAP_BASE_DN` | `dc=example,dc=com` | Base DN appended to `ou=personnel,` for LDAP bind/search operations |
| `LDAP_GROUP_OBJECTCLASS` | `groupOfNames` | LDAP `objectclass` used to filter group searches |
| `RSA_URL` | `https://tfa-primary.example.com:5555/mfa/v1_1/authn` | RSA Authentication API base URL |
| `RSA_CLIENT_ID` | `jw1` | RSA Authentication API client ID |
| `RSA_CLIENT_KEY` | *(empty)* | RSA Authentication API client key |
| `PORT` | `8080` | HTTP port the service listens on |
| `LOG_LEVEL` | `debug` | Winston log level: `critical`, `error`, `warning`, `info`, `debug`, `trace` |
| `LOG_FILE_PATH` | *(unset)* | If set, also writes logs to this file (rotated at 5MB, 2 files) |

Note that `redis.js` connects to a hardcoded Redis host (`auth_service_redis`, port `6379`) with no environment variable override. Swagger/bagpipes routing configuration lives in `auth_service/config/default.yaml`.

## Project Structure

```text
.
├── auth_service/
│   ├── api/
│   │   ├── controllers/     # Swagger route delegators + *Service business logic
│   │   ├── helpers/         # auth, JWT, LDAP, login helpers
│   │   └── swagger/         # OpenAPI 2.0 spec (swagger.yaml)
│   ├── config/               # swagger-node/bagpipes runtime config
│   ├── server/
│   │   ├── migrations/      # Sequelize/Umzug migrations & seed data
│   │   ├── models/          # Sequelize models (User, Role, Permission, Group, ...)
│   │   └── migrate.js       # migration CLI
│   ├── tests/unit/          # Jest unit tests
│   ├── app.js                # Express + swagger-express-mw entry point
│   ├── env_config.js         # environment variable loading/defaults
│   └── Dockerfile
└── .github/workflows/ci.yml  # GitHub Actions CI
```

## Development

Run the following from `auth_service/`:

```bash
npm install --legacy-peer-deps   # install dependencies (Node 22.23.4, see .nvmrc)
npm start                        # node app.js
npm test                         # run Jest unit tests
npm run test:watch               # watch mode
npm run test:coverage            # run with coverage (text, lcov, html)
```

`--legacy-peer-deps` is required because several pinned dependencies (`sequelize@3`, `swagger-express-mw@0.1.0`, `ldapjs@1`) predate modern npm peer-dependency resolution. A `postinstall` script (`scripts/patch-bagpipes.js`) applies a small, idempotent Node 12+ compatibility patch to the installed `bagpipes` package automatically after install.

`package.json` declares one narrowly-scoped `overrides` entry: `request` → `form-data@^2.5.6`. `request@2.88.2` (reached via `swagger-express-mw` → `bagpipes` → `machinepack-http`) pins `form-data@~2.3.2`, which is affected by GHSA-fjxv-7rqg-78g4 and GHSA-hmw2-7cc7-3qxx (both critical). `2.5.6` is the patched release on the same `form-data` 2.x major, so the override stays within the parent's major version. It is scoped to `request` specifically so that `axios`'s own `form-data@4.x` is left untouched.

There is no lint, format, or type-check script currently defined in `package.json`.

## Testing & CI

Tests use [Jest](https://jestjs.io/) and live under `auth_service/tests/unit`:

```bash
cd auth_service
npm test              # or: npm run test:coverage
```

`auth_service/jest.config.js` enforces coverage thresholds (100% branches/functions/statements/lines globally, with a documented carve-out to 99% statements/lines for `RoleService.js`) over `node_funcs.js`, `env_config.js`, `redis.js`, and everything under `api/controllers/` and `api/helpers/`.

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `devel` and `main`:

- **Test** — installs dependencies with `npm ci --legacy-peer-deps` using the Node version pinned in `auth_service/.nvmrc`, then runs `npm run test:coverage`.
- **Docker Build** — builds the production image (`docker build auth_service`) after the test job passes.

## Documentation

The REST API is fully described by the OpenAPI 2.0 document at `auth_service/api/swagger/swagger.yaml` and served interactively via Swagger UI at `/docs` once the service is running.

For a deeper technical dive into the architecture, controller/service/helper layering, and configuration, see the [DeepWiki](docs/README.md).

## Contributing

This repository does not yet include a `CONTRIBUTING.md`. In the meantime:

1. Clone the repository and create a branch off `devel` for your change.
2. Make your changes, adding or updating tests under `auth_service/tests/unit`.
3. From `auth_service/`, run `npm test` (or `npm run test:coverage`) and ensure it passes.
4. Open a pull request against `devel`; CI (`.github/workflows/ci.yml`) must pass.

## Security

This repository does not currently include a `SECURITY.md` or a published vulnerability-disclosure process. For security concerns, contact the Ingenium development team.

## License

This project is licensed under the Apache License 2.0. See the [`LICENSE`](LICENSE) file for the full text.
