'use strict';

/**
 * Unit tests for api/helpers/ldap_helper.js
 *
 * Collaborators mocked:
 *   - ldapjs (createClient returning a client with a promisified searchAsync)
 *   - bluebird (native Promise + no-op promisifyAll so our searchAsync mock is
 *     preserved instead of being replaced by a promisified `search`)
 *   - app.js (imported at module top but unused by the functions under test;
 *     mocked to avoid booting the Swagger app / DB layer)
 *   - server/models/index.js, node_funcs
 *
 * Each LDAP search resolves with an EventEmitter; tests attach via the module's
 * .then handlers and then emit searchEntry/end/error to drive behavior.
 */

const EventEmitter = require('events').EventEmitter;
const { flush } = require('./mocks/testHelpers.js');
const { mockModels, mockInstance } = require('./mocks/mockDatabase.js');

function loadHelper() {
  const client = {
    on: jest.fn(),
    destroy: jest.fn(),
    searchAsync: jest.fn()
  };
  const ldap = { createClient: jest.fn().mockReturnValue(client) };
  const models = mockModels();
  const log = { warning: jest.fn(), trace: jest.fn(), info: jest.fn() };

  jest.doMock('ldapjs', function () { return ldap; });
  jest.doMock('bluebird', function () {
    const P = global.Promise;
    P.promisifyAll = jest.fn();
    return P;
  });
  jest.doMock('../../app.js', function () { return {}; });
  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });

  const helper = require('../../api/helpers/ldap_helper.js');
  return { helper: helper, client: client, ldap: ldap, models: models, log: log };
}

// Drive a search-based helper call: resolve searchAsync with an emitter, let the
// module attach its listeners, then emit the provided events.
async function driveSearch(client, invoke, events) {
  const emitter = new EventEmitter();
  client.searchAsync.mockResolvedValue(emitter);
  const promise = invoke();
  await flush();
  events.forEach(function (e) { emitter.emit(e.name, e.arg); });
  return promise;
}

