'use strict';

/**
 * Unit tests for api/controllers/RoleService.js (the largest controller).
 *
 * Collaborators mocked:
 *   - server/models/index.js
 *   - login_helper, ldap_helper (which themselves import ldapjs/app.js)
 *   - UserService
 *   - node_funcs
 *   - ldapjs / app.js (imported transitively; stubbed so they never load)
 *
 * lodash, bluebird and sequelize are left real: bluebird provides Promise.join /
 * Promise.map / .spread / filtered .catch(ErrorClass), and sequelize provides
 * the real Sequelize.ValidationError class used in catch predicates.
 */

const BB = require('bluebird');
const { mockResponse, flush } = require('./mocks/testHelpers.js');
const { mockModels, mockInstance } = require('./mocks/mockDatabase.js');

// Resolve sequelize lazily from the CURRENT module registry (jest.resetModules
// reloads it between tests) so the ValidationError class matches the exact
// instance RoleService uses in its filtered `.catch(Sequelize.ValidationError)`.
function validationError() {
  const Sequelize = require('sequelize');
  return new Sequelize.ValidationError('invalid', []);
}

function loadService() {
  const models = mockModels();
  const login_helper = {
    ensure_users: jest.fn().mockResolvedValue([]),
    ensure_groups: jest.fn().mockResolvedValue([])
  };
  const ldap_helper = {
    validate_ldap_group_exists: jest.fn().mockResolvedValue(true),
    validate_ldap_groups_exist: jest.fn().mockResolvedValue([]),
    validate_user_exists: jest.fn().mockResolvedValue(true),
    validate_users_exist: jest.fn().mockResolvedValue([])
  };
  const UserService = { get_user_full: jest.fn().mockImplementation(function (u) { return Promise.resolve(u); }) };
  const log = { info: jest.fn(), debug: jest.fn(), error: jest.fn(), critical: jest.fn() };

  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../api/helpers/login_helper.js', function () { return login_helper; });
  jest.doMock('../../api/helpers/ldap_helper.js', function () { return ldap_helper; });
  jest.doMock('../../api/controllers/UserService.js', function () { return UserService; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });
  jest.doMock('ldapjs', function () { return {}; });
  jest.doMock('../../app.js', function () { return {}; });

  const service = require('../../api/controllers/RoleService.js');
  return {
    service: service, models: models, login_helper: login_helper,
    ldap_helper: ldap_helper, UserService: UserService, log: log
  };
}

function roleInstance(overrides) {
  const role = mockInstance(overrides);
  role.id = (overrides && overrides.id) || 1;
  role.name = (overrides && overrides.name) || 'ROLE_A';
  role.description = (overrides && overrides.description) || 'desc';
  role.addGroup = jest.fn().mockResolvedValue(undefined);
  role.addUser = jest.fn().mockResolvedValue(undefined);
  role.removeGroup = jest.fn().mockResolvedValue(undefined);
  role.removeUser = jest.fn().mockResolvedValue(undefined);
  role.removePermission = jest.fn().mockResolvedValue(undefined);
  role.setUsers = jest.fn().mockResolvedValue(undefined);
  role.setGroups = jest.fn().mockResolvedValue(undefined);
  role.setPermissions = jest.fn().mockResolvedValue(undefined);
  role.getUsers = jest.fn().mockResolvedValue([]);
  role.getGroups = jest.fn().mockResolvedValue([]);
  role.getPermissions = jest.fn().mockResolvedValue([]);
  role.updateAttributes = jest.fn().mockResolvedValue(undefined);
  role.destroy = jest.fn().mockResolvedValue(undefined);
  return role;
}

