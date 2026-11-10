'use strict';

/**
 * Unit tests for api/controllers/AuthenticationService.js
 *
 * Collaborators mocked: login_helper, jwt_helper, redis, node_funcs.
 * `ms` and `env_config` are left real (pure in-process utilities/constants).
 */

const { mockResponse } = require('./mocks/testHelpers.js');
const { mockRedisClient } = require('./mocks/mockRedis.js');

function loadService() {
  const login_helper = {
    getPermission: jest.fn(),
    ensure_user: jest.fn().mockResolvedValue(undefined)
  };
  const jwtHelper = {
    create_access_token: jest.fn(),
    decode_jwt: jest.fn(),
    refresh_token: jest.fn(),
    updateLoggedInStatus: jest.fn().mockResolvedValue(undefined)
  };
  const redis = mockRedisClient();
  const log = { debug: jest.fn(), info: jest.fn(), warning: jest.fn(), error: jest.fn() };

  jest.doMock('../../api/helpers/login_helper.js', function () { return login_helper; });
  jest.doMock('../../api/helpers/jwt_helper.js', function () { return jwtHelper; });
  jest.doMock('../../redis.js', function () { return redis; });
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });

  const service = require('../../api/controllers/AuthenticationService.js');
  return { service: service, login_helper: login_helper, jwtHelper: jwtHelper, redis: redis, log: log };
}

describe('AuthenticationService', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('login', function () {
    it('issues a token and ensures the user when permissions exist', async function () {
      const ctx = loadService();
      ctx.login_helper.getPermission.mockResolvedValue({ scopes: [{ scope: 'read' }] });
      ctx.jwtHelper.create_access_token.mockResolvedValue({ token: 'tok', access_token_timeout: '3410s' });
      const res = mockResponse();

      await ctx.service.login({ user: 'jdoe' }, res, jest.fn());

      expect(ctx.jwtHelper.create_access_token).toHaveBeenCalledWith('jdoe', { scopes: [{ scope: 'read' }] });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ access_token: 'tok', access_token_timeout: '3410s' });
      expect(ctx.login_helper.ensure_user).toHaveBeenCalledWith('jdoe');
    });

    it('responds 401 when the user has no scopes', async function () {
      const ctx = loadService();
      ctx.login_helper.getPermission.mockResolvedValue({ scopes: [] });
      const res = mockResponse();

      await ctx.service.login({ user: 'jdoe' }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(ctx.jwtHelper.create_access_token).not.toHaveBeenCalled();
    });

    it('responds 401 when scopes are undefined', async function () {
      const ctx = loadService();
      ctx.login_helper.getPermission.mockResolvedValue({});
      const res = mockResponse();

      await ctx.service.login({ user: 'jdoe' }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logout', function () {
    it('blacklists the token in redis and responds 200', function () {
      const ctx = loadService();
      ctx.jwtHelper.decode_jwt.mockReturnValue({ jti: 'jti1', username: 'jdoe' });
      const res = mockResponse();

      ctx.service.logout('sometoken', res, jest.fn());

      expect(ctx.redis.redisClient.set).toHaveBeenCalledWith('jti1', 'jti1', ctx.redis.redisClient.print);
      expect(ctx.redis.redisClient.expire).toHaveBeenCalled();
      expect(ctx.jwtHelper.updateLoggedInStatus).toHaveBeenCalledWith('jdoe', true);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('responds 401 when the token is null', function () {
      const ctx = loadService();
      ctx.jwtHelper.decode_jwt.mockReturnValue(null);
      const res = mockResponse();

      ctx.service.logout(null, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    });

    it('invokes the redis get callback without error', function () {
      const ctx = loadService();
      ctx.jwtHelper.decode_jwt.mockReturnValue({ jti: 'jti1', username: 'jdoe' });
      // make redis.get invoke its callback so that branch executes
      ctx.redis.redisClient.get.mockImplementation(function (key, cb) { cb(null, 'jti1'); });
      const res = mockResponse();

      ctx.service.logout('sometoken', res, jest.fn());

      expect(ctx.redis.redisClient.get).toHaveBeenCalled();
    });
  });

  describe('refresh_token', function () {
    it('responds 200 with a new token on success', async function () {
      const ctx = loadService();
      ctx.jwtHelper.refresh_token.mockResolvedValue({ access_token: 'newtok', access_token_timeout: '3410s' });
      const res = mockResponse();

      await ctx.service.refresh_token('oldtok', res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ access_token: 'newtok', access_token_timeout: '3410s' });
    });

    it('responds 401 when refresh returns null', async function () {
      const ctx = loadService();
      ctx.jwtHelper.refresh_token.mockResolvedValue(null);
      const res = mockResponse();

      await ctx.service.refresh_token('oldtok', res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    });

    it('responds 403 when refresh returns a token error marker', async function () {
      const ctx = loadService();
      ctx.jwtHelper.refresh_token.mockResolvedValue({ access_token: 'error' });
      const res = mockResponse();

      await ctx.service.refresh_token('oldtok', res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Long expire, Unauthorized' });
    });
  });
});
