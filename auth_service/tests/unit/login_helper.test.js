'use strict';

/**
 * Unit tests for api/helpers/login_helper.js
 *
 * Collaborators mocked: ldap_helper, server/models/index.js, node_funcs.
 * lodash and bluebird are left real (pure in-process utilities).
 */

const { mockModels, mockInstance } = require('./mocks/mockDatabase.js');

function loadHelper() {
  const models = mockModels();
  const ldap_helper = {
    getGroupsForUser: jest.fn().mockResolvedValue([]),
    get_user_info: jest.fn().mockResolvedValue(null)
  };
  const log = { debug: jest.fn(), info: jest.fn(), warning: jest.fn() };

  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../api/helpers/ldap_helper.js', function () { return ldap_helper; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });
  // login_helper imports ldapjs at the top though it only uses ldap_helper;
  // mock it so the (transitively broken) ldapjs module is never loaded.
  jest.doMock('ldapjs', function () { return {}; });

  const helper = require('../../api/helpers/login_helper.js');
  return { helper: helper, models: models, ldap_helper: ldap_helper, log: log };
}

describe('login_helper', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('getPermission', function () {
    it('combines roles and scopes from the user and their LDAP groups', async function () {
      const ctx = loadHelper();

      // The DB user has one role.
      const user = mockInstance();
      user.getRoles = jest.fn().mockResolvedValue([{ id: 1, name: 'admin', venue_group_id: 'vg1' }]);
      ctx.models.User.findOne.mockResolvedValue(user);

      // LDAP reports the user belongs to group "team".
      ctx.ldap_helper.getGroupsForUser.mockResolvedValue(['team']);

      // That group maps to a DB group with a role.
      const group = mockInstance();
      group.getRoles = jest.fn().mockResolvedValue([{ id: 2, name: 'member', venue_group_id: '' }]);
      ctx.models.Group.findAll.mockResolvedValue([group]);

      // Both roles resolve to permissions.
      const roleAdmin = mockInstance();
      roleAdmin.getPermissions = jest.fn().mockResolvedValue([{ name: 'write' }]);
      roleAdmin.venue_group_id = 'vg1';
      const roleMember = mockInstance();
      roleMember.getPermissions = jest.fn().mockResolvedValue([{ name: 'read' }]);
      roleMember.venue_group_id = '';
      ctx.models.Role.findAll.mockResolvedValue([roleAdmin, roleMember]);

      const result = await ctx.helper.getPermission('jdoe');

      expect(result.roles).toEqual(expect.arrayContaining([
        { role: 'admin', venue_group_id: 'vg1' },
        { role: 'member', venue_group_id: '' }
      ]));
      expect(result.scopes).toEqual(expect.arrayContaining([
        { scope: 'write', venue_group_id: 'vg1' },
        { scope: 'read', venue_group_id: '' }
      ]));
    });

    it('returns only group-derived permissions when the user is not in the DB', async function () {
      const ctx = loadHelper();
      ctx.models.User.findOne.mockResolvedValue(null);
      ctx.ldap_helper.getGroupsForUser.mockResolvedValue(['team']);

      const group = mockInstance();
      group.getRoles = jest.fn().mockResolvedValue([{ id: 2, name: 'member' }]);
      ctx.models.Group.findAll.mockResolvedValue([group]);

      const roleMember = mockInstance();
      roleMember.getPermissions = jest.fn().mockResolvedValue([{ name: 'read' }]);
      ctx.models.Role.findAll.mockResolvedValue([roleMember]);

      const result = await ctx.helper.getPermission('newuser');

      expect(result.roles).toEqual([{ role: 'member', venue_group_id: '' }]);
      expect(result.scopes).toEqual([{ scope: 'read', venue_group_id: '' }]);
    });

    it('de-duplicates identical role/scope entries', async function () {
      const ctx = loadHelper();
      const user = mockInstance();
      user.getRoles = jest.fn().mockResolvedValue([{ id: 1, name: 'admin', venue_group_id: '' }]);
      ctx.models.User.findOne.mockResolvedValue(user);
      ctx.ldap_helper.getGroupsForUser.mockResolvedValue(['team']);

      const group = mockInstance();
      // group has the SAME role as the user
      group.getRoles = jest.fn().mockResolvedValue([{ id: 1, name: 'admin', venue_group_id: '' }]);
      ctx.models.Group.findAll.mockResolvedValue([group]);

      const roleAdmin = mockInstance();
      roleAdmin.getPermissions = jest.fn().mockResolvedValue([{ name: 'write' }]);
      ctx.models.Role.findAll.mockResolvedValue([roleAdmin]);

      const result = await ctx.helper.getPermission('jdoe');

      expect(result.roles).toHaveLength(1);
      expect(result.scopes).toHaveLength(1);
    });
  });

  describe('ensure_user', function () {
    it('does nothing when the user already exists', async function () {
      const ctx = loadHelper();
      ctx.models.User.findOne.mockResolvedValue(mockInstance());

      await ctx.helper.ensure_user('jdoe');

      expect(ctx.models.User.create).not.toHaveBeenCalled();
      expect(ctx.ldap_helper.get_user_info).not.toHaveBeenCalled();
    });

    it('creates the user from LDAP info on first login', async function () {
      const ctx = loadHelper();
      ctx.models.User.findOne.mockResolvedValue(null);
      ctx.ldap_helper.get_user_info.mockResolvedValue([{ displayName: 'Jane Doe' }]);

      await ctx.helper.ensure_user('jdoe');

      expect(ctx.models.User.create).toHaveBeenCalledWith({ username: 'jdoe', display_name: 'Jane Doe' });
    });

    it('does not create a user when LDAP returns no info', async function () {
      const ctx = loadHelper();
      ctx.models.User.findOne.mockResolvedValue(null);
      ctx.ldap_helper.get_user_info.mockResolvedValue(null);

      await ctx.helper.ensure_user('ghost');

      expect(ctx.models.User.create).not.toHaveBeenCalled();
    });
  });

  describe('ensure_users', function () {
    it('findOrCreates each username and returns the model instances', async function () {
      const ctx = loadHelper();
      const u1 = mockInstance();
      const u2 = mockInstance();
      ctx.models.User.findOrCreate
        .mockResolvedValueOnce([u1, true])
        .mockResolvedValueOnce([u2, false]);

      const result = await ctx.helper.ensure_users(['a', 'b']);

      expect(ctx.models.User.findOrCreate).toHaveBeenCalledWith({ where: { username: 'a' } });
      expect(ctx.models.User.findOrCreate).toHaveBeenCalledWith({ where: { username: 'b' } });
      expect(result).toEqual([u1, u2]);
    });
  });

  describe('ensure_groups', function () {
    it('findOrCreates each group and returns the model instances', async function () {
      const ctx = loadHelper();
      const g1 = mockInstance();
      ctx.models.Group.findOrCreate.mockResolvedValue([g1, true]);

      const result = await ctx.helper.ensure_groups(['team']);

      expect(ctx.models.Group.findOrCreate).toHaveBeenCalledWith({ where: { name: 'team' } });
      expect(result).toEqual([g1]);
    });
  });
});
