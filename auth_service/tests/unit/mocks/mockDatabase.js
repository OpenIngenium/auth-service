'use strict';

/**
 * Factory helpers that build jest-mocked Sequelize model collaborators.
 *
 * These mocks replace `server/models/index.js`, which in production opens real
 * MySQL connections and runs migrations at import time. Unit tests must never
 * perform real I/O, so every consumer of the models module mocks it with the
 * object returned by `mockModels()`.
 */

/**
 * Build a mock model instance (a row) with the association getters used across
 * the services. Each getter defaults to resolving an empty array and can be
 * overridden via the `overrides` argument.
 */
function mockInstance(overrides) {
  const instance = {
    getRoles: jest.fn().mockResolvedValue([]),
    getGroups: jest.fn().mockResolvedValue([]),
    getUsers: jest.fn().mockResolvedValue([]),
    getPermissions: jest.fn().mockResolvedValue([]),
    setRoles: jest.fn().mockResolvedValue(undefined),
    setGroups: jest.fn().mockResolvedValue(undefined),
    setUsers: jest.fn().mockResolvedValue(undefined),
    setPermissions: jest.fn().mockResolvedValue(undefined),
    addRole: jest.fn().mockResolvedValue(undefined),
    addUser: jest.fn().mockResolvedValue(undefined),
    addPermission: jest.fn().mockResolvedValue(undefined),
    removeRole: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    toJSON: jest.fn(function () {
      return Object.assign({}, this.dataValues || {});
    })
  };
  return Object.assign(instance, overrides || {});
}

/**
 * Build a mock model (e.g. User, Group, Role, Permission) with the static
 * finder/creator methods used by the services. All default to benign resolved
 * values and can be overridden per test.
 */
function mockModel() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] }),
    findOrCreate: jest.fn().mockResolvedValue([mockInstance(), true]),
    create: jest.fn().mockResolvedValue(mockInstance()),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1)
  };
}

/**
 * Build the full mocked models module.
 */
function mockModels() {
  return {
    User: mockModel(),
    Group: mockModel(),
    Role: mockModel(),
    Permission: mockModel(),
    RoleUser: mockModel(),
    RoleGroup: mockModel(),
    RolePermission: mockModel(),
    UserGroup: mockModel(),
    UserPermission: mockModel(),
    sequelize: {
      transaction: jest.fn().mockImplementation(function (fn) {
        if (typeof fn === 'function') {
          return Promise.resolve(fn({}));
        }
        return Promise.resolve({
          commit: jest.fn().mockResolvedValue(undefined),
          rollback: jest.fn().mockResolvedValue(undefined)
        });
      }),
      query: jest.fn().mockResolvedValue([]),
      QueryTypes: { SELECT: 'SELECT' }
    },
    init_db: jest.fn().mockResolvedValue(undefined)
  };
}

module.exports = {
  mockModels: mockModels,
  mockModel: mockModel,
  mockInstance: mockInstance
};
