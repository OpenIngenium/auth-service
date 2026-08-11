'use strict';

/**
 * Unit tests for env_config.js
 *
 * env_config reads process.env at import time, so each test clears the module
 * cache, controls process.env explicitly, then reloads the module. process.env
 * is restored after every test so no state leaks between tests.
 */

describe('env_config', function () {
  const ORIGINAL_ENV = Object.assign({}, process.env);

  const ENV_KEYS = [
    'NODE_ENV', 'MYSQL_USERNAME', 'MYSQL_ROOT_PASSWORD', 'MYSQL_DATABASE',
    'MYSQL_HOST', 'PUBLIC_PEM', 'PRIVATE_PEM', 'USERNAME', 'PASSWORD',
    'LONG_EXPIRE', 'AUTH_METHOD', 'LDAP_URL', 'RSA_URL', 'RSA_CLIENT_ID',
    'RSA_CLIENT_KEY'
  ];

  function clearEnv() {
    ENV_KEYS.forEach(function (k) { delete process.env[k]; });
  }

  afterEach(function () {
    jest.resetModules();
    process.env = Object.assign({}, ORIGINAL_ENV);
  });

  it('applies documented defaults when no environment variables are set', function () {
    jest.resetModules();
    clearEnv();
    const cfg = require('../../env_config.js');

    expect(cfg.env).toBe('development');
    expect(cfg.db_username).toBe('root');
    expect(cfg.db_password).toBe('');
    expect(cfg.db_name).toBe('auth');
    expect(cfg.db_host).toBe('auth_service_mysql');
    expect(cfg.test_user).toBe('');
    expect(cfg.test_pass).toBe('');
    expect(cfg.long_expire).toBe(43200);
    expect(cfg.AUTH_METHOD).toBe('password');
    expect(cfg.ldap_url).toBe('');
    expect(cfg.RSA_URL).toBe('https://jpltfa-primary.jpl.nasa.gov:5555/mfa/v1_1/authn');
    expect(cfg.RSA_CLIENT_ID).toBe('jw1');
    expect(cfg.RSA_CLIENT_KEY).toBe('');
    expect(cfg.PUBLIC_PEM).toBe('');
    expect(cfg.PRIVATE_PEM).toBe('');
  });

  it('exposes fixed constants regardless of environment', function () {
    jest.resetModules();
    clearEnv();
    const cfg = require('../../env_config.js');

    expect(cfg.ACCESS_TOKEN_TIMEOUT).toBe('3410s');
    expect(cfg.TEN_SEC_OFFSET).toBe(10);
    expect(cfg.PORT).toBe(8080);
    expect(cfg.LOG_LEVEL).toBe('DEBUG');
  });

  it('reads values from the environment when provided', function () {
    jest.resetModules();
    clearEnv();
    process.env.NODE_ENV = 'production';
    process.env.MYSQL_USERNAME = 'dbuser';
    process.env.MYSQL_ROOT_PASSWORD = 'secret';
    process.env.MYSQL_DATABASE = 'mydb';
    process.env.MYSQL_HOST = 'db.example.com';
    process.env.PUBLIC_PEM = 'pub';
    process.env.PRIVATE_PEM = 'priv';
    process.env.USERNAME = 'tester';
    process.env.PASSWORD = 'pw';
    process.env.LONG_EXPIRE = '999';
    process.env.AUTH_METHOD = 'rsa';
    process.env.LDAP_URL = 'ldap://host';
    process.env.RSA_URL = 'https://rsa.example.com';
    process.env.RSA_CLIENT_ID = 'client99';
    process.env.RSA_CLIENT_KEY = 'key99';

    const cfg = require('../../env_config.js');

    expect(cfg.env).toBe('production');
    expect(cfg.db_username).toBe('dbuser');
    expect(cfg.db_password).toBe('secret');
    expect(cfg.db_name).toBe('mydb');
    expect(cfg.db_host).toBe('db.example.com');
    expect(cfg.PUBLIC_PEM).toBe('pub');
    expect(cfg.PRIVATE_PEM).toBe('priv');
    expect(cfg.test_user).toBe('tester');
    expect(cfg.test_pass).toBe('pw');
    expect(cfg.long_expire).toBe('999');
    expect(cfg.AUTH_METHOD).toBe('rsa');
    expect(cfg.ldap_url).toBe('ldap://host');
    expect(cfg.RSA_URL).toBe('https://rsa.example.com');
    expect(cfg.RSA_CLIENT_ID).toBe('client99');
    expect(cfg.RSA_CLIENT_KEY).toBe('key99');
  });
});
