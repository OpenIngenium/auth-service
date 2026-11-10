# API Reference

[← Back to Home](./README.md) · [Architecture](./Architecture.md) · [Core Components](./Core-Components.md) · [Security](./Security-And-Error-Handling.md)

This page is a navigable index over the authoritative contract: `auth_service/api/swagger/swagger.yaml` (Swagger/OpenAPI 2.0, served at `<host>/docs` per the README, and at `<host>/api/v2` per `basePath`). Full request/response schemas belong in that file — this page maps **routes → controller → service → required scope** so you can jump straight to the implementation.

## Authorization defaults

`swagger.yaml` declares a **global default security requirement**:

```yaml
security:
  - ingenium_auth:
    - admin
```

Any operation that does **not** declare its own `security:` block inherits this — it requires a Bearer JWT whose `scopes` claim includes `admin`. Operations that override this are noted individually below. See [Security & Error Handling](./Security-And-Error-Handling.md) for how the JWT and scope check work.

## Authentication

| Method & Path | operationId | Controller → Service | Auth |
|---|---|---|---|
| `GET /login` | `login` | `authentication.js` → `AuthenticationService.login` | HTTP Basic (`basicAuth` handler; LDAP, RSA MFA, or configured test user depending on `AUTH_METHOD`) |
| `POST /refresh_token` | `refresh_token` | `authentication.js` → `AuthenticationService.refresh_token` | Bearer JWT, scope `basic` |
| `POST /logout` | `logout` | `authentication.js` → `AuthenticationService.logout` | Bearer JWT, scope `basic` |

`login` returns `{access_token, access_token_timeout}` on success (`200`) or `401` if the user resolves to zero scopes. `refresh_token` returns a new pair (`200`) or `401` if the token can't be decoded/is blacklisted. `swagger.yaml` also documents a `403` for the 12-hour (`LONG_EXPIRE`) window elapsing, but **this code path is currently unreachable** — see [Security & Error Handling](./Security-And-Error-Handling.md#token-issuance--verification-jwt) for the property-name bug that causes it to instead return `200` with a broken payload. `logout` blacklists the token's `jti` in Redis and returns `200`.

## Roles

All under the default `ingenium_auth`/`admin` requirement.

| Method & Path | operationId | Service function |
|---|---|---|
| `GET /roles` | `get_all_roles` | `RoleService.get_all_roles` — filters: `name` (prefix), `venue_group_id`, `offset`, `limit`, `order` |
| `POST /roles` | `create_role` | `RoleService.create_role` — body: `{name, description?, venue_group_id?, users?, groups?, permissions?}` |
| `GET /roles/{role_id}` | `get_role` | `RoleService.get_role` — full role incl. users/groups/permissions |
| `PUT /roles/{role_id}` | `edit_role` | `RoleService.edit_role` — replaces the role's users/groups/permissions |
| `DELETE /roles/{role_id}` | `delete_role` | `RoleService.delete_role` |
| `GET /roles/{role_id}/permissions` | `get_role_permissions` | `RoleService.get_role_permissions` |
| `PUT /roles/{role_id}/permissions` | `edit_role_permissions` | `RoleService.edit_role_permissions` — body: array of permission ids |
| `DELETE /roles/{role_id}/permissions/{permission_id}` | `delete_role_permission` | `RoleService.delete_role_permission` |
| `GET /roles/{role_id}/groups` | `get_role_groups` | `RoleService.get_role_groups` |
| `PUT /roles/{role_id}/groups` | `edit_role_groups` | `RoleService.edit_role_groups` — body: array of group names (LDAP-validated) |
| `DELETE /roles/{role_id}/groups/{group_id}` | `delete_role_group` | `RoleService.delete_role_group` |
| `GET /roles/{role_id}/users` | `get_role_users` | `RoleService.get_role_users` |
| `PUT /roles/{role_id}/users` | `edit_role_users` | `RoleService.edit_role_users` — body: array of usernames (LDAP-validated) |
| `DELETE /roles/{role_id}/users/{user_id}` | `delete_role_user` | `RoleService.delete_role_user` |

