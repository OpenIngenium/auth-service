'use strict';
var jwtHelper = require('../helpers/jwt_helper.js');

var url = require('url');

var Authentication = require('./AuthenticationService');

module.exports.login = function login (req, res, next) {
  Authentication.login(req.params, res, next);
};

module.exports.logout = function logout (req, res, next) {
  Authentication.logout(jwtHelper.get_jwt_from_header(req), res, next);
};

module.exports.refresh_token = function refresh_token (req, res, next) {
  Authentication.refresh_token(jwtHelper.get_jwt_from_header(req), res, next);
};
