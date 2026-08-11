'use strict';

/**
 * Unit tests for api/helpers/jwt_helper.js
 *
 * External collaborators mocked:
 *   - jsonwebtoken (sign/verify)
 *   - uuid (v4)
 *   - ../../redis.js (redisClient async methods)
 *   - ../../server/models/index.js (User.update)
 *   - ../../node_funcs.js (logger)
 *
 * env_config is left real; its constants (ACCESS_TOKEN_TIMEOUT,
 * TEN_SEC_OFFSET, long_expire) drive branch behavior.
 */

const { mockModels } = require('./mocks/mockDatabase.js');
const { mockRedisClient } = require('./mocks/mockRedis.js');

function loadJwtHelper() {
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token'), verify: jest.fn() };
  const uuid = { v4: jest.fn().mockReturnValue('fixed-uuid') };
  const redis = mockRedisClient();
  const models = mockModels();
  const log = {
    info: jest.fn(), debug: jest.fn(), warning: jest.fn(),
    error: jest.fn(), trace: jest.fn(), critical: jest.fn()
  };

  jest.doMock('jsonwebtoken', function () { return jwt; });
  jest.doMock('uuid', function () { return uuid; });
  jest.doMock('../../redis.js', function () { return redis; });
  jest.doMock('../../server/models/index.js', function () { return models; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });

  const jwtHelper = require('../../api/helpers/jwt_helper.js');
  return { jwtHelper: jwtHelper, jwt: jwt, uuid: uuid, redis: redis, models: models, log: log };
}

