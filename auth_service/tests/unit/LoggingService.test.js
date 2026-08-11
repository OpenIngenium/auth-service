'use strict';

/**
 * Unit tests for api/controllers/LoggingService.js
 *
 * node_funcs is mocked to avoid configuring a real winston logger. lodash is
 * left real (pure in-process utility). global.LogLevel is controlled and
 * restored per test.
 */

const { mockResponse } = require('./mocks/testHelpers.js');

function loadService() {
  const log = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
  jest.doMock('../../node_funcs.js', function () { return { log: log }; });
  const service = require('../../api/controllers/LoggingService.js');
  return { service: service, log: log };
}

describe('LoggingService', function () {
  let savedLogLevel;

  beforeEach(function () {
    savedLogLevel = global.LogLevel;
  });

  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
    global.LogLevel = savedLogLevel;
  });

  describe('health', function () {
    it('responds 200 with an ok message', function () {
      const ctx = loadService();
      const res = mockResponse();

      ctx.service.health({}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'ok' });
    });
  });

  describe('loglevelGET', function () {
    it('responds 200 with the current global log level', function () {
      const ctx = loadService();
      global.LogLevel = 'DEBUG';
      const res = mockResponse();

      ctx.service.loglevelGET({}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ level: 'DEBUG' });
    });
  });

  describe('loglevelPOST', function () {
    it('sets the log level and responds 204 for an allowed level', function () {
      const ctx = loadService();
      const res = mockResponse();
      res.end = jest.fn();
      const args = { data: { value: { loglevel: 'INFO' } } };

      ctx.service.loglevelPOST(args, res, jest.fn());

      expect(global.LogLevel).toBe('INFO');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('responds 422 for an unsupported level', function () {
      const ctx = loadService();
      const res = mockResponse();
      res.end = jest.fn();
      const args = { data: { value: { loglevel: 'VERBOSE' } } };

      ctx.service.loglevelPOST(args, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({ message: 'VERBOSE is not supported' });
    });

    it('responds 422 when the loglevel parameter is missing', function () {
      const ctx = loadService();
      const res = mockResponse();
      res.end = jest.fn();
      const args = { data: { value: {} } };

      ctx.service.loglevelPOST(args, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({ message: 'Required parameter missing: loglevel' });
    });
  });
});
