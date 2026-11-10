# Development & Testing

[← Back to Home](./README.md) · [Configuration](./Configuration.md)

## Local setup

Full step-by-step setup (cloning, environment variables, installing dependencies, and a working `curl` example) is maintained in the root [`README.md`](../README.md#installation) — this page does not repeat it. There is no `docker-compose.yml`/`Makefile` in this repository; MySQL and Redis must be provisioned and made reachable independently (see [Configuration](./Configuration.md#how-environment-variables-are-supplied)). One detail worth calling out for the inner development loop:

- `app.js` runs migrations **automatically at boot** via `index.init_db(10)` (see [Core Components](./Core-Components.md#bootstrap-auth_serviceappjs)), retrying the DB connection up to 10 times, 5 seconds apart. Running `node server/migrate.js up` manually (as the README's step 4 does) is mainly useful when iterating on a new migration without restarting the whole process.

## Database migrations (`server/migrate.js`)

A thin CLI wrapper around **Umzug 2.x** with Sequelize storage. Run via `node server/migrate.js <command>` from inside `auth_service/`:

| Command | Effect |
|---|---|
| `status` | Print executed vs. pending migrations |
| `up` / `migrate` | Run all pending migrations (`umzug.up()`) |
| `down` / `reset` | Revert all executed migrations (`umzug.down({to: 0})`) |
| `next` / `migrate-next` | Run only the next pending migration |
| `prev` / `reset-prev` | Revert only the most recently executed migration |
| `reset-hard` | `dropAllSchemas()` — destructive; used by `init_db` when it detects an empty `auth` schema at boot |

Migrations live in `server/migrations/`, ordered by timestamp filename; see [Core Components](./Core-Components.md#migrations-servermigrations) for what each one does (schema creation, then seed data for default permissions/roles/groups/test account, then the `venue_group_id`/`for_venue_group` columns).

## Running the service

```
cd auth_service
npm start          # node app.js — listens on $PORT or env_config.PORT (8080)
```

`postinstall` runs `node scripts/patch-bagpipes.js` automatically after `npm install`/`npm ci` — it patches the `bagpipes@0.0.6` dependency in `node_modules` so its fitting loader doesn't crash on Node 12+ (see the comment header in that script). This is idempotent and safe to re-run.

## Running tests

```
cd auth_service
npm test              # jest
npm run test:watch    # jest --watch
npm run test:coverage # jest --coverage
```

### Test structure

- **Framework:** Jest 29 (`auth_service/package.json` devDependency). No integration/E2E test runner (e.g. supertest) is present — all tests are unit tests.
- **Location:** `auth_service/tests/unit/*.test.js`, one file per module under test (mirrors `api/controllers/*Service.js`, `api/helpers/*.js`, plus `node_funcs.js`, `env_config.js`, `redis.js`, and the controller-delegation contract).
- **Setup:** `auth_service/tests/setup.js` (via `jest.config.js#setupFiles`) registers a no-op `process.on('unhandledRejection', ...)` handler so intentionally-unhandled bluebird rejections in negative-path tests don't crash CI — see the inline comment in that file for the full rationale.
- **Mocks:** `auth_service/tests/unit/mocks/`
  - `mockDatabase.js` — `mockModels()`/`mockModel()`/`mockInstance()` build fully-jest-mocked stand-ins for `server/models/index.js` (every Sequelize finder/association method defaults to a benign resolved value; every test overrides only what it needs). **No test connects to a real MySQL database.**
  - `mockRedis.js` — `mockRedisClient()` mirrors the shape of `redis.js`'s exported client, including the promisified `*Async` methods `jwt_helper.js` relies on.
  - `testHelpers.js` — `mockResponse()` (chainable `res.status().json()` jest mock), `mockRequest()`, `withEnv()` (snapshot/restore `process.env` for env-dependent tests), `flush()` (drains microtask/macrotask queues so fire-and-forget promise chains inside controllers settle before assertions run).
- **Isolation pattern:** most test files `jest.doMock(...)` their collaborators (models, helpers, `node_funcs`) *before* `require`-ing the module under test, then `jest.resetModules()` + `jest.clearAllMocks()` in `afterEach` — this is why `jest.config.js` does not need `resetModules: true` globally.

### What's covered

| Test file | Subject |
|---|---|
| `AuthenticationService.test.js` | `login`, `logout`, `refresh_token` |
| `GroupService.test.js`, `PermissionService.test.js`, `RoleService.test.js`, `UserService.test.js` | Full CRUD/query logic for each RBAC entity (the largest file, `RoleService.test.js`, covers all 16 exported role operations) |
| `LdapService.test.js`, `ldap_helper.test.js` | LDAP search/validation wrappers |
| `LoggingService.test.js` | Health check, log-level get/set |
| `authenticate.test.js` | `ldap_authenticate`, `rsa_authenticate` |
| `jwt_helper.test.js` | Token encode/decode/refresh/blacklist logic |
| `login_helper.test.js` | RBAC permission resolution (`getPermission`, `ensure_user(s)`, `ensure_groups`) |
| `controllers_delegators.test.js` | Every controller forwards to its service with the right arguments (see [Core Components](./Core-Components.md#controllers-auth_serviceapicontrollersjs-delegators)) |
| `env_config.test.js` | Every environment variable's default and override behavior |
| `node_funcs.test.js` | Logger formatting, `parse_username`, `String.prototype.format` |
| `redis.test.js` | Redis client construction/event handlers |

### Coverage thresholds

`jest.config.js` requires **100%** branch/function/statement/line coverage across `node_funcs.js`, `env_config.js`, `redis.js`, `api/controllers/**`, and `api/helpers/**`, with one explicit exception: `api/controllers/RoleService.js` is allowed 99% statements/lines because of a known-dead `ReferenceError` branch (see [Core Components](./Core-Components.md#roleservicejs-largest-service--the-rbac-management-surface)). **A `npm run test:coverage` run that drops below these thresholds will fail** — this is enforced identically in CI (see [CI/CD](./Ci-Cd-And-Deployment.md)).

## Linting / formatting / type-checking

**Not present in this repository.** There is no ESLint/Prettier/TSConfig, no `lint` npm script, and no related devDependency in `package.json`. Code style is enforced only by review, not tooling. Do not assume a linter will catch style issues before CI.

## Debugging tips

- Set `LOG_LEVEL=trace` (env var, read directly by `node_funcs.js`) to see the most verbose logging, including per-request `isInterceptable`/`intercept` traces from the `app.js` response logger.
- Set `LOG_FILE_PATH=/some/path.log` to also write logs to a rotating file (5MB × 2 files) in addition to the console.
- `npm run test:watch` is the fastest inner loop for changes to a single service/helper, since every test module mocks its own dependencies (no DB/Redis/LDAP required).
- Because `server/models/index.js` opens a real Sequelize connection **at module-require time** and attempts `CREATE DATABASE`, importing it outside of the mocked test environment (e.g. in a plain `node -e "require('./server/models')"`) requires a reachable MySQL instance — this is why every service test mocks `../../server/models/index.js` rather than importing it directly.

## Cross-references

- [Configuration](./Configuration.md) — every environment variable and how it is supplied to the process.
- [CI/CD & Deployment](./Ci-Cd-And-Deployment.md) — how these same commands run in GitHub Actions.
- [Extending & Troubleshooting](./Extending-And-Troubleshooting.md) — patterns to follow when adding a new service/test.
