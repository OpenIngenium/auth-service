'use strict';

/**
 * Unit tests for node_funcs.js
 *
 * External collaborators mocked:
 *   - jsonwebtoken (token verification)
 *   - winston (logging transports/logger)
 *
 * node_funcs reads env_config (PUBLIC_PEM) at import time and configures a
 * winston logger based on process.env, so the module cache is cleared and the
 * module reloaded inside tests that need specific environment/behavior.
 */

describe('node_funcs', function () {
  const ORIGINAL_ENV = Object.assign({}, process.env);

  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = Object.assign({}, ORIGINAL_ENV);
  });

  describe('String.prototype.format', function () {
    it('replaces indexed placeholders with the provided arguments', function () {
      require('../../node_funcs.js');
      expect('element id is {0}'.format('abc')).toBe('element id is abc');
      expect('{0} and {1}'.format('a', 'b')).toBe('a and b');
    });

    it('leaves placeholders whose argument is undefined as undefined text', function () {
      require('../../node_funcs.js');
      expect('{0}-{1}'.format('x')).toBe('x-undefined');
    });
  });

  describe('parse_username', function () {
    it('returns empty string when the authorization header is falsy', function () {
      jest.doMock('jsonwebtoken', function () {
        return { verify: jest.fn() };
      });
      const node_funcs = require('../../node_funcs.js');
      expect(node_funcs.parse_username('')).toBe('');
    });

    it('verifies the token and returns the decoded username', function () {
      const verify = jest.fn().mockReturnValue({ username: 'jdoe' });
      jest.doMock('jsonwebtoken', function () {
        return { verify: verify };
      });
      const node_funcs = require('../../node_funcs.js');

      const result = node_funcs.parse_username('Bearer sometoken');

      expect(result).toBe('jdoe');
      expect(verify).toHaveBeenCalledWith(
        'sometoken',
        expect.anything(),
        { algorithms: ['RS256'] }
      );
    });

    it('passes an empty token to verify when header has no space', function () {
      const verify = jest.fn().mockReturnValue({ username: 'someone' });
      jest.doMock('jsonwebtoken', function () {
        return { verify: verify };
      });
      const node_funcs = require('../../node_funcs.js');

      node_funcs.parse_username('Bearertokenwithnospace');

      expect(verify).toHaveBeenCalledWith(
        '',
        expect.anything(),
        { algorithms: ['RS256'] }
      );
    });
  });

  describe('logger json_formatter', function () {
    // Helper to capture the format function passed to winston and invoke it.
    function loadWithCapturedFormatter(envOverrides) {
      const formatFactories = [];
      const combinedFns = [];

      // winston.format is a callable that wraps a formatter factory, and it also
      // exposes combine/splat/simple used during logger construction.
      const format = jest.fn(function (fn) {
        // Return a factory; calling the factory yields the formatter object.
        return function () {
          formatFactories.push(fn);
          return { transform: fn };
        };
      });
      format.combine = jest.fn(function () {
        for (var i = 0; i < arguments.length; i++) {
          combinedFns.push(arguments[i]);
        }
        return 'combined-format';
      });
      format.splat = jest.fn().mockReturnValue('splat');
      format.simple = jest.fn().mockReturnValue('simple');

      const ConsoleTransport = jest.fn();
      const FileTransport = jest.fn();

      const createLogger = jest.fn().mockReturnValue({ info: jest.fn() });

      jest.doMock('winston', function () {
        return {
          createLogger: createLogger,
          format: format,
          transports: {
            Console: ConsoleTransport,
            File: FileTransport
          }
        };
      });

      if (envOverrides) {
        Object.keys(envOverrides).forEach(function (k) {
          if (envOverrides[k] === undefined) {
            delete process.env[k];
          } else {
            process.env[k] = envOverrides[k];
          }
        });
      }

      require('../../node_funcs.js');

      return {
        formatter: formatFactories[0],
        createLogger: createLogger,
        ConsoleTransport: ConsoleTransport,
        FileTransport: FileTransport
      };
    }

    const MESSAGE = Symbol.for('message');

    it('formats a string meta value into a details array', function () {
      const ctx = loadWithCapturedFormatter({ LOG_FILE_PATH: undefined, LOG_LEVEL: undefined });
      const entry = { level: 'info', message: 'hello', meta: 'extra' };

      const result = ctx.formatter(entry);

      const parsed = JSON.parse(result[MESSAGE]);
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('hello');
      expect(parsed.details).toEqual(['extra']);
    });

    it('inspects each element when meta is an array', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'error', message: 'oops', meta: [{ a: 1 }, 'two'] };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.level).toBe('ERROR');
      expect(Array.isArray(parsed.details)).toBe(true);
      expect(parsed.details).toHaveLength(2);
      expect(parsed.details[1]).toContain('two');
    });

    it('inspects an empty object meta into details', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'debug', message: 'empty', meta: {} };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(typeof parsed.details).toBe('string');
    });

    it('merges a non-empty object meta into the json output', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'info', message: 'merge', meta: { user_name: 'jdoe', service: 'auth_service' } };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.user_name).toBe('jdoe');
      expect(parsed.service).toBe('auth_service');
      expect(parsed.details).toBeUndefined();
    });

    it('handles entries without meta', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'info', message: 'no meta' };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.message).toBe('no meta');
      expect(parsed.details).toBeUndefined();
    });

    const SPLAT = Symbol.for('splat');

    it('reads a single string arg from the winston 3 splat symbol', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'warning', message: 'boom', [SPLAT]: ['some error detail'] };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.details).toEqual(['some error detail']);
    });

    it('merges a single object arg from the splat symbol', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'info', message: 'merge', [SPLAT]: [{ user_name: 'jdoe' }] };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.user_name).toBe('jdoe');
      expect(parsed.details).toBeUndefined();
    });

    it('inspects multiple splat args into details', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'error', message: 'multi', [SPLAT]: [{ a: 1 }, 'two'] };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.details).toHaveLength(2);
      expect(parsed.details[1]).toContain('two');
    });

    it('prefers meta over the splat symbol when both are present', function () {
      const ctx = loadWithCapturedFormatter();
      const entry = { level: 'info', message: 'both', meta: 'from-meta', [SPLAT]: ['from-splat'] };

      const result = ctx.formatter(entry);
      const parsed = JSON.parse(result[MESSAGE]);

      expect(parsed.details).toEqual(['from-meta']);
    });

    it('adds a File transport when LOG_FILE_PATH is set', function () {
      const ctx = loadWithCapturedFormatter({ LOG_FILE_PATH: '/tmp/test.log' });
      expect(ctx.FileTransport).toHaveBeenCalledTimes(1);
    });

    it('does not add a File transport when LOG_FILE_PATH is unset', function () {
      const ctx = loadWithCapturedFormatter({ LOG_FILE_PATH: undefined });
      expect(ctx.FileTransport).not.toHaveBeenCalled();
    });

    it('uses the configured LOG_LEVEL (lowercased) for the logger', function () {
      const ctx = loadWithCapturedFormatter({ LOG_LEVEL: 'INFO' });
      const config = ctx.createLogger.mock.calls[0][0];
      expect(config.level).toBe('info');
    });

    it('defaults the logger level to debug when LOG_LEVEL is unset', function () {
      const ctx = loadWithCapturedFormatter({ LOG_LEVEL: undefined });
      const config = ctx.createLogger.mock.calls[0][0];
      expect(config.level).toBe('debug');
    });
  });
});
