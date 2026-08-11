'use strict';

/**
 * Unit tests for api/controllers/GroupService.js
 *
 * Collaborators mocked: server/models/index.js, RoleService, node_funcs.
 * lodash and bluebird are left real (pure in-process utilities).
 */

const { mockResponse, flush } = require('./mocks/testHelpers.js');
const { mockModels, mockInstance } = require('./mocks/mockDatabase.js');

function loadService() {
  const models = mockModels();
  const RoleService = { get_scopes_and_roles: jest.fn().mockImplementation(function (g) { return Promise.resolve(g); }) };
  const log = { trace: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn(), critical: jest.fn() };
  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../api/controllers/RoleService.js', function () { return RoleService; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });
  const service = require('../../api/controllers/GroupService.js');
  return { service: service, models: models, RoleService: RoleService, log: log };
}

function buildArgs(overrides) {
  const keys = ['limit', 'q', 'offset', 'order', 'rolefilter', 'userfilter', 'scopefilter'];
  const args = {};
  keys.forEach(function (k) { args[k] = { value: undefined }; });
  Object.keys(overrides || {}).forEach(function (k) { args[k] = { value: overrides[k] }; });
  return args;
}

function groupRow(id, name) {
  const inst = mockInstance();
  inst.id = id;
  inst.name = name;
  return inst;
}

describe('GroupService', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('get_all_groups (default path)', function () {
    it('returns groups with query params applied and count > 0', async function () {
      const ctx = loadService();
      ctx.models.Group.findAndCountAll.mockResolvedValue({ count: 1, rows: [groupRow(1, 'team')] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ q: 'te', limit: 5, offset: 0, order: 'DESC' }), res, jest.fn());
      await flush(4);

      const query = ctx.models.Group.findAndCountAll.mock.calls[0][0];
      expect(query.where.name).toEqual({ $like: 'te%' });
      expect(query.order).toBe('name DESC');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].total).toBe(1);
    });

    it('applies ASC ordering', async function () {
      const ctx = loadService();
      ctx.models.Group.findAndCountAll.mockResolvedValue({ count: 1, rows: [groupRow(1, 'team')] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ order: 'ASC' }), res, jest.fn());
      await flush(4);

      expect(ctx.models.Group.findAndCountAll.mock.calls[0][0].order).toBe('name ASC');
    });

    it('responds 404 when no groups are found (count 0)', async function () {
      const ctx = loadService();
      ctx.models.Group.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({}), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Group was not found' });
    });

    it('responds 404 when the query rejects', async function () {
      const ctx = loadService();
      ctx.models.Group.findAndCountAll.mockRejectedValue(new Error('db error'));
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({}), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ctx.log.critical).toHaveBeenCalled();
    });
  });

  describe('get_all_groups (rolefilter path)', function () {
    it('returns de-duplicated groups for matching roles with ordering/offset/limit', async function () {
      const ctx = loadService();
      const role = mockInstance();
      role.getGroups = jest.fn().mockResolvedValue([groupRow(1, 'aaa'), groupRow(1, 'aaa'), groupRow(2, 'bbb')]);
      ctx.models.Role.findAndCountAll.mockResolvedValue({ rows: [role] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ rolefilter: 'adm', order: 'DESC', offset: 0, limit: 5 }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].total).toBe(2);
    });

    it('supports ASC ordering in the rolefilter path', async function () {
      const ctx = loadService();
      const role = mockInstance();
      role.getGroups = jest.fn().mockResolvedValue([groupRow(2, 'bbb'), groupRow(1, 'aaa')]);
      ctx.models.Role.findAndCountAll.mockResolvedValue({ rows: [role] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ rolefilter: 'adm', order: 'ASC' }), res, jest.fn());
      await flush(6);

      expect(res.json.mock.calls[0][0].results[0].name).toBe('aaa');
    });
  });

  describe('get_all_groups (userfilter path)', function () {
    it('returns groups the matching users belong to', async function () {
      const ctx = loadService();
      const user = mockInstance();
      user.getGroups = jest.fn().mockResolvedValue([groupRow(1, 'team')]);
      ctx.models.User.findAndCountAll.mockResolvedValue({ rows: [user] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ userfilter: 'jd', order: 'DESC', offset: 0, limit: 5 }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].total).toBe(1);
    });

    it('supports ASC ordering in the userfilter path', async function () {
      const ctx = loadService();
      const user = mockInstance();
      user.getGroups = jest.fn().mockResolvedValue([groupRow(2, 'bbb'), groupRow(1, 'aaa')]);
      ctx.models.User.findAndCountAll.mockResolvedValue({ rows: [user] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ userfilter: 'jd', order: 'ASC' }), res, jest.fn());
      await flush(6);

      expect(res.json.mock.calls[0][0].results[0].name).toBe('aaa');
    });
  });

  describe('get_all_groups (scopefilter path)', function () {
    it('returns groups whose roles carry a matching permission', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      const role = mockInstance();
      role.getGroups = jest.fn().mockResolvedValue([groupRow(1, 'team')]);
      permission.getRoles = jest.fn().mockResolvedValue([role]);
      ctx.models.Permission.findAndCountAll.mockResolvedValue({ rows: [permission] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ scopefilter: 'read', order: 'DESC', offset: 0, limit: 5 }), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('supports ASC ordering in the scopefilter path', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      const role = mockInstance();
      role.getGroups = jest.fn().mockResolvedValue([groupRow(2, 'bbb'), groupRow(1, 'aaa')]);
      permission.getRoles = jest.fn().mockResolvedValue([role]);
      ctx.models.Permission.findAndCountAll.mockResolvedValue({ rows: [permission] });
      const res = mockResponse();

      ctx.service.get_all_groups(buildArgs({ scopefilter: 'read', order: 'ASC' }), res, jest.fn());
      await flush(8);

      expect(res.json.mock.calls[0][0].results[0].name).toBe('aaa');
    });
  });

  describe('get_group', function () {
    it('responds 200 with the group when found', async function () {
      const ctx = loadService();
      ctx.models.Group.findById.mockResolvedValue(groupRow(1, 'team'));
      const res = mockResponse();

      ctx.service.get_group({ group_id: { value: 1 } }, res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 404 when the group is not found', async function () {
      const ctx = loadService();
      ctx.models.Group.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_group({ group_id: { value: 9 } }, res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Not found with ID: 9' });
    });

    it('responds 400 when get_scopes_and_roles rejects', async function () {
      const ctx = loadService();
      ctx.models.Group.findById.mockResolvedValue(groupRow(1, 'team'));
      ctx.RoleService.get_scopes_and_roles.mockRejectedValue(new Error('boom'));
      const res = mockResponse();

      ctx.service.get_group({ group_id: { value: 1 } }, res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('delete_group', function () {
    it('destroys the group and responds 200', async function () {
      const ctx = loadService();
      const group = groupRow(1, 'team');
      group.destroy = jest.fn().mockResolvedValue(undefined);
      ctx.models.Group.findById.mockResolvedValue(group);
      const res = mockResponse();

      ctx.service.delete_group({ id: { value: 1 } }, res, jest.fn());
      await flush(3);

      expect(group.destroy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 400 when destroy rejects', async function () {
      const ctx = loadService();
      const group = groupRow(1, 'team');
      group.destroy = jest.fn().mockRejectedValue(new Error('boom'));
      ctx.models.Group.findById.mockResolvedValue(group);
      const res = mockResponse();

      ctx.service.delete_group({ id: { value: 1 } }, res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 404 when the group is not found', async function () {
      const ctx = loadService();
      ctx.models.Group.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.delete_group({ id: { value: 9 } }, res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