describe('RoleService', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('add_role_group', function () {
    function args() { return { role_id: { value: 1 }, group_name: { value: 'Team' } }; }

    it('adds an existing/created group to the role and responds 204', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.ldap_helper.validate_ldap_group_exists.mockResolvedValue(true);
      ctx.models.Group.findOrCreate.mockReturnValue(BB.resolve([mockInstance(), true]));
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(5);

      expect(role.addGroup).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('responds 400 when addGroup fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.addGroup.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Group.findOrCreate.mockReturnValue(BB.resolve([mockInstance(), true]));
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(5);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when findOrCreate fails (spread catch)', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Group.findOrCreate.mockReturnValue(BB.reject(new Error('db')));
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(5);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 404 when the group is not valid in LDAP', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_ldap_group_exists.mockResolvedValue(false);
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 400 when LDAP validation rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_ldap_group_exists.mockRejectedValue(new Error('ldap'));
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 404 when the role does not exist', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 400 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.add_role_group(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('add_role_user', function () {
    function args() { return { role_id: { value: 1 }, username: { value: 'JDoe' } }; }

    it('adds an existing/created user to the role and responds 204', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.ldap_helper.validate_user_exists.mockResolvedValue(true);
      ctx.models.User.findOrCreate.mockReturnValue(BB.resolve([mockInstance(), true]));
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(5);

      expect(role.addUser).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('responds 500 when addUser fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.addUser.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.User.findOrCreate.mockReturnValue(BB.resolve([mockInstance(), true]));
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(5);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 500 when findOrCreate fails (spread catch)', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.User.findOrCreate.mockReturnValue(BB.reject(new Error('db')));
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(5);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the user does not exist in LDAP', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_user_exists.mockResolvedValue(false);
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when user validation rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_user_exists.mockRejectedValue(new Error('ldap'));
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role does not exist', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.add_role_user(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('create_role', function () {
    function args(data) { return { data: { value: data } }; }

    it('creates a role and responds 201 for valid input with no members', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.create.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'ROLE_NEW', description: 'd' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ name: role.name, description: role.description, id: role.id });
    });

    it('responds 500 when permissions could not be fetched', async function () {
      const ctx = loadService();
      ctx.models.Role.create.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue(undefined);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R', permissions: [1] }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 400 when one or more permissions are not found', async function () {
      const ctx = loadService();
      ctx.models.Role.create.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue([{ id: 1 }]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R', permissions: [1, 2] }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 500 when the set associations join fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.setUsers.mockRejectedValue(new Error('boom'));
      ctx.models.Role.create.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 400 when the role name is missing', async function () {
      const ctx = loadService();
      const res = mockResponse();

      ctx.service.create_role(args({}), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Role name was not provided.' });
    });

    it('responds 400 when validation finds invalid users', async function () {
      const ctx = loadService();
      // one desired user that LDAP does not confirm -> result invalid
      ctx.ldap_helper.validate_users_exist.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R', users: ['ghost'] }), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'result is invalid' });
    });

    it('responds 400 when validation finds invalid groups', async function () {
      const ctx = loadService();
      ctx.ldap_helper.validate_users_exist.mockResolvedValue([]);
      ctx.ldap_helper.validate_ldap_groups_exist.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R', groups: ['badgroup'] }), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 on a Sequelize validation error while building the role', async function () {
      const ctx = loadService();
      ctx.login_helper.ensure_users.mockReturnValue(BB.reject(validationError()));
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 500 on a generic error while building the role', async function () {
      const ctx = loadService();
      ctx.login_helper.ensure_users.mockRejectedValue(new Error('boom'));
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 500 when user/group validation throws synchronously', async function () {
      const ctx = loadService();
      ctx.ldap_helper.validate_users_exist.mockImplementation(function () { throw new Error('sync'); });
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R' }), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('skips empty-string usernames and groupnames during validation', async function () {
      const ctx = loadService();
      ctx.models.Role.create.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.create_role(args({ name: 'R', users: [''], groups: [''] }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('re-includes the configured test user account when present', async function () {
      const savedUser = process.env.USERNAME;
      process.env.USERNAME = 'testacct';
      try {
        const ctx = loadService();
        ctx.models.Role.create.mockResolvedValue(roleInstance());
        ctx.models.Permission.findAll.mockResolvedValue([]);
        const res = mockResponse();

        ctx.service.create_role(args({ name: 'R', users: ['testacct'] }), res, jest.fn());
        await flush(6);

        expect(res.status).toHaveBeenCalledWith(201);
      } finally {
        if (savedUser === undefined) { delete process.env.USERNAME; } else { process.env.USERNAME = savedUser; }
      }
    });
  });

  describe('delete_role', function () {
    function args() { return { role_id: { value: 1 } }; }

    it('destroys the role and responds 204', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.delete_role(args(), res, jest.fn());
      await flush(3);

      expect(role.destroy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('responds 500 when destroy fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.destroy.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.delete_role(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('delete_role_group', function () {
    function args() { return { role_id: { value: 1 }, group_id: { value: 2 }, group_name: { value: 'team' } }; }

    it('removes the group and responds 204', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Group.findOne.mockResolvedValue(mockInstance());
      const res = mockResponse();

      ctx.service.delete_role_group(args(), res, jest.fn());
      await flush(4);

      expect(role.removeGroup).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('responds 404 when the group is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Group.findOne.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role_group(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when Group.findOne rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Group.findOne.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role_group(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role_group(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role_group(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('delete_role_permission', function () {
    function args() { return { role_id: { value: 1 }, permission_id: { value: 2 } }; }

    it('removes the permission and responds 204', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findById.mockResolvedValue(mockInstance());
      const res = mockResponse();

      ctx.service.delete_role_permission(args(), res, jest.fn());
      await flush(4);

      expect(role.removePermission).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('responds 404 when the permission is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role_permission(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Permission.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role_permission(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role_permission(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role_permission(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('delete_role_user', function () {
    function args() { return { role_id: { value: 1 }, user_id: { value: 2 }, username: { value: 'jdoe' } }; }

    it('removes the user and responds 204', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.User.findOne.mockResolvedValue(mockInstance());
      const res = mockResponse();

      ctx.service.delete_role_user(args(), res, jest.fn());
      await flush(4);

      expect(role.removeUser).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('responds 404 when the user is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.User.findOne.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role_user(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when User.findOne rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.User.findOne.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role_user(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_role_user(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.delete_role_user(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('edit_role', function () {
    function args(data, roleId) { return { role_id: { value: roleId || 1 }, data: { value: data } }; }

    it('updates the role and responds 200', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      ctx.login_helper.ensure_users.mockResolvedValue([{ id: 1, username: 'jdoe' }]);
      ctx.login_helper.ensure_groups.mockResolvedValue([{ name: 'team' }]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R', description: 'd' }), res, jest.fn());
      await flush(6);

      expect(role.updateAttributes).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when permissions cannot be fetched', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue(undefined);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R', permissions: [1] }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 400 when one or more permissions are not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue([{ id: 1 }]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R', permissions: [1, 2] }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 500 when the update join fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.setUsers.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 400 when validation fails', async function () {
      const ctx = loadService();
      ctx.ldap_helper.validate_users_exist.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R', users: ['ghost'] }), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 200 and returns mapped permissions and groups', async function () {
      const ctx = loadService();
      const role = roleInstance();
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([{ id: 1 }]);
      ctx.ldap_helper.validate_ldap_groups_exist.mockResolvedValue(['team']);
      ctx.login_helper.ensure_users.mockResolvedValue([{ id: 1, username: 'jdoe' }]);
      ctx.login_helper.ensure_groups.mockResolvedValue([{ name: 'team' }]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R', description: 'd', permissions: [1], groups: ['team'] }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.permissions).toEqual([1]);
      expect(payload.groups).toEqual(['team']);
    });

    it('responds 400 on a Sequelize validation error during the update join', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.updateAttributes.mockReturnValue(BB.reject(validationError()));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 on a Sequelize validation error in the outer join', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue([]);
      ctx.login_helper.ensure_users.mockReturnValue(BB.reject(validationError()));
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 500 on a generic error in the outer join', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue([]);
      ctx.login_helper.ensure_users.mockRejectedValue(new Error('boom'));
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R' }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 400 when user/group validation throws synchronously', async function () {
      const ctx = loadService();
      ctx.ldap_helper.validate_users_exist.mockImplementation(function () { throw new Error('sync'); });
      const res = mockResponse();

      ctx.service.edit_role(args({ name: 'R' }), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('edit_role_groups', function () {
    function args(groups) { return { role_id: { value: 1 }, data: { value: groups } }; }

    it('replaces the role groups and responds 200', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getGroups.mockResolvedValue([mockInstance()]);
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.ldap_helper.validate_ldap_groups_exist.mockResolvedValue(['team']);
      ctx.models.Group.findOrCreate.mockResolvedValue([mockInstance(), true]);
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(8);

      expect(role.setGroups).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 500 when setGroups fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.setGroups.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.ldap_helper.validate_ldap_groups_exist.mockResolvedValue(['team']);
      ctx.models.Group.findOrCreate.mockResolvedValue([mockInstance(), true]);
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 500 when findOrCreate mapping fails', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_ldap_groups_exist.mockResolvedValue(['team']);
      ctx.models.Group.findOrCreate.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when one or more groups are invalid', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_ldap_groups_exist.mockResolvedValue([]); // fewer than desired
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when group validation rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_ldap_groups_exist.mockRejectedValue(new Error('ldap'));
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.edit_role_groups(args(['team']), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('edit_role_users', function () {
    function args(users) { return { role_id: { value: 1 }, data: { value: users } }; }

    it('replaces the role users and responds 200', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getUsers.mockResolvedValue([mockInstance()]);
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.ldap_helper.validate_users_exist.mockResolvedValue(['jdoe']);
      ctx.models.User.findOrCreate.mockResolvedValue([mockInstance(), true]);
      const res = mockResponse();

      ctx.service.edit_role_users(args(['jdoe']), res, jest.fn());
      await flush(8);

      expect(role.setUsers).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 500 when setUsers fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.setUsers.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.ldap_helper.validate_users_exist.mockResolvedValue(['jdoe']);
      ctx.models.User.findOrCreate.mockResolvedValue([mockInstance(), true]);
      const res = mockResponse();

      ctx.service.edit_role_users(args(['jdoe']), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 500 when findOrCreate mapping fails', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_users_exist.mockResolvedValue(['jdoe']);
      ctx.models.User.findOrCreate.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.edit_role_users(args(['jdoe']), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when one or more users are invalid', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_users_exist.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.edit_role_users(args(['ghost']), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when user validation rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.ldap_helper.validate_users_exist.mockRejectedValue(new Error('ldap'));
      const res = mockResponse();

      ctx.service.edit_role_users(args(['jdoe']), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.edit_role_users(args(['jdoe']), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.edit_role_users(args(['jdoe']), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('edit_role_permissions', function () {
    function args(perms) { return { role_id: { value: 1 }, data: { value: perms } }; }

    it('replaces the role permissions and responds 200', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getPermissions.mockResolvedValue([{ id: 1, name: 'read' }]);
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([{ id: 1, name: 'read' }]);
      const res = mockResponse();

      ctx.service.edit_role_permissions(args([1]), res, jest.fn());
      await flush(6);

      expect(role.setPermissions).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 500 when getPermissions fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getPermissions.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      ctx.models.Permission.findAll.mockResolvedValue([{ id: 1 }]);
      const res = mockResponse();

      ctx.service.edit_role_permissions(args([1]), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      ctx.models.Permission.findAll.mockResolvedValue([]);
      const res = mockResponse();

      ctx.service.edit_role_permissions(args([]), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when one or more permissions are missing', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockResolvedValue([{ id: 1 }]);
      const res = mockResponse();

      ctx.service.edit_role_permissions(args([1, 2]), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Permission.findAll rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(roleInstance());
      ctx.models.Permission.findAll.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.edit_role_permissions(args([1]), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('get_all_roles', function () {
    function args(overrides) {
      const keys = ['name', 'venue_group_id', 'offset', 'limit', 'order'];
      const a = {};
      keys.forEach(function (k) { a[k] = { value: undefined }; });
      Object.keys(overrides || {}).forEach(function (k) { a[k] = { value: overrides[k] }; });
      return a;
    }

    it('responds 200 with total and results applying all query params (DESC)', async function () {
      const ctx = loadService();
      ctx.models.Role.findAndCountAll.mockResolvedValue({ count: 1, rows: [{ id: 1 }] });
      const res = mockResponse();

      ctx.service.get_all_roles(args({ name: 'R', venue_group_id: 'vg', offset: 0, limit: 10, order: 'DESC' }), res, jest.fn());
      await flush(2);

      const query = ctx.models.Role.findAndCountAll.mock.calls[0][0];
      expect(query.where.name).toEqual({ $like: 'R%' });
      expect(query.where.venue_group_id).toBe('vg');
      expect(query.order).toBe('name DESC');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ total: 1, results: [{ id: 1 }] });
    });

    it('applies ASC ordering', async function () {
      const ctx = loadService();
      ctx.models.Role.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const res = mockResponse();

      ctx.service.get_all_roles(args({ order: 'ASC' }), res, jest.fn());
      await flush(2);

      expect(ctx.models.Role.findAndCountAll.mock.calls[0][0].order).toBe('name ASC');
    });

    it('responds 500 when the query rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findAndCountAll.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.get_all_roles(args({}), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('get_role', function () {
    function args() { return { role_id: { value: 1 } }; }

    it('responds 200 with a composed role', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getUsers.mockResolvedValue([{ id: 1, username: 'jdoe' }]);
      role.getPermissions.mockResolvedValue([{ id: 5 }]);
      role.getGroups.mockResolvedValue([{ name: 'team' }]);
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role(args(), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.users).toEqual([{ id: 1, username: 'jdoe' }]);
      expect(payload.groups).toEqual(['team']);
      expect(payload.permissions).toEqual([5]);
    });

    it('responds 500 when the association join fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getUsers.mockRejectedValueOnce
        ? role.getUsers.mockRejectedValueOnce(new Error('boom'))
        : role.getUsers.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role(args(), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 400 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_role(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.get_role(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('get_role_groups', function () {
    function args() { return { role_id: { value: 1 } }; }

    it('responds 200 with scopes-and-roles composed groups', async function () {
      const ctx = loadService();
      const role = roleInstance();
      const group = mockInstance();
      group.toJSON = jest.fn().mockReturnValue({ id: 1, name: 'team' });
      group.getRoles = jest.fn().mockResolvedValue([]);
      role.getGroups.mockResolvedValue([group]);
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role_groups(args(), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 500 when the group composition fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      const group = mockInstance();
      group.toJSON = jest.fn().mockReturnValue({ id: 1 });
      group.getRoles = jest.fn().mockRejectedValue(new Error('boom'));
      role.getGroups.mockResolvedValue([group]);
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role_groups(args(), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_role_groups(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('get_role_permissions', function () {
    function args() { return { role_id: { value: 1 } }; }

    it('responds 200 with picked permission fields', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getPermissions.mockResolvedValue([{ id: 1, name: 'read', extra: 'x' }]);
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role_permissions(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'read' }]);
    });

    it('responds 404 when getPermissions fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getPermissions.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role_permissions(args(), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_role_permissions(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 404 when findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.get_role_permissions(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('get_role_users', function () {
    function args() { return { role_id: { value: 1 } }; }

    it('responds 200 with full users', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getUsers.mockResolvedValue([{ id: 1, username: 'jdoe' }]);
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role_users(args(), res, jest.fn());
      await flush(4);

      expect(ctx.UserService.get_user_full).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 500 when the user composition fails', async function () {
      const ctx = loadService();
      const role = roleInstance();
      role.getUsers.mockResolvedValue([{ id: 1 }]);
      ctx.UserService.get_user_full.mockRejectedValue(new Error('boom'));
      ctx.models.Role.findById.mockResolvedValue(role);
      const res = mockResponse();

      ctx.service.get_role_users(args(), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('responds 404 when the role is not found', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_role_users(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when Role.findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Role.findById.mockRejectedValue(new Error('db'));
      const res = mockResponse();

      ctx.service.get_role_users(args(), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('get_scopes_and_roles (exported helper)', function () {
    it('composes scopes and role names for a group', async function () {
      const ctx = loadService();
      const group = mockInstance();
      group.toJSON = jest.fn().mockReturnValue({ id: 1, name: 'team' });
      const role = mockInstance();
      role.name = 'admin';
      role.getPermissions = jest.fn().mockResolvedValue([{ id: 10, name: 'read' }]);
      group.getRoles = jest.fn().mockResolvedValue([role]);

      const result = await ctx.service.get_scopes_and_roles(group);

      expect(result.scopes).toEqual(['read']);
      expect(result.roles).toEqual(['admin']);
    });

    it('rejects when no group is provided', async function () {
      const ctx = loadService();
      await expect(ctx.service.get_scopes_and_roles(null)).rejects.toBeDefined();
    });

    it('rejects when the role permissions lookup fails', async function () {
      const ctx = loadService();
      const group = mockInstance();
      group.toJSON = jest.fn().mockReturnValue({ id: 1 });
      const role = mockInstance();
      role.getPermissions = jest.fn().mockRejectedValue(new Error('boom'));
      group.getRoles = jest.fn().mockResolvedValue([role]);

      // get_scopes() rejects with no reason, which get_scopes_and_roles forwards.
      await expect(ctx.service.get_scopes_and_roles(group)).rejects.toBeUndefined();
    });

    it('rejects when getRoles resolves a falsy value', async function () {
      const ctx = loadService();
      const group = mockInstance();
      group.toJSON = jest.fn().mockReturnValue({ id: 1 });
      // get_roles resolves an (empty) array, but get_scopes sees null and rejects.
      group.getRoles = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue([]);

      await expect(ctx.service.get_scopes_and_roles(group)).rejects.toBeUndefined();
    });
  });
});
