'use strict';

var url = require('url');

var Permission = require('./PermissionService');

module.exports.get_all_permissions = function get_all_permissions (req, res, next) {
  Permission.get_all_permissions(req.swagger.params, res, next);
};

module.exports.get_groups_for_permission = function get_groups_for_permission (req, res, next) {
  Permission.get_groups_for_permission(req.swagger.params, res, next);
};

module.exports.get_permission = function get_permission (req, res, next) {
  Permission.get_permission(req.swagger.params, res, next);
};

module.exports.get_users_for_permission = function get_users_for_permission (req, res, next) {
  Permission.get_users_for_permission(req.swagger.params, res, next);
};
