'use strict';

/**
 * Unit tests for api/controllers/LdapService.js
 *
 * ldap_helper (the external LDAP collaborator) and node_funcs are mocked.
 */

const { mockResponse, flush } = require('./mocks/testHelpers.js');

function loadService() {
  const ldap_helper = {
    search_users: jest.fn(),
    search_groups: jest.fn()
  };
  const log = { critical: jest.fn() };
  jest.doMock('../../api/helpers/ldap_helper.js', function () { return ldap_helper; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });
  const service = require('../../api/controllers/LdapService.js');
  return { service: service, ldap_helper: ldap_helper, log: log };
}

describe('LdapService', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('search_users', function () {
    it('responds 200 with the users found', async function () {
      const ctx = loadService();
      const users = [{ username: 'jdoe' }];
      ctx.ldap_helper.search_users.mockResolvedValue(users);
      const res = mockResponse();

      await ctx.service.search_users({ q: { value: 'jd' } }, res, jest.fn());

      expect(ctx.ldap_helper.search_users).toHaveBeenCalledWith('jd');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(users);
    });

    it('responds 404 when no users are found (null)', async function () {
      const ctx = loadService();
      ctx.ldap_helper.search_users.mockResolvedValue(null);
      const res = mockResponse();

      await ctx.service.search_users({ q: { value: 'zz' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Couldn't find users with username: zz" });
    });

    it('responds 400 when the search rejects', async function () {
      const ctx = loadService();
      ctx.ldap_helper.search_users.mockRejectedValue(new Error('ldap down'));
      const res = mockResponse();

      await ctx.service.search_users({ q: { value: 'jd' } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'search_users couldnt search for users' });
      expect(ctx.log.critical).toHaveBeenCalled();
    });
  });

  describe('search_groups', function () {
    it('responds 200 with the groups found', async function () {
      const ctx = loadService();
      const groups = ['group1'];
      ctx.ldap_helper.search_groups.mockResolvedValue(groups);
      const res = mockResponse();

      await ctx.service.search_groups({ q: { value: 'gr' } }, res, jest.fn());

      expect(ctx.ldap_helper.search_groups).toHaveBeenCalledWith('gr');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(groups);
    });

    it('responds 404 when no groups are found (null)', async function () {
      const ctx = loadService();
      ctx.ldap_helper.search_groups.mockResolvedValue(null);
      const res = mockResponse();

      await ctx.service.search_groups({ q: { value: 'zz' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Couldn't find groups with groupname: zz" });
    });

    it('responds 400 when the search rejects', async function () {
      const ctx = loadService();
      ctx.ldap_helper.search_groups.mockRejectedValue(new Error('ldap down'));
      const res = mockResponse();

      await ctx.service.search_groups({ q: { value: 'gr' } }, res, jest.fn());
      await flush();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'search_groups couldnt search for groups' });
      expect(ctx.log.critical).toHaveBeenCalled();
    });
  });
});
