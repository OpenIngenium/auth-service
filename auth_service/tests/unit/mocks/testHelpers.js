'use strict';

/**
 * Reusable test helpers for auth_service unit tests.
 */

/**
 * Build a mock Express response object whose methods are jest mocks and
 * return `this` so calls like res.status(200).json({...}) can be chained
 * and asserted.
 */
function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Build a mock Express request object with sensible defaults that can be
 * overridden per test.
 */
function mockRequest(overrides) {
  const base = {
    headers: {},
    params: {},
    swagger: null,
    url: '/',
    method: 'GET'
  };
  return Object.assign(base, overrides || {});
}

/**
 * Snapshot process.env and return a restore function so tests never leak
 * environment mutations into other tests.
 */
function withEnv(vars) {
  const saved = Object.assign({}, process.env);
  Object.keys(vars).forEach(function (key) {
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  });
  return function restore() {
    process.env = saved;
  };
}

/**
 * Flush pending microtasks and the macrotask queue so that fire-and-forget
 * promise chains inside controllers (which do not return their promise) settle
 * before assertions run. Awaiting this a few times drains deeply nested chains.
 */
function flush(times) {
  const iterations = times || 1;
  let p = Promise.resolve();
  for (let i = 0; i < iterations; i++) {
    p = p.then(function () {
      return new Promise(function (resolve) { setImmediate(resolve); });
    });
  }
  return p;
}

module.exports = {
  mockResponse: mockResponse,
  mockRequest: mockRequest,
  withEnv: withEnv,
  flush: flush
};