> `RoleService.add_role_group` and `RoleService.add_role_user` exist and are wired in `role.js`, but **no `swagger.yaml` path currently declares their `operationId`s** — they are unreachable via the documented API surface. See [Core Components](./Core-Components.md#controllers-auth_serviceapicontrollersjs-delegators) and [Extending & Troubleshooting](./Extending-And-Troubleshooting.md).

## Permissions

All under the default `admin` requirement.

| Method & Path | operationId | Service function |
|---|---|---|
| `GET /permissions` | `get_all_permissions` | `PermissionService.get_all_permissions` |
| `GET /permissions/{permission_id}` | `get_permission` | `PermissionService.get_permission` |
| `GET /permissions/{permission_id}/users` | `get_users_for_permission` | `PermissionService.get_users_for_permission` |
| `GET /permissions/{permission_id}/groups` | `get_groups_for_permission` | `PermissionService.get_groups_for_permission` |

## Users

All under the default `admin` requirement.

| Method & Path | operationId | Service function |
|---|---|---|
| `GET /users` | `get_all_users` | `UserService.get_all_users` — filters: `q` (username prefix), `offset`, `limit`, `order`, `loggedin` (`Yes`/`No`), `rolefilter`, `scopefilter`, `groupfilter` |
| `GET /users/{user_id}` | `get_user` | `UserService.get_user` |

## Groups

All under the default `admin` requirement.

| Method & Path | operationId | Service function |
|---|---|---|
| `GET /groups` | `get_all_groups` | `GroupService.get_all_groups` — filters: `q` (name prefix), `offset`, `limit`, `order`, `rolefilter`, `userfilter`, `scopefilter` |
| `GET /groups/{group_id}` | `get_group` | `GroupService.get_group` |

> `group.js`/`GroupService.delete_group` is implemented and covered by tests, but — like `add_role_group`/`add_role_user` above — **`swagger.yaml` defines no `delete` operation for `/groups/{group_id}`** (only `get`). It is unreachable via the documented API surface.

## LDAP lookups (autocomplete)

| Method & Path | operationId | Auth | Service function |
|---|---|---|---|
| `GET /ldap/groups?q=` | `search_groups` | Bearer JWT, scope `basic` | `LdapService.search_groups` |
| `GET /ldap/users?q=` | `search_users` | Bearer JWT, scope `basic` | `LdapService.search_users` |

## Logging / operations

| Method & Path | operationId | Auth | Service function |
|---|---|---|---|
| `GET /health` | `health` | **None** (`security: []`) | `LoggingService.health` — liveness probe, always `200` |
| `GET /logging` | `loglevelGET` | Default (`admin`) | `LoggingService.loglevelGET` — returns `{level: global.LogLevel}` |
| `POST /logging` | `loglevelPOST` | Default (`admin`) | `LoggingService.loglevelPOST` — body: `{loglevel}`, one of `ERROR`/`WARNING`/`INFO`/`DEBUG`/`TRACE` |

## Meta

| Method & Path | Purpose |
|---|---|
| `GET /swagger` | Raw Swagger document (`x-swagger-pipe: swagger_raw`) |
| `GET /` (outside the Swagger contract, defined directly in `app.js`) | Plaintext liveness string: `"This is the auth-Z piece!!"` |

## Common response schema

Almost every non-2xx response uses `#/definitions/ErrorResponse`: `{"message": string}`. Successful list endpoints (`/users`, `/groups`, `/roles`) return `{"total": integer, "results": [...]}`; single-entity endpoints return the entity schema directly (`#/definitions/user`, `role_full_info`, `permission`, `group`).

## Cross-references

- [Core Components](./Core-Components.md) — implementation detail behind each service function above.
- [Security & Error Handling](./Security-And-Error-Handling.md) — how `ingenium_auth`/`basicAuth` and scope checks work, and the status-code conventions services follow.
- [Configuration](./Configuration.md) — `AUTH_METHOD`, `LDAP_URL`, `RSA_URL`, and the other env vars referenced by the auth routes.
