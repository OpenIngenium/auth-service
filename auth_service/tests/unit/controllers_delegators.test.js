'use strict';

/**
 * Unit tests for the thin controller delegators that forward Swagger requests
 * to their corresponding *Service modules. Each service is mocked; the tests
 * assert that the controller forwards the expected arguments.
 */

const { mockResponse } = require('./mocks/testHelpers.js');

function makeReq(params) {
  return { swagger: { params: params } };
}

describe('controller delegators', function () {
  afterEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  // Generic delegator verifier for controllers whose handlers all call
  // Service.method(req.swagger.params, res, next).
  function verifySwaggerDelegation(controllerPath, servicePath, methods) {
    const service = {};
    methods.forEach(function (m) { service[m] = jest.fn(); });
    jest.doMock(servicePath, function () { return service; });

    const controller = require(controllerPath);
    const res = mockResponse();
    const next = jest.fn();

    methods.forEach(function (m) {
      const params = { key: m };
      const req = makeReq(params);
      controller[m](req, res, next);
      expect(service[m]).toHaveBeenCalledWith(params, res, next);
    });
  }

  it('user.js forwards to UserService', function () {
    verifySwaggerDelegation(
      '../../api/controllers/user.js',
      '../../api/controllers/UserService.js',
      ['get_all_users', 'get_user']
    );
  });

  it('group.js forwards to GroupService', function () {
    verifySwaggerDelegation(
      '../../api/controllers/group.js',
      '../../api/controllers/GroupService.js',
      ['get_all_groups', 'get_group', 'delete_group']
    );
  });

  it('ldap.js forwards to LdapService', function () {
    verifySwaggerDelegation(
      '../../api/controllers/ldap.js',
      '../../api/controllers/LdapService.js',
      ['search_users', 'search_groups']
    );
  });

  it('logging.js forwards to LoggingService', function () {
    verifySwaggerDelegation(
      '../../api/controllers/logging.js',
      '../../api/controllers/LoggingService.js',
      ['health', 'loglevelGET', 'loglevelPOST']
    );
  });

  it('permission.js forwards to PermissionService', function () {
    verifySwaggerDelegation(
      '../../api/controllers/permission.js',
      '../../api/controllers/PermissionService.js',
      ['get_all_permissions', 'get_groups_for_permission', 'get_permission', 'get_users_for_permission']
    );
  });

  it('role.js forwards to RoleService', function () {
    verifySwaggerDelegation(
      '../../api/controllers/role.js',
      '../../api/controllers/RoleService.js',
      [
        'add_role_group', 'add_role_user', 'create_role', 'delete_role',
        'delete_role_group', 'delete_role_permission', 'delete_role_user',
        'edit_role', 'edit_role_groups',
        'edit_role_permissions', 'edit_role_users', 'get_all_roles',
        'get_role', 'get_role_groups',
        'get_role_permissions', 'get_role_users'
      ]
    );
  });

  describe('authentication.js', function () {
    function loadAuthController() {
      const AuthenticationService = {
        login: jest.fn(),
        logout: jest.fn(),
        refresh_token: jest.fn()
      };
      const jwtHelper = { get_jwt_from_header: jest.fn().mockReturnValue('extracted-token') };

      jest.doMock('../../api/controllers/AuthenticationService.js', function () { return AuthenticationService; });
      jest.doMock('../../api/helpers/jwt_helper.js', function () { return jwtHelper; });

      const controller = require('../../api/controllers/authentication.js');
      return { controller: controller, AuthenticationService: AuthenticationService, jwtHelper: jwtHelper };
    }

    it('login forwards req.params to AuthenticationService.login', function () {
      const ctx = loadAuthController();
      const res = mockResponse();
      const next = jest.fn();
      const req = { params: { user: 'jdoe' } };

      ctx.controller.login(req, res, next);

      expect(ctx.AuthenticationService.login).toHaveBeenCalledWith({ user: 'jdoe' }, res, next);
    });

    it('logout forwards the extracted JWT to AuthenticationService.logout', function () {
      const ctx = loadAuthController();
      const res = mockResponse();
      const next = jest.fn();
      const req = { headers: {} };

      ctx.controller.logout(req, res, next);

      expect(ctx.jwtHelper.get_jwt_from_header).toHaveBeenCalledWith(req);
      expect(ctx.AuthenticationService.logout).toHaveBeenCalledWith('extracted-token', res, next);
    });

    it('refresh_token forwards the extracted JWT to AuthenticationService.refresh_token', function () {
      const ctx = loadAuthController();
      const res = mockResponse();
      const next = jest.fn();
      const req = { headers: {} };

      ctx.controller.refresh_token(req, res, next);

      expect(ctx.jwtHelper.get_jwt_from_header).toHaveBeenCalledWith(req);
      expect(ctx.AuthenticationService.refresh_token).toHaveBeenCalledWith('extracted-token', res, next);
    });
  });
});
