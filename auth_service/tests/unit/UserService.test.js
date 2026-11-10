'use strict';

/**
 * Unit tests for api/controllers/UserService.js
 *
 * Collaborators mocked: server/models/index.js, node_funcs.
 * lodash and bluebird are left real (pure in-process utilities).
 */

const { mockResponse, flush } = require('./mocks/testHelpers.js');
const { mockModels, mockInstance } = require('./mocks/mockDatabase.js');

function loadService() {
  const models = mockModels();
  const log = { trace: jest.fn(), debug: jest.fn(), error: jest.fn(), critical: jest.fn() };
  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });
  const service = require('../../api/controllers/UserService.js');
  return { service: service, models: models, log: log };
}

// All get_all_users query args are objects shaped like { value: ... }.
function buildArgs(overrides) {
  const keys = ['limit', 'q', 'offset', 'order', 'loggedin', 'rolefilter', 'scopefilter', 'groupfilter'];
  const args = {};
  keys.forEach(function (k) { args[k] = { value: undefined }; });
  Object.keys(overrides || {}).forEach(function (k) { args[k] = { value: overrides[k] }; });
  return args;
}

// Build a user model instance suitable for get_user_full().
function userRow(id, username, loginExpire) {
  const inst = mockInstance();
  inst.id = id;
  // real Sequelize instances expose column values directly; the service sorts
  // raw instances by `username` before serializing, so expose it here too.
  inst.username = username;
  inst.login_expire = loginExpire === undefined ? 0 : loginExpire;
  inst.dataValues = { id: id, username: username };
  inst.toJSON = jest.fn(function () { return { id: id, username: username }; });
  return inst;
}

