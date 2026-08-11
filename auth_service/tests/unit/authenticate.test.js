'use strict';

/**
 * Unit tests for api/helpers/authenticate.js
 *
 * External collaborators mocked:
 *   - ldapjs (createClient, InvalidCredentialsError)
 *   - axios (RSA HTTP calls)
 *   - uuid (message ids)
 *   - node_funcs (logger)
 *
 * No real LDAP binds or HTTP requests are performed.
 */

class InvalidCredentialsError extends Error {}

function buildLdapMock() {
  const client = {
    on: jest.fn(),
    bind: jest.fn(),
    destroy: jest.fn()
  };
  const ldap = {
    createClient: jest.fn().mockReturnValue(client),
    InvalidCredentialsError: InvalidCredentialsError
  };
  return { ldap: ldap, client: client };
}

function loadAuthenticate(ldap, axios) {
  const uuid = { v4: jest.fn().mockReturnValue('msg-id') };
  const log = { debug: jest.fn(), warning: jest.fn(), info: jest.fn(), error: jest.fn() };

  jest.doMock('ldapjs', function () { return ldap; });
  jest.doMock('axios', function () { return axios; });
  jest.doMock('uuid', function () { return uuid; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });

  const authenticate = require('../../api/helpers/authenticate.js');
  return { authenticate: authenticate, uuid: uuid, log: log };
}

describe('authenticate', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('ldap_authenticate', function () {
    it('resolves with the bind result on successful bind', async function () {
      const l = buildLdapMock();
      l.client.bind.mockImplementation(function (dn, pw, cb) {
        cb(null, { bound: true });
      });
      const ctx = loadAuthenticate(l.ldap, {});

      const result = await ctx.authenticate.ldap_authenticate('jdoe', 'pw');

      expect(result).toEqual({ bound: true });
      expect(l.client.destroy).toHaveBeenCalled();
    });

    it('resolves false on InvalidCredentialsError', async function () {
      const l = buildLdapMock();
      l.client.bind.mockImplementation(function (dn, pw, cb) {
        cb(new InvalidCredentialsError('nope'));
      });
      const ctx = loadAuthenticate(l.ldap, {});

      const result = await ctx.authenticate.ldap_authenticate('jdoe', 'pw');

      expect(result).toBe(false);
      expect(ctx.log.warning).toHaveBeenCalled();
    });

    it('resolves false on a general bind error', async function () {
      const l = buildLdapMock();
      l.client.bind.mockImplementation(function (dn, pw, cb) {
        cb(new Error('server error'));
      });
      const ctx = loadAuthenticate(l.ldap, {});

      const result = await ctx.authenticate.ldap_authenticate('jdoe', 'pw');

      expect(result).toBe(false);
    });

    it('registers an error handler that logs LDAP client errors', function () {
      const l = buildLdapMock();
      l.client.bind.mockImplementation(function (dn, pw, cb) { cb(null, {}); });
      const ctx = loadAuthenticate(l.ldap, {});

      ctx.authenticate.ldap_authenticate('jdoe', 'pw');

      const onError = l.client.on.mock.calls.find(function (c) { return c[0] === 'error'; });
      expect(onError).toBeDefined();
      onError[1](new Error('client err'));
      expect(ctx.log.warning).toHaveBeenCalled();
    });

    it('resolves false when creating the client throws', async function () {
      const l = buildLdapMock();
      l.ldap.createClient.mockImplementation(function () { throw new Error('cannot connect'); });
      const ctx = loadAuthenticate(l.ldap, {});

      const result = await ctx.authenticate.ldap_authenticate('jdoe', 'pw');

      expect(result).toBe(false);
      expect(ctx.log.warning).toHaveBeenCalled();
    });
  });

  describe('rsa_authenticate', function () {
    function buildInitResponse() {
      return { data: { context: { authnAttemptId: 'attempt1', messageId: 'server-msg' } } };
    }

    it('returns true when verification responds with SUCCESS', async function () {
      const axios = { post: jest.fn() };
      axios.post
        .mockResolvedValueOnce(buildInitResponse())
        .mockResolvedValueOnce({ status: 200, data: { attemptResponseCode: 'SUCCESS' } });
      const ctx = loadAuthenticate(buildLdapMock().ldap, axios);

      const result = await ctx.authenticate.rsa_authenticate('jdoe', '123456');

      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledTimes(2);
      // verify the second call carried the passcode and correlation ids
      const verifyPayload = axios.post.mock.calls[1][1];
      expect(verifyPayload.subjectCredentials[0].collectedInputs[0].value).toBe('123456');
      expect(verifyPayload.context.authnAttemptId).toBe('attempt1');
      expect(verifyPayload.context.inResponseTo).toBe('server-msg');
    });

    it('returns false when verification responds without SUCCESS', async function () {
      const axios = { post: jest.fn() };
      axios.post
        .mockResolvedValueOnce(buildInitResponse())
        .mockResolvedValueOnce({ status: 200, data: { attemptResponseCode: 'FAIL' } });
      const ctx = loadAuthenticate(buildLdapMock().ldap, axios);

      const result = await ctx.authenticate.rsa_authenticate('jdoe', 'wrong');

      expect(result).toBe(false);
    });

    it('returns false when the initialize request fails', async function () {
      const axios = { post: jest.fn().mockRejectedValue(new Error('init failed')) };
      const ctx = loadAuthenticate(buildLdapMock().ldap, axios);

      const result = await ctx.authenticate.rsa_authenticate('jdoe', '123456');

      expect(result).toBe(false);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(ctx.log.warning).toHaveBeenCalled();
    });

    it('returns false when the verify request fails', async function () {
      const axios = { post: jest.fn() };
      axios.post
        .mockResolvedValueOnce(buildInitResponse())
        .mockRejectedValueOnce(new Error('verify failed'));
      const ctx = loadAuthenticate(buildLdapMock().ldap, axios);

      const result = await ctx.authenticate.rsa_authenticate('jdoe', '123456');

      expect(result).toBe(false);
      expect(ctx.log.warning).toHaveBeenCalled();
    });
  });
});