describe('ldap_helper', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('create_client error handler', function () {
    it('registers an error handler that logs client errors', async function () {
      const ctx = loadHelper();
      driveSearch(ctx.client, function () { return ctx.helper.get_user_info('jdoe'); }, []);
      await flush();

      const onError = ctx.client.on.mock.calls.find(function (c) { return c[0] === 'error'; });
      expect(onError).toBeDefined();
      onError[1](new Error('conn failed'));
      expect(ctx.log.warning).toHaveBeenCalled();
    });
  });

  describe('validate_ldap_groups_exist', function () {
    it('resolves an empty array without searching when given no groups', async function () {
      const ctx = loadHelper();
      const result = await ctx.helper.validate_ldap_groups_exist([]);
      expect(result).toEqual([]);
      expect(ctx.client.searchAsync).not.toHaveBeenCalled();
    });

    it('resolves lowercased cns from search entries', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.validate_ldap_groups_exist(['GroupA']); },
        [
          { name: 'searchEntry', arg: { object: { cn: 'GroupA' } } },
          { name: 'end' }
        ]);
      expect(result).toEqual(['groupa']);
      expect(ctx.client.destroy).toHaveBeenCalled();
    });

    it('rejects when the search emits an error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.validate_ldap_groups_exist(['GroupA']); },
        [{ name: 'error', arg: new Error('search error') }]
      )).rejects.toBeUndefined();
      expect(ctx.log.warning).toHaveBeenCalled();
    });

    it('rejects when searchAsync itself rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.validate_ldap_groups_exist(['GroupA'])).rejects.toBeUndefined();
    });
  });

  describe('validate_ldap_group_exists', function () {
    it('resolves true when the group is present in the results', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.validate_ldap_group_exists('team'); },
        [
          { name: 'searchEntry', arg: { object: { cn: 'team' } } },
          { name: 'end' }
        ]);
      expect(result).toBe(true);
    });

    it('resolves false when the group is absent', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.validate_ldap_group_exists('missing'); },
        [{ name: 'end' }]);
      expect(result).toBe(false);
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.validate_ldap_group_exists('team'); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.validate_ldap_group_exists('team')).rejects.toBeUndefined();
    });
  });

  describe('validate_users_exist', function () {
    it('resolves an empty array without searching when given no users', async function () {
      const ctx = loadHelper();
      const result = await ctx.helper.validate_users_exist([]);
      expect(result).toEqual([]);
    });

    it('resolves lowercased uids from search entries', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.validate_users_exist(['JDoe']); },
        [
          { name: 'searchEntry', arg: { object: { uid: 'JDoe' } } },
          { name: 'end' }
        ]);
      expect(result).toEqual(['jdoe']);
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.validate_users_exist(['JDoe']); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.validate_users_exist(['JDoe'])).rejects.toBeUndefined();
    });
  });

  describe('validate_user_exists', function () {
    it('resolves true when the user is present', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.validate_user_exists('jdoe'); },
        [
          { name: 'searchEntry', arg: { object: { uid: 'jdoe' } } },
          { name: 'end' }
        ]);
      expect(result).toBe(true);
    });

    it('resolves false when the user is absent', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.validate_user_exists('ghost'); },
        [{ name: 'end' }]);
      expect(result).toBe(false);
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.validate_user_exists('jdoe'); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.validate_user_exists('jdoe')).rejects.toBeUndefined();
    });
  });

  describe('getGroupsForUser', function () {
    it('resolves lowercased group names that include the user as a uniqueMember', async function () {
      const ctx = loadHelper();
      ctx.models.Group.findAll.mockResolvedValue([{ name: 'TeamA' }, { name: 'TeamB' }]);

      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.getGroupsForUser('jdoe'); },
        [
          { name: 'searchEntry', arg: { object: { cn: 'TeamA', uniqueMember: ['uid=jdoe'] } } },
          { name: 'searchEntry', arg: { object: { cn: 'TeamB' } } }, // no uniqueMember -> skipped
          { name: 'end' }
        ]);

      expect(result).toEqual(['teama']);
    });

    it('resolves an empty array when there are no groups in the system', async function () {
      const ctx = loadHelper();
      ctx.models.Group.findAll.mockResolvedValue([]);

      const result = await ctx.helper.getGroupsForUser('jdoe');

      expect(result).toEqual([]);
      expect(ctx.client.searchAsync).not.toHaveBeenCalled();
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      ctx.models.Group.findAll.mockResolvedValue([{ name: 'TeamA' }]);
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.getGroupsForUser('jdoe'); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.models.Group.findAll.mockResolvedValue([{ name: 'TeamA' }]);
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.getGroupsForUser('jdoe')).rejects.toBeUndefined();
    });

    it('rejects when Group.findAll rejects', async function () {
      const ctx = loadHelper();
      ctx.models.Group.findAll.mockRejectedValue(new Error('db error'));
      await expect(ctx.helper.getGroupsForUser('jdoe')).rejects.toBeUndefined();
    });
  });

  describe('get_user_info', function () {
    it('resolves username/displayName objects from entries', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.get_user_info('jdoe'); },
        [
          { name: 'searchEntry', arg: { object: { uid: 'jdoe', displayName: 'Jane Doe' } } },
          { name: 'end' }
        ]);
      expect(result).toEqual([{ username: 'jdoe', displayName: 'Jane Doe' }]);
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.get_user_info('jdoe'); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.get_user_info('jdoe')).rejects.toBeUndefined();
    });
  });

  describe('search_users', function () {
    it('resolves username/displayName objects from entries', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.search_users('jd'); },
        [
          { name: 'searchEntry', arg: { object: { uid: 'jdoe', displayName: 'Jane Doe' } } },
          { name: 'end' }
        ]);
      expect(result).toEqual([{ username: 'jdoe', displayName: 'Jane Doe' }]);
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.search_users('jd'); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.search_users('jd')).rejects.toBeUndefined();
    });
  });

  describe('search_groups', function () {
    it('resolves cns from entries', async function () {
      const ctx = loadHelper();
      const result = await driveSearch(ctx.client,
        function () { return ctx.helper.search_groups('te'); },
        [
          { name: 'searchEntry', arg: { object: { cn: 'team' } } },
          { name: 'end' }
        ]);
      expect(result).toEqual(['team']);
    });

    it('rejects on search error', async function () {
      const ctx = loadHelper();
      await expect(driveSearch(ctx.client,
        function () { return ctx.helper.search_groups('te'); },
        [{ name: 'error', arg: new Error('err') }]
      )).rejects.toBeUndefined();
    });

    it('rejects when searchAsync rejects', async function () {
      const ctx = loadHelper();
      ctx.client.searchAsync.mockRejectedValue(new Error('bind error'));
      await expect(ctx.helper.search_groups('te')).rejects.toBeUndefined();
    });
  });
});
