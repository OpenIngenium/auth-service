'use strict';

/**
 * Factory for a mocked redis client matching the shape exported by redis.js
 * and the promisified `*Async` methods used by jwt_helper.
 */
function mockRedisClient() {
  return {
    redisClient: {
      getAsync: jest.fn().mockResolvedValue(null),
      existsAsync: jest.fn().mockResolvedValue(0),
      setAsync: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      set: jest.fn(),
      expire: jest.fn(),
      print: jest.fn(),
      on: jest.fn()
    }
  };
}

module.exports = {
  mockRedisClient: mockRedisClient
};