describe('jwt_helper', function () {
  const RealDate = Date;

  function fixDate(iso) {
    const fixed = new RealDate(iso);
    global.Date = class extends RealDate {
      constructor() {
        super();
        return new RealDate(fixed.getTime());
      }
      static now() {
        return fixed.getTime();
      }
    };
  }

  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
    global.Date = RealDate;
  });

  describe('decode_jwt', function () {
    it('returns the decoded payload on success', function () {
      const ctx = loadJwtHelper();
      ctx.jwt.verify.mockReturnValue({ username: 'jdoe', jti: 'abc' });

      const result = ctx.jwtHelper.decode_jwt('token');

      expect(result).toEqual({ username: 'jdoe', jti: 'abc' });
      expect(ctx.jwt.verify).toHaveBeenCalledWith('token', expect.anything(), { algorithms: ['RS256'] });
    });

    it('returns null and logs when verification throws', function () {
      const ctx = loadJwtHelper();
      ctx.jwt.verify.mockImplementation(function () { throw new Error('bad'); });

      const result = ctx.jwtHelper.decode_jwt('token');

      expect(result).toBeNull();
      expect(ctx.log.error).toHaveBeenCalledWith('Couldnt decode jwt token');
    });
  });

  describe('get_jwt_from_header', function () {
    it('extracts the token from a Bearer authorization header', function () {
      const ctx = loadJwtHelper();
      const req = { headers: { authorization: 'Bearer mytoken' } };
      expect(ctx.jwtHelper.get_jwt_from_header(req)).toBe('mytoken');
    });

    it('returns null and warns when the header is missing or malformed', function () {
      const ctx = loadJwtHelper();
      expect(ctx.jwtHelper.get_jwt_from_header({ headers: {} })).toBeNull();
      expect(ctx.jwtHelper.get_jwt_from_header({ headers: { authorization: 'Basic abc' } })).toBeNull();
      expect(ctx.log.warning).toHaveBeenCalled();
    });
  });

  describe('is_token_blacklisted', function () {
    it('resolves true when redis returns a value', async function () {
      const ctx = loadJwtHelper();
      ctx.redis.redisClient.getAsync.mockResolvedValue('some-value');

      await expect(ctx.jwtHelper.is_token_blacklisted('jti1')).resolves.toBe(true);
      expect(ctx.redis.redisClient.getAsync).toHaveBeenCalledWith('jti1');
    });

    it('resolves false when redis returns a falsy value', async function () {
      const ctx = loadJwtHelper();
      ctx.redis.redisClient.getAsync.mockResolvedValue(null);

      await expect(ctx.jwtHelper.is_token_blacklisted('jti2')).resolves.toBe(false);
    });

    it('rejects when redis errors', async function () {
      const ctx = loadJwtHelper();
      ctx.redis.redisClient.getAsync.mockRejectedValue(new Error('redis down'));

      await expect(ctx.jwtHelper.is_token_blacklisted('jti3')).rejects.toBeUndefined();
    });
  });

  describe('updateLoggedInStatus', function () {
    it('advances login_expire one hour on login during a normal hour', async function () {
      const ctx = loadJwtHelper();
      fixDate('2023-01-15T10:05:07');

      await ctx.jwtHelper.updateLoggedInStatus('jdoe');

      const call = ctx.models.User.update.mock.calls[0];
      expect(call[0].login_expire).toContain('11:');
      expect(call[1]).toEqual({ where: { username: 'jdoe' } });
    });

    it('wraps to hour 00 when logging in at hour 23', async function () {
      const ctx = loadJwtHelper();
      fixDate('2023-01-15T23:30:00');

      await ctx.jwtHelper.updateLoggedInStatus('jdoe');

      const call = ctx.models.User.update.mock.calls[0];
      expect(call[0].login_expire).toMatch(/ 00:/);
    });

    it('zero-pads single digit new hours on login', async function () {
      const ctx = loadJwtHelper();
      // 08:00 -> next hour 09 (single digit, must be zero padded)
      fixDate('2023-01-15T08:00:00');

      await ctx.jwtHelper.updateLoggedInStatus('jdoe');

      const call = ctx.models.User.update.mock.calls[0];
      expect(call[0].login_expire).toMatch(/ 09:/);
    });

    it('does not advance the hour on logout', async function () {
      const ctx = loadJwtHelper();
      fixDate('2023-01-15T10:05:07');

      await ctx.jwtHelper.updateLoggedInStatus('jdoe', true);

      const call = ctx.models.User.update.mock.calls[0];
      expect(call[0].login_expire).toMatch(/ 10:/);
    });

    it('zero-pads single digit month, minutes, and seconds', async function () {
      const ctx = loadJwtHelper();
      fixDate('2023-03-15T10:05:07');

      await ctx.jwtHelper.updateLoggedInStatus('jdoe', true);

      const call = ctx.models.User.update.mock.calls[0];
      // month 03, minutes 05, seconds 07 all zero padded
      expect(call[0].login_expire).toMatch(/2023-03-15 10:05:07/);
    });

    it('does not zero-pad a two digit month', async function () {
      const ctx = loadJwtHelper();
      fixDate('2023-11-15T10:30:45');

      await ctx.jwtHelper.updateLoggedInStatus('jdoe', true);

      const call = ctx.models.User.update.mock.calls[0];
      expect(call[0].login_expire).toMatch(/2023-11-15 10:30:45/);
    });
  });

  describe('create_access_token', function () {
    it('updates login status, signs a token and returns timeout', async function () {
      const ctx = loadJwtHelper();
      fixDate('2023-01-15T10:00:00');
      const permission = { scopes: [{ scope: 'read' }], roles: [{ role: 'admin' }] };

      const result = await ctx.jwtHelper.create_access_token('jdoe', permission);

      expect(ctx.models.User.update).toHaveBeenCalled();
      expect(ctx.uuid.v4).toHaveBeenCalled();
      expect(ctx.jwt.sign).toHaveBeenCalled();
      const signedPayload = ctx.jwt.sign.mock.calls[0][0];
      expect(signedPayload.username).toBe('jdoe');
      expect(signedPayload.jti).toBe('fixed-uuid');
      expect(result.token).toBe('signed.jwt.token');
      expect(result.access_token_timeout).toBe('3410s');
    });
  });

  describe('refresh_token', function () {
    it('returns null when the token cannot be decoded', async function () {
      const ctx = loadJwtHelper();
      ctx.jwt.verify.mockImplementation(function () { throw new Error('bad'); });

      const result = await ctx.jwtHelper.refresh_token('badtoken');

      expect(result).toBeNull();
      expect(ctx.log.warning).toHaveBeenCalled();
    });

    it('issues a new token when within long_expire and not blacklisted', async function () {
      const ctx = loadJwtHelper();
      const nowSec = Math.floor(Date.now() / 1000);
      ctx.jwt.verify.mockReturnValue({
        username: 'jdoe', jti: 'jti1', oit: nowSec,
        scopes: [{ scope: 'read' }], roles: [{ role: 'admin' }]
      });
      ctx.redis.redisClient.existsAsync.mockResolvedValue(0);

      const result = await ctx.jwtHelper.refresh_token('goodtoken');

      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.access_token_timeout).toBe('3410s');
      expect(ctx.models.User.update).toHaveBeenCalled();
    });

    it('returns null when the token is blacklisted in redis', async function () {
      const ctx = loadJwtHelper();
      const nowSec = Math.floor(Date.now() / 1000);
      ctx.jwt.verify.mockReturnValue({
        username: 'jdoe', jti: 'jti1', oit: nowSec, scopes: [], roles: []
      });
      ctx.redis.redisClient.existsAsync.mockResolvedValue(1);

      const result = await ctx.jwtHelper.refresh_token('goodtoken');

      expect(result).toBeNull();
      expect(ctx.log.warning).toHaveBeenCalled();
    });

    it('returns an error marker when the original issue time exceeds long_expire', async function () {
      const ctx = loadJwtHelper();
      const oldOit = Math.floor(Date.now() / 1000) - 100000; // > 43200 default
      ctx.jwt.verify.mockReturnValue({
        username: 'jdoe', jti: 'jti1', oit: oldOit, scopes: [], roles: []
      });

      const result = await ctx.jwtHelper.refresh_token('goodtoken');

      expect(result).toEqual({ access_token: 'error' });
    });
  });
});
