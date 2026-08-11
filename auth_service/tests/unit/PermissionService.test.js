'use strict';

/**
 * Unit tests for api/controllers/PermissionService.js
 *
 * Collaborators mocked: server/models/index.js, RoleService, UserService,
 * node_funcs. lodash and bluebird are left real (pure in-process utilities).
 */

const { mockResponse, flush } = require('./mocks/testHelpers.js');
const { mockModels, mockInstance } = require('./mocks/mockDatabase.js');

function loadService() {
  const models = mockModels();
  const RoleService = { get_scopes_and_roles: jest.fn() };
  const UserService = { get_user_full: jest.fn() };
  const log = { error: jest.fn(), debug: jest.fn() };

  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../api/controllers/RoleService.js', function () { return RoleService; });
  jest.doMock('../../api/controllers/UserService.js', function () { return UserService; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });

  const service = require('../../api/controllers/PermissionService.js');
  return { service: service, models: models, RoleService: RoleService, UserService: UserService, log: log };
}

describe('PermissionService', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('get_all_permissions', function () {
    it('responds 200 with all permissions', async function () {
      const ctx = loadService();
      const perms = [{ id: 1, name: 'read' }];
      ctx.models.Permission.findAll.mockResolvedValue(perms);
      const res = mockResponse();

      ctx.service.get_all_permissions({}, res, jest.fn());
      await flush();

      expect(ctx.models.Permission.findAll).toHaveBeenCalledWith({ attributes: ['id', 'name', 'for_venue_group'] });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(perms);
    });

    it('responds 400 when findAll rejects', async function () {
      const ctx = loadService();
      ctx.models.Permission.findAll.mockRejectedValue(new Error('db error'));
      const res = mockResponse();

      ctx.service.get_all_permissions({}, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "get_all_permissions couldn't get all permissions" });
    });
  });

  describe('get_permission', function () {
    it('responds 200 with the permission when found', async function () {
      const ctx = loadService();
      ctx.models.Permission.findById.mockResolvedValue({ id: 5, name: 'read' });
      const res = mockResponse();

      ctx.service.get_permission({ permission_id: { value: 5 } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ id: 5, name: 'read' });
    });

    it('responds 404 when the permission is not found', async function () {
      const ctx = loadService();
      ctx.models.Permission.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_permission({ permission_id: { value: 5 } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Permission was not found' });
    });

    it('responds 400 when findById rejects', async function () {
      const ctx = loadService();
      ctx.models.Permission.findById.mockRejectedValue(new Error('db error'));
      const res = mockResponse();

      ctx.service.get_permission({ permission_id: { value: 5 } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'get_permission couldnt get specified permission.' });
    });
  });

  describe('get_groups_for_permission', function () {
    it('responds 200 with de-duplicated groups mapped through RoleService', async function () {
      const ctx = loadService();
      const role1 = mockInstance();
      role1.getGroups = jest.fn().mockResolvedValue([{ id: 1, name: 'g1' }, { id: 1, name: 'g1' }]);
      const permission = mockInstance();
      permission.getRoles = jest.fn().mockResolvedValue([role1]);
      ctx.models.Permission.findById.mockResolvedValue(permission);
      ctx.RoleService.get_scopes_and_roles.mockImplementation(function (g) { return Promise.resolve(g); });
      const res = mockResponse();

      ctx.service.get_groups_for_permission({ permission_id: { value: 1 } }, res, jest.fn());
      await flush(6);

      expect(ctx.RoleService.get_scopes_and_roles).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'g1' }]);
    });

    it('responds 404 when the permission is not found', async function () {
      const ctx = loadService();
      ctx.models.Permission.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_groups_for_permission({ permission_id: { value: 9 } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Permission not found with ID: 9' });
    });

    it('responds 400 when the role/group chain rejects', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      permission.getRoles = jest.fn().mockRejectedValue(new Error('db error'));
      ctx.models.Permission.findById.mockResolvedValue(permission);
      const res = mockResponse();

      ctx.service.get_groups_for_permission({ permission_id: { value: 1 } }, res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('get_users_for_permission', function () {
    it('responds 200 with de-duplicated users mapped through UserService', async function () {
      const ctx = loadService();
      const role1 = mockInstance();
      role1.getUsers = jest.fn().mockResolvedValue([{ id: 1 }, { id: 1 }, { id: 2 }]);
      const permission = mockInstance();
      permission.getRoles = jest.fn().mockResolvedValue([role1]);
      ctx.models.Permission.findById.mockResolvedValue(permission);
      ctx.UserService.get_user_full.mockImplementation(function (u) { return Promise.resolve(u); });
      const res = mockResponse();

      ctx.service.get_users_for_permission({ permission_id: { value: 1 } }, res, jest.fn());
      await flush(6);

      expect(ctx.UserService.get_user_full).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 404 when the permission is not found', async function () {
      const ctx = loadService();
      ctx.models.Permission.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_users_for_permission({ permission_id: { value: 9 } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Permission not found with ID: 9' });
    });

    it('responds 400 when the role/user chain rejects', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      permission.getRoles = jest.fn().mockRejectedValue(new Error('db error'));
      ctx.models.Permission.findById.mockResolvedValue(permission);
      const res = mockResponse();

      ctx.service.get_users_for_permission({ permission_id: { value: 1 } }, res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
