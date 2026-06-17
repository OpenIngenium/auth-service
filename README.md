# Ingenium Auth Service

This repo contains the source code for the Ingenium authentication service. It consists of a swagger API running on NodeJS, backed by mySQL. The service issues tokens to clients based on LDAP authentication. Tokens are blacklisted following logout or client timeout. Blacklisted tokens are stored in Redis.

API documentation can be found at <servername>/docs

## Schema

A system `User` has `Roles` based on their individual identity and/or their membership in certain LDAP groups. A `User` may have a `Role` unique to them, or through their membership in a `Group`. `Roles` have different `Permissions`. The list of `Permissions` associated with a user dictates which endpoints that `User` may access.

### Associations

`User` N:M `Role`through `RoleUser`  
`Permission` N:M `Role` through `RolePermission`  
`Group` N:M `Role` through `RoleGroup`  

## Local Development

Local development requires docker and proper configuration of environment variables.

### Requirements:
- git
- docker
- docker-compose

### Setup
1. clone repo
2. Navigate to the auth_service folder. ```cd auth_service```

### Secrets
1. Create a file called ```.env``` in the project's root folder.
2. In `.env`, populate newline-delimited key value pairs with the format ```<KEY>=<VAL>```. ```JWT_SECRET``` is the only required value for local development. All other values have defaults that can be overridden in the ```.env``` file. These values can be found in ```auth_service/env_config.js```.
3. The auth service utilizes JSON web tokens for session persistence and security. When developing locally, developers can generate and use their own ```JWT_SECRET``` using the following command:

```node -e "console.log(require('crypto').randomBytes(256).toString('base64'));" ```
For other environments, ask a member of the ingenium team to securely share the appropriate JWT secret.

### Start the Containers
1. ```docker-compose up -d``` the -d flag instructs the containers to spin up in the background

### Setup the Database
1. Start a bash instance in the running auth_service container ```docker exec -it authservice_auth_service_1 bash```
2. Move to the auth_service folder``` cd auth_service ```

The repo comes with a helper script for executing migration steps: `migrate.js`.  It
supports the following commands:

- `status`: print current migration status
- `up/migrate`: executed all unexecuted migrations
- `down/reset`: revert all executed migrations
- `next/migrate-next`: execute the next pending migration
- `prev/reset-prev`: revert the previous executed migration
- `reset-hard`: reset the database using a `dropdb`/`createdb` mysql command

Execute a command via:

```node server/migrate.js <command>```

3. Run ```node server/migrate.js up``` to both migrate and seed the database. The seed files can be found in ```auth_service/server/migrations```. They create the predefined list of roles, and add the Ingenium developers to the system.

You're now ready to begin local development on ingenium-auth.

**Restoring from Backup**
Access the cron backup container `docker exec -it authservice_cron_1 bash` before executing the following command:  
```sql
mysql -u [user] -p[pass] --host=auth_service_mysql auth < /data/ingenium_auth_backup/daily/[backup-sql].sql
```
The username and password for MySQL are defined as environment variables in the `.env` file.

## Tests:
Tests are based on Python unittest framework. Change the `auth_server` variable in the test file to point the test suite at the endpoint under test, e.g. `localhost`. To run tests from the project root:

`python tests/auth_unit_test.py`


## Test User Account

For tests purpose, a test user account that is not connected with JPL LDAP may be used.

- username: set by an enviroment variable `USERNAME`
- password: set by environment variable `PASSWORD`

To assign a role to the user, you may need to update database directly by logging into auth_service container.

```
$ docker exec -it container-id-xxx bash
```

Inside the container, use mysql client. Use the root password set by an environment variable: `MYSQL_ROOT_PASSWORD`.

```
# mysql -u root -p
```
If `foo` user does not exists, add one.
```
mysql> use auth;
mysql> describe Users;
+--------------+--------------+------+-----+---------+----------------+
| Field        | Type         | Null | Key | Default | Extra          |
+--------------+--------------+------+-----+---------+----------------+
| id           | int(11)      | NO   | PRI | NULL    | auto_increment |
| display_name | varchar(255) | YES  |     | NULL    |                |
| username     | varchar(255) | NO   | UNI | NULL    |                |
| login_expire | datetime     | YES  |     | NULL    |                |
| createdAt    | datetime     | NO   |     | NULL    |                |
| updatedAt    | datetime     | NO   |     | NULL    |                |
+--------------+--------------+------+-----+---------+----------------+
6 rows in set (0.00 sec)

mysql> INSERT INTO Users(display_name, username, createdAt, updatedAt) VALUES("Ingenium Test User", "foo", CURDATE(), CURDATE());
Query OK, 1 row affected (0.00 sec)
```


