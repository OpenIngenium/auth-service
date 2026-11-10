# Extending & Troubleshooting

[← Back to Home](./README.md) · [Core Components](./Core-Components.md) · [API Reference](./Api-Reference.md) · [Development & Testing](./Development-And-Testing.md)

## Contribution workflow

The root [`README.md`](../README.md#contributing) documents the process: branch off `devel`, add/update tests under `auth_service/tests/unit`, run `npm test`/`npm run test:coverage` from `auth_service/`, then open a PR against `devel` (GitHub Actions CI — see [CI/CD & Deployment](./Ci-Cd-And-Deployment.md) — must pass). The remainder of this page covers the **code-level** patterns to follow for specific kinds of changes.

## Adding a new endpoint

Following the existing pattern (e.g. `role.js` / `RoleService.js`):

1. **Contract first** — add the path/operation to `auth_service/api/swagger/swagger.yaml`: method, `operationId`, `x-swagger-router-controller`, `parameters`, `responses` (reuse `#/definitions/ErrorResponse` for error cases), and an explicit `security:` block if the operation should **not** inherit the global default (`ingenium_auth`/`admin` — see [API Reference → Authorization defaults](./Api-Reference.md#authorization-defaults)).
2. **Controller** — add a delegator function to the matching file in `auth_service/api/controllers/` (or create a new controller file + `*Service.js` pair if it's a new resource). Keep controllers thin: extract `req.swagger.params` and call `Service.method(args, res, next)`, matching the pattern every other controller follows.
3. **Service** — implement the business logic in the corresponding `*Service.js`. Follow the existing error-handling shape (`.then(...).catch(...)`, `log.<level>`, `res.status(code).json({message})`) documented in [Security & Error Handling](./Security-And-Error-Handling.md#error-handling-conventions).
4. **Tests** — add a `describe` block to the relevant `auth_service/tests/unit/*.test.js` file, mocking `server/models/index.js` via `tests/unit/mocks/mockDatabase.js` and any helpers via `jest.doMock`. Add a case to `controllers_delegators.test.js` if you added a new controller function. Confirm `npm run test:coverage` still meets the thresholds in `jest.config.js` (see [Development & Testing](./Development-And-Testing.md#coverage-thresholds)).

## Wiring up the already-implemented but unreachable operations

Three service functions exist, are tested, and are delegated-to by their controllers, but have no corresponding `swagger.yaml` path (see [Core Components](./Core-Components.md#controllers-auth_serviceapicontrollersjs-delegators) and [API Reference](./Api-Reference.md#roles)):

- `RoleService.add_role_group` (intended: `POST /roles/{role_id}/groups`)
- `RoleService.add_role_user` (intended: `POST /roles/{role_id}/users`)
- `GroupService.delete_group` (intended: `DELETE /groups/{group_id}`)

If you need this functionality exposed, the implementation and tests already exist — the only missing piece is the corresponding path/operation block in `swagger.yaml` (with an appropriate `security:` override if these should differ from the endpoint's siblings, which currently default to `admin`). The repository does not document whether this omission is intentional (e.g. deliberately disabled) or an oversight, so confirm with the endpoint's owner before wiring it up.

## Adding a migration

1. Create a new file in `auth_service/server/migrations/`, named with a timestamp prefix (`YYYYMMDDHHMMSS-description.js`) so Umzug orders it correctly — follow the existing files for the `{up, down}` export shape.
2. If it's a schema change to an existing model, also update the corresponding file in `auth_service/server/models/` so Sequelize's in-memory model matches the database (see `20240930000000-venuegroup.js` + `server/models/role.js`/`permission.js` for a recent example of both being updated together).
3. Run it locally with `node server/migrate.js up` (or `next`) — see [Development & Testing → Database migrations](./Development-And-Testing.md#database-migrations-servermigratejs).
4. Remember: `server/config.json` (used by `sequelize-cli`) and `env_config.js` (used by the running app and `server/migrate.js`) are **two separate configuration paths** — see [Configuration](./Configuration.md#database-connection-config-auth_serviceserverconfigjson-and-sequelizerc). Don't assume changing one affects the other.

## Known gaps and oddities (for accuracy, not as a to-do list)

These are documented here because they are easy to trip over when extending the code, not as criticism of the implementation:

- **`global.LogLevel = env_config.DEBUG`** (`auth_service/app.js`) — `env_config.js` never exports a `DEBUG` property, so this is `undefined` at startup. `GET /logging` will report `{"level": undefined}` until `POST /logging` is called at least once. See [Core Components](./Core-Components.md#bootstrap-auth_serviceappjs).
- **`POST /logging` does not change actual log verbosity** — it only mutates the `global.LogLevel` value returned by `GET /logging`; the real Winston logger level is fixed at process start from `process.env.LOG_LEVEL` (default `debug`) and is never re-read. See [Core Components](./Core-Components.md#loggingservicejs).
- **Unreachable operations** — `add_role_group`, `add_role_user`, `delete_group` (see above).
- **`POST /refresh_token` can never return its documented `403`** — `AuthenticationService.refresh_token` checks `new_token.token == "error"`, but `jwt_helper.js#refresh_token` actually returns `{access_token: "error"}` on `LONG_EXPIRE` expiry, so the check always fails and the request falls through to a `200` response with a broken (`access_token: "error"`, `access_token_timeout: undefined`) body instead of a `403`. See [Security & Error Handling](./Security-And-Error-Handling.md#token-issuance--verification-jwt) for the full trace, including why the existing unit test for this path doesn't catch it (it mocks the wrong return shape).
- **Dead branch in `RoleService.edit_role_groups`** — the "one or more groups invalid" error path references an undefined `invalid_groups` variable (should likely be computed via `_.difference(desired_groups, valid_groups)`, as the analogous code in `edit_role_users` does with `invalid_users`). This would throw a `ReferenceError` if the branch were ever reached with mismatched lengths. `jest.config.js` carves out a lower coverage threshold for this file specifically to acknowledge the branch is intentionally left uncovered/unfixed. See [Core Components](./Core-Components.md#roleservicejs-largest-service--the-rbac-management-surface).
- **`UserGroup`/`UserPermission` associations and seed data are not consulted by any authorization code path** — `login_helper.getPermission` (the function that determines what a user can do) resolves permissions exclusively through Roles (direct or LDAP-group-inherited), never through a user's direct `Group`/`Permission` associations, even though those associations and some seed rows exist. See [Core Components](./Core-Components.md#data-model--rbac-servermodels).
- **LDAP TLS is deliberately weakened** — `env_config.ldap_tls_options` pins `minVersion`/`maxVersion: TLSv1` and `ciphers: DEFAULT@SECLEVEL=0`. If you're troubleshooting a TLS handshake failure against a different LDAP server, this is the first place to look; the rationale for this specific policy is not documented in the repository.
- **No orchestration files** — there is no `docker-compose.yml`, `Makefile`, or `apache/` reverse-proxy configuration in this repository. Deployment topology (how the built image is networked with MySQL/Redis/a reverse proxy in a real environment) is not documented in the repository.
- **No `.env.example`** — the root README describes required/optional variables in prose, and [Configuration](./Configuration.md) enumerates them from `env_config.js`, but there is no sample file to copy from.
- **No linter/formatter/type-checker** — see [Development & Testing](./Development-And-Testing.md#linting--formatting--type-checking).
- **`bluebird` is used directly** (`var Promise = require('bluebird')` in most `*Service.js`/helper files) **but is not a direct dependency in `package.json`** — it is present in `node_modules` only transitively (bundled with `sequelize@3`). If a future dependency upgrade drops that transitive copy, every file using `Promise.join`/`Promise.map` would break.

## Troubleshooting (from the repository's own documentation and code comments)

- **"Could not establish connection with MySQL."** (logged by `app.js`) — `index.init_db(10)` failed all 10 attempts (50+ seconds of retrying). Confirm the host named by `MYSQL_HOST` (default `auth_service_mysql`) is reachable and that credentials match; since this repository has no orchestration files, ensure you provisioned MySQL yourself under that hostname (or set `MYSQL_HOST` to point at wherever it actually runs) before starting the app.
- **`bagpipes` "Error initializing middleware" on startup** — historically caused by `bagpipes@0.0.6`'s fitting loader breaking on Node 12+'s multi-line `MODULE_NOT_FOUND` error messages. `scripts/patch-bagpipes.js` fixes this automatically on `npm install`/`npm ci` (via the `postinstall` hook). If you see this error, check whether `node_modules/bagpipes/lib/fittingTypes/user.js` was actually patched (the script logs `[patch-bagpipes] applied ...` or `already patched.` on success, and a warning if the expected code snippet wasn't found — which would mean the `bagpipes` version changed and the patch needs updating).
- **A seeded/local test user needs a role it doesn't have** — the test account (named by `USERNAME`/`PASSWORD`, seeded by `server/migrations/20170519012826-test_account.js`) is not backed by real LDAP group membership, so it can't be added to a role through the normal `PUT /roles/{role_id}/users` flow if `ldap_helper.validate_users_exist` would reject it — except that `RoleService.validate_users_and_groups` explicitly special-cases this exact username so it is never rejected (see [Core Components](./Core-Components.md#roleservicejs-largest-service--the-rbac-management-surface)). If you still need to attach it to arbitrary roles/permissions outside the API, direct `INSERT`s into `RoleUsers`/`RolePermissions` (as the seed migrations themselves do) are the fallback.
- **A login succeeds but returns 401** — per [Architecture → Login flow](./Architecture.md#login-and-token-issuance-flow), authentication success is necessary but not sufficient: the user must resolve to at least one non-empty scope via `login_helper.getPermission` (a Role, direct or via an LDAP group that maps to a known `Group` row, with at least one `Permission`). Check that the user (or one of their LDAP groups) is actually attached to a Role with Permissions in the `auth` database — LDAP membership alone is not enough.

## Cross-references

- [Core Components](./Core-Components.md) — implementation detail for every gap listed above.
- [Security & Error Handling](./Security-And-Error-Handling.md) — the security model these gaps interact with.
- [CI/CD & Deployment](./Ci-Cd-And-Deployment.md) — the container build/run story and the two parallel CI pipelines.
