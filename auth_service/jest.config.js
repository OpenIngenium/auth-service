module.exports = {
  testEnvironment: 'node',

  testMatch: [
    '**/tests/unit/**/*.test.js'
  ],

  // Scope coverage to first-party application logic exercised by unit tests.
  // Excluded from unit-test coverage (integration/bootstrap concerns per the
  // migration guide): app.js (Swagger server entry point), server/** (Sequelize
  // model definitions and DB migrations), api/mocks/**, and the retired legacy
  // test/** scaffolding.
  collectCoverageFrom: [
    'node_funcs.js',
    'env_config.js',
    'redis.js',
    'api/controllers/**/*.js',
    'api/helpers/**/*.js',
    '!api/mocks/**',
    '!**/node_modules/**'
  ],

  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html'
  ],

  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      statements: 100,
      lines: 100
    },
    // edit_role_groups() contains an unreachable ReferenceError branch (uses an
    // undefined `invalid_groups`); the two dead lines are preserved unchanged
    // per Phase 7 (behavior preservation) rather than "fixed" to hit 100%.
    './api/controllers/RoleService.js': {
      branches: 100,
      functions: 100,
      statements: 99,
      lines: 99
    }
  }
};