Below is an example to assign a role `ROLE_8` to user `foo`.

```
mysql> use auth;
mysql> select * from Users
    -> ;
+----+--------------------+----------+---------------------+---------------------+---------------------+
| id | display_name       | username | login_expire        | createdAt           | updatedAt           |
+----+--------------------+----------+---------------------+---------------------+---------------------+
|  1 | Ingenium Test User | foo      | 2020-10-01 04:53:33 | 2019-08-08 19:39:34 | 2020-10-01 03:53:33 |
|  2 | Hongman Kim        | hongmank | 2020-10-05 23:21:26 | 2019-08-08 19:41:09 | 2020-10-05 22:21:26 |
|  3 | NULL               | swanchr  | 0000-00-00 00:00:00 | 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |
|  4 | NULL               | tsriniva | 0000-00-00 00:00:00 | 2019-08-19 20:19:31 | 2019-08-19 20:19:31 |
|  5 | NULL               | cwhetsel | 0000-00-00 00:00:00 | 2019-08-19 20:19:33 | 2019-08-19 20:19:33 |
+----+--------------------+----------+---------------------+---------------------+---------------------+
5 rows in set (0.01 sec)

mysql> select * from Roles;
+----+-----------+------------------------+---------------------+---------------------+
| id | name      | description            | createdAt           | updatedAt           |
+----+-----------+------------------------+---------------------+---------------------+
|  1 | Admin     | Admin role.            | 2019-08-08 19:39:34 | 2019-08-08 19:39:34 |
|  2 | test-role | Role for test account. | 2019-08-08 19:39:34 | 2019-08-08 19:39:34 |
|  3 | ROLE_1    | This is a test role    | 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |
|  4 | ROLE_2    | This is a test role    | 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |
|  5 | ROLE_3    | This is a test role    | 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |
| 10 | 1446_ROLE | This is a test role    | 2019-08-19 20:19:32 | 2019-08-19 20:19:32 |
| 11 | ROLE_8    | This is a test role    | 2019-08-19 20:19:33 | 2019-08-19 20:19:33 |
+----+-----------+------------------------+---------------------+---------------------+
7 rows in set (0.00 sec)

mysql> select * from RoleUsers;
+---------------------+---------------------+--------+--------+
| createdAt           | updatedAt           | RoleId | UserId |
+---------------------+---------------------+--------+--------+
| 2019-08-08 19:41:09 | 2019-08-08 19:41:09 |      1 |      2 |
| 2019-08-08 19:39:34 | 2019-08-08 19:39:34 |      2 |      1 |
| 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |      3 |      3 |
| 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |      4 |      3 |
| 2019-08-19 20:19:33 | 2019-08-19 20:19:33 |     11 |      5 |
+---------------------+---------------------+--------+--------+
5 rows in set (0.00 sec)

mysql> describe RoleUsers;
+-----------+----------+------+-----+---------+-------+
| Field     | Type     | Null | Key | Default | Extra |
+-----------+----------+------+-----+---------+-------+
| createdAt | datetime | NO   |     | NULL    |       |
| updatedAt | datetime | NO   |     | NULL    |       |
| RoleId    | int(11)  | NO   | PRI | 0       |       |
| UserId    | int(11)  | NO   | PRI | 0       |       |
+-----------+----------+------+-----+---------+-------+
4 rows in set (0.00 sec)

mysql> INSERT INTO RoleUsers(createdAt, updatedAt, RoleId, UserId) VALUES (CURTIME(), CURTIME(), 11, 1);
Query OK, 1 row affected (0.01 sec)

mysql> select * from RoleUsers;
+---------------------+---------------------+--------+--------+
| createdAt           | updatedAt           | RoleId | UserId |
+---------------------+---------------------+--------+--------+
| 2019-08-08 19:41:09 | 2019-08-08 19:41:09 |      1 |      2 |
| 2019-08-08 19:39:34 | 2019-08-08 19:39:34 |      2 |      1 |
| 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |      3 |      3 |
| 2019-08-19 20:19:29 | 2019-08-19 20:19:29 |      4 |      3 |
| 2020-10-05 00:00:00 | 2020-10-05 00:00:00 |     11 |      1 |
| 2019-08-19 20:19:33 | 2019-08-19 20:19:33 |     11 |      5 |
+---------------------+---------------------+--------+--------+
6 rows in set (0.00 sec)
```

## Contact
Ingenium Development Team: ingenium-dev@jpl.nasa.gov