describe('UserService', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('get_all_users (default path)', function () {
    it('returns users with derived loggedin/scopes/roles/groups', async function () {
      const ctx = loadService();
      const u = userRow(1, 'jdoe');
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 1, rows: [u] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({}), res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.total).toBe(1);
      expect(payload.results[0]).toMatchObject({ id: 1, username: 'jdoe', loggedin: 'No', scopes: [], roles: [], groups: [] });
    });

    it('applies q, limit, offset and DESC order to the query parameters', async function () {
      const ctx = loadService();
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ q: 'jd', limit: 10, offset: 5, order: 'DESC' }), res, jest.fn());
      await flush(2);

      const query = ctx.models.User.findAndCountAll.mock.calls[0][0];
      expect(query.limit).toBe(10);
      expect(query.offset).toBe(5);
      expect(query.order).toBe('username DESC');
      expect(query.where.username).toEqual({ $like: 'jd%' });
    });

    it('applies ASC order to the query parameters', async function () {
      const ctx = loadService();
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ order: 'ASC' }), res, jest.fn());
      await flush(2);

      expect(ctx.models.User.findAndCountAll.mock.calls[0][0].order).toBe('username ASC');
    });

    it('filters by loggedin=Yes using a login_expire >= now clause', async function () {
      const ctx = loadService();
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ loggedin: 'Yes' }), res, jest.fn());
      await flush(2);

      const query = ctx.models.User.findAndCountAll.mock.calls[0][0];
      expect(query.where.login_expire).toHaveProperty('gte');
    });

    it('filters by loggedin=No using a login_expire < now clause', async function () {
      const ctx = loadService();
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ loggedin: 'No' }), res, jest.fn());
      await flush(2);

      const query = ctx.models.User.findAndCountAll.mock.calls[0][0];
      expect(query.where.login_expire).toHaveProperty('lt');
    });

    it('responds 500 when the default query rejects', async function () {
      const ctx = loadService();
      ctx.models.User.findAndCountAll.mockRejectedValue(new Error('db error'));
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({}), res, jest.fn());
      await flush(3);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(ctx.log.critical).toHaveBeenCalled();
    });
  });

  describe('get_all_users (rolefilter path)', function () {
    it('returns de-duplicated users belonging to matching roles, ordered DESC with offset/limit', async function () {
      const ctx = loadService();
      const role = mockInstance();
      role.getUsers = jest.fn().mockResolvedValue([userRow(1, 'aaa'), userRow(1, 'aaa'), userRow(2, 'bbb'), userRow(3, 'ccc')]);
      ctx.models.Role.findAndCountAll.mockResolvedValue({ rows: [role] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ rolefilter: 'adm', order: 'DESC', offset: 1, limit: 1 }), res, jest.fn());
      await flush(6);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.total).toBe(3); // unique users
      expect(payload.results).toHaveLength(1); // after offset 1, limit 1
    });

    it('supports ASC ordering in the rolefilter path', async function () {
      const ctx = loadService();
      const role = mockInstance();
      role.getUsers = jest.fn().mockResolvedValue([userRow(2, 'bbb'), userRow(1, 'aaa')]);
      ctx.models.Role.findAndCountAll.mockResolvedValue({ rows: [role] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ rolefilter: 'adm', order: 'ASC' }), res, jest.fn());
      await flush(6);

      const payload = res.json.mock.calls[0][0];
      expect(payload.results[0].username).toBe('aaa');
    });
  });

  describe('get_all_users (scopefilter path)', function () {
    it('returns users that have a matching permission', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      permission.getUsers = jest.fn().mockResolvedValue([userRow(1, 'jdoe')]);
      ctx.models.Permission.findAll.mockResolvedValue([permission]);
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 1, rows: [userRow(1, 'jdoe')] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ scopefilter: 'read', order: 'DESC', offset: 0, limit: 5 }), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.total).toBe(1);
    });

    it('supports ASC ordering and undefined offset/limit', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      permission.getUsers = jest.fn().mockResolvedValue([userRow(2, 'bbb'), userRow(1, 'aaa')]);
      ctx.models.Permission.findAll.mockResolvedValue([permission]);
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 2, rows: [userRow(2, 'bbb'), userRow(1, 'aaa')] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ scopefilter: 'read', order: 'ASC' }), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].results[0].username).toBe('aaa');
    });

    it('responds 500 when the scopefilter user lookup rejects', async function () {
      const ctx = loadService();
      const permission = mockInstance();
      permission.getUsers = jest.fn().mockResolvedValue([userRow(1, 'jdoe')]);
      ctx.models.Permission.findAll.mockResolvedValue([permission]);
      ctx.models.User.findAndCountAll.mockRejectedValue(new Error('db error'));
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ scopefilter: 'read' }), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('get_all_users (groupfilter path)', function () {
    it('returns users belonging to matching groups', async function () {
      const ctx = loadService();
      const group = mockInstance();
      group.getUsers = jest.fn().mockResolvedValue([userRow(1, 'jdoe')]);
      ctx.models.Group.findAll.mockResolvedValue([group]);
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 1, rows: [userRow(1, 'jdoe')] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ groupfilter: 'team', order: 'ASC', offset: 0, limit: 5 }), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('supports DESC ordering and undefined offset/limit', async function () {
      const ctx = loadService();
      const group = mockInstance();
      group.getUsers = jest.fn().mockResolvedValue([userRow(1, 'aaa'), userRow(2, 'bbb')]);
      ctx.models.Group.findAll.mockResolvedValue([group]);
      ctx.models.User.findAndCountAll.mockResolvedValue({ count: 2, rows: [userRow(1, 'aaa'), userRow(2, 'bbb')] });
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ groupfilter: 'team', order: 'DESC' }), res, jest.fn());
      await flush(8);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].results[0].username).toBe('bbb');
    });

    it('responds 500 for a non-string groupfilter value', async function () {
      const ctx = loadService();
      const res = mockResponse();

      ctx.service.get_all_users(buildArgs({ groupfilter: 123 }), res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Improper format for input.' });
    });
  });

  describe('get_user', function () {
    it('responds 200 with the full user when found', async function () {
      const ctx = loadService();
      ctx.models.User.findById.mockResolvedValue(userRow(1, 'jdoe'));
      const res = mockResponse();

      ctx.service.get_user({ user_id: { value: 1 } }, res, jest.fn());
      await flush(4);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toMatchObject({ id: 1, username: 'jdoe' });
    });

    it('responds 404 when the user is not found', async function () {
      const ctx = loadService();
      ctx.models.User.findById.mockResolvedValue(null);
      const res = mockResponse();

      ctx.service.get_user({ user_id: { value: 9 } }, res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responds 500 when findById rejects', async function () {
      const ctx = loadService();
      ctx.models.User.findById.mockRejectedValue(new Error('db error'));
      const res = mockResponse();

      ctx.service.get_user({ user_id: { value: 1 } }, res, jest.fn());
      await flush(2);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('get_user_full', function () {
    it('marks loggedin=Yes when login_expire is in the future', async function () {
      const ctx = loadService();
      const u = userRow(1, 'jdoe', Date.now() + 100000);

      const result = await ctx.service.get_user_full(u);

      expect(result.loggedin).toBe('Yes');
    });

    it('maps scopes, roles and groups from the associations', async function () {
      const ctx = loadService();
      const u = userRow(1, 'jdoe');
      const role = mockInstance();
      role.name = 'admin';
      role.getPermissions = jest.fn().mockResolvedValue([{ name: 'read' }, { name: 'write' }]);
      u.getRoles = jest.fn().mockResolvedValue([role]);
      u.getGroups = jest.fn().mockResolvedValue([{ name: 'team' }]);

      const result = await ctx.service.get_user_full(u);

      expect(result.scopes).toEqual(['read', 'write']);
      expect(result.roles).toEqual(['admin']);
      expect(result.groups).toEqual(['team']);
    });

    it('rejects when no user is provided', async function () {
      const ctx = loadService();
      await expect(ctx.service.get_user_full(null)).rejects.toBe('No user');
    });

    it('returns empty scopes when role permission lookup fails', async function () {
      const ctx = loadService();
      const u = userRow(1, 'jdoe');
      u.getRoles = jest.fn()
        .mockResolvedValueOnce([{ name: 'admin', getPermissions: jest.fn().mockRejectedValue(new Error('boom')) }])
        .mockResolvedValue([{ name: 'admin' }]);

      const result = await ctx.service.get_user_full(u);

      expect(result.scopes).toEqual([]);
      expect(ctx.log.error).toHaveBeenCalled();
    });

    // NOTE: get_user_full()'s internal Promise.join has no rejection handler, so
    // when getRoles/getGroups fail the returned promise never settles (a latent
    // bug preserved per Phase 7). These tests document that observable behavior
    // and exercise the get_roles()/get_groups() rejection branches.
    it('never settles when getRoles fails (documents latent non-propagation)', async function () {
      const ctx = loadService();
      const u = userRow(1, 'jdoe');
      u.getRoles = jest.fn().mockRejectedValue(new Error('boom'));

      let settled = false;
      const p = ctx.service.get_user_full(u);
      p.then(function () { settled = true; }, function () { settled = true; });
      await flush(4);

      expect(settled).toBe(false);
    });

    it('never settles when getGroups fails (documents latent non-propagation)', async function () {
      const ctx = loadService();
      const u = userRow(1, 'jdoe');
      u.getGroups = jest.fn().mockRejectedValue(new Error('boom'));

      let settled = false;
      const p = ctx.service.get_user_full(u);
      p.then(function () { settled = true; }, function () { settled = true; });
      await flush(4);

      expect(settled).toBe(false);
    });
  });
});
