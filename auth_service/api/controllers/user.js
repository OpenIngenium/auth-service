'use strict';

var url = require('url');

var User = require('./UserService');


module.exports.get_all_users = function get_all_users (req, res, next) {
  User.get_all_users(req.swagger.params, res, next);
};

module.exports.get_user = function get_user (req, res, next) {
  User.get_user(req.swagger.params, res, next);
};