'use strict';

/**
 * Unit tests for redis.js
 *
 * The real `redis` module is mocked so no network connection is attempted.
 * We capture the event handlers registered via client.on() and invoke them to
 * exercise the connect/error logging branches.
 */

describe('redis', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRedis() {
    const handlers = {};
    const client = {
      on: jest.fn(function (event, cb) {
        handlers[event] = cb;
      })
    };
    const createClient = jest.fn().mockReturnValue(client);

    const info = jest.fn();
    const error = jest.fn();
    jest.doMock('redis', function () {
      return { createClient: createClient };
    });
    jest.doMock('../../node_funcs.js', function () {
      return { log: { info: info, error: error } };
    });

    const mod = require('../../redis.js');
    return { mod: mod, handlers: handlers, createClient: createClient, info: info, error: error };
  }

  it('creates the redis client on the expected host and port', function () {
    const ctx = loadRedis();
    expect(ctx.createClient).toHaveBeenCalledWith(6379, 'auth_service_redis');
    expect(ctx.mod.redisClient).toBeDefined();
  });

  it('logs on the connect event', function () {
    const ctx = loadRedis();
    ctx.handlers.connect();
    expect(ctx.info).toHaveBeenCalledWith('Connected to REDIS');
  });

  it('logs on the error event', function () {
    const ctx = loadRedis();
    ctx.handlers.error(new Error('boom'));
    expect(ctx.error).toHaveBeenCalled();
    expect(ctx.error.mock.calls[0][0]).toBe("Couldn't connect to REDIS ");
  });
});
