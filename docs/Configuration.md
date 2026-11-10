# Configuration

[← Back to Home](./README.md)

The service is configured almost entirely through **environment variables**, read once at process start by `auth_service/env_config.js`. A few structural settings (the Swagger/bagpipes pipeline, the Sequelize CLI connection, coverage thresholds) live in dedicated config files.

## Environment variables (`auth_service/env_config.js`)

| Variable | Default (if unset) | Consumed by | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | `env_config.env` (not otherwise referenced by the running app) | Standard Node environment marker. Also read directly by the **Sequelize CLI** (not `env_config.js`) to pick a block from `server/config.json` — but only when `sequelize-cli` is invoked directly; `node app.js`/`server/migrate.js` always connect using `env_config.js`'s `MYSQL_*` variables regardless of `NODE_ENV`. See [Database connection config](#database-connection-config-auth_serviceserverconfigjson-and-sequelizerc). |
| `MYSQL_USERNAME` | `root` | `server/models/index.js`, `server/migrate.js` | Sequelize DB user |
| `MYSQL_ROOT_PASSWORD` | `''` | same | Sequelize DB password |
| `MYSQL_DATABASE` | `auth` | same | Database name |
| `MYSQL_HOST` | `auth_service_mysql` | same | MySQL host. This default value is only reachable if MySQL is provisioned under that hostname (e.g. a container named/aliased `auth_service_mysql`); the repository does not include orchestration files that create such a container, so this variable normally must be set explicitly (see the root [README's Prerequisites](../README.md#prerequisites)) |
| `PUBLIC_PEM` | `''` | `app.js` (JWT verify), `node_funcs.js` (`parse_username`), `jwt_helper.js` | RSA **public** key (PEM text, not a file path) used to verify JWTs (`RS256`) |
| `PRIVATE_PEM` | `''` | `jwt_helper.js` (`encode_token`) | RSA **private** key (PEM text) used to sign JWTs |
| `USERNAME` | `''` | `env_config.test_user`, used in `app.js` `basicAuth` handler and `RoleService.validate_users_and_groups` | Configured local test account username (bypasses LDAP/RSA) |
| `PASSWORD` | `''` | `env_config.test_pass`, `app.js` `basicAuth` handler | Configured local test account password |
| `LONG_EXPIRE` | `43200` (seconds = 12h) | `jwt_helper.refresh_token` | Maximum age (from original issuance) a token may reach `/refresh_token` |
| `AUTH_METHOD` | `password` | `app.js` `basicAuth` handler | `password` → LDAP bind; `rsa` → RSA SecurID MFA. Can be overridden per-request via the `X-AUTH-METHOD` header |
| `LDAP_URL` | `''` | `authenticate.js`, `ldap_helper.js` | LDAP server URL for bind/search operations |
| `LDAP_BASE_DN` | `dc=example,dc=com` | `authenticate.js`, `ldap_helper.js` | Base DN appended to `ou=personnel,` for bind/search operations |
| `LDAP_GROUP_OBJECTCLASS` | `groupOfNames` | `ldap_helper.js` | LDAP `objectclass` used to filter group searches |
| `RSA_URL` | `https://tfa-primary.example.com:5555/mfa/v1_1/authn` | `authenticate.js` (`rsa_authenticate`) | RSA SecurID MFA API base URL |
| `RSA_CLIENT_ID` | `jw1` | `authenticate.js` | RSA MFA `clientId` |
| `RSA_CLIENT_KEY` | `''` | `authenticate.js` | RSA MFA `client-key` header |
| `PORT` *(not read via `env_config`; read directly as `process.env.PORT`)* | `8080` (via `env_config.PORT`) | `app.js` | HTTP listen port |
| `LOG_LEVEL` *(read directly as `process.env.LOG_LEVEL`, not via `env_config`)* | `debug` | `node_funcs.js` (winston logger level) | Controls the actual verbosity of `node_funcs.log` |
| `LOG_FILE_PATH` | unset (Console transport only) | `node_funcs.js` | If set, adds a rotating file transport (`maxsize: 5MB`, `maxFiles: 2`) alongside the console transport |

Fixed (non-overridable) constants also defined in `env_config.js`: `ACCESS_TOKEN_TIMEOUT = '3410s'` (~56.8 min access-token lifetime), `TEN_SEC_OFFSET = 10` (clock-skew tolerance baked into `iat`), and `ldap_tls_options = {minVersion: 'TLSv1', maxVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=0'}` (used by both `authenticate.js` and `ldap_helper.js` when creating `ldapjs` clients).

> **`env_config.js` also references `env_config.DEBUG`** in `app.js` (`global.LogLevel = env_config.DEBUG`) but `env_config.js` never defines a `DEBUG` export — this evaluates to `undefined` at startup. This looks unintentional; see [Extending & Troubleshooting](./Extending-And-Troubleshooting.md).

All of the above is exercised directly by `auth_service/tests/unit/env_config.test.js`, which is the fastest way to confirm current default/override behavior.

## How environment variables are supplied

There is no `docker-compose.yml`, `Makefile`, or committed `.env`/`.env.example` file in this repository, and the application does not load a `.env` file itself (no `dotenv` dependency in `package.json`). Environment variables must be supplied directly to the Node process — e.g. exported in the shell before `npm start`, or passed via `docker run --env-file .env -p 8080:8080 auth-service` as documented in the root [README's Installation](../README.md#installation) section. Token signing uses an RS256 **RSA keypair** (`PRIVATE_PEM`/`PUBLIC_PEM`), not a shared HMAC secret; the README documents generating one locally with `openssl genrsa`/`openssl rsa -pubout`.

## Swagger / routing pipeline: `auth_service/config/default.yaml`

Loaded by `swagger-express-mw` (`SwaggerExpress.create({appRoot: __dirname, ...})` in `app.js`, which resolves `config/default.yaml` by swagger-node convention). Defines:

- `swagger.fittingsDirs` / `swagger.bagpipes` — the `swagger_controllers` pipe described in [Core Components](./Core-Components.md#swagger--bagpipes-pipeline-auth_serviceconfigdefaultyaml).
- `swagger.swaggerControllerPipe: swagger_controllers` — tells `swagger_router` which pipe to run for every operation.

This file is structural (routing/validation/security ordering) and is **not** meant to hold secrets or per-environment values — there is no `staging.yaml`/`production.yaml` override in the repository, so `default.yaml` is the only configuration for every environment.

## Database connection config: `auth_service/server/config.json` and `.sequelizerc`

`.sequelizerc` points the **Sequelize CLI** (not the app itself) at `server/config.json`, `server/migrations`, and `server/models`. `server/config.json` defines `development`/`test`/`production` blocks, all hard-coded to `username: root`, `password: pwpwpw`, `database: auth`, `host: auth_service_mysql`, `dialect: mysql`. **This file is only used if you invoke the `sequelize-cli` directly** (e.g. `npx sequelize db:migrate`); the application's own migration path (`server/migrate.js`, and `index.js#init_db` at boot) builds its Sequelize connection from `env_config.js`, not from `config.json`. Keep this in mind if you change database credentials — they must be updated via environment variables for the running app to pick them up; `config.json` only affects direct CLI usage.

## Test configuration: `auth_service/jest.config.js`

- `testEnvironment: 'node'`, `setupFiles: ['<rootDir>/tests/setup.js']` (registers a no-op `unhandledRejection` handler to prevent bluebird's internal rejection-tracking from crashing CI — see the comment in `tests/setup.js`).
- `testMatch: ['**/tests/unit/**/*.test.js']`.
- `collectCoverageFrom` scopes coverage to first-party logic: `node_funcs.js`, `env_config.js`, `redis.js`, `api/controllers/**/*.js`, `api/helpers/**/*.js`; explicitly excludes `api/mocks/**` (inactive, see [Core Components](./Core-Components.md)) and `node_modules/**`. `app.js` and everything under `server/**` (models/migrations) are excluded from unit-test coverage as integration/bootstrap concerns.
- `coverageThreshold.global` requires **100%** branches/functions/statements/lines, with a single carve-out for `./api/controllers/RoleService.js` (`statements`/`lines: 99`) documented inline as covering the dead `invalid_groups` `ReferenceError` branch in `edit_role_groups` — see [Core Components](./Core-Components.md#roleservicejs-largest-service--the-rbac-management-surface).

## Configuration precedence summary

1. **Environment variables** (highest precedence for anything read via `env_config.js`, `process.env.PORT`, `process.env.LOG_LEVEL`, `process.env.LOG_FILE_PATH`), supplied directly to the process (shell export, `docker run --env-file`, or CI/deployment environment) — there is no `.env`-loading step in the application itself.
2. **Hard-coded defaults** in `env_config.js` (used whenever the corresponding environment variable is unset).
3. **`server/config.json`** — a separate, parallel configuration path used only by the Sequelize CLI, not by the running application.

## Cross-references

- [Development & Testing](./Development-And-Testing.md) — how these variables are supplied locally.
- [Security & Error Handling](./Security-And-Error-Handling.md) — why `PUBLIC_PEM`/`PRIVATE_PEM` and `AUTH_METHOD` matter for token integrity.
- [CI/CD & Deployment](./Ci-Cd-And-Deployment.md) — how the Dockerfile and CI pipeline consume these variables.
