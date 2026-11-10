'use strict';

var url = require('url');

var Role = require('./RoleService');

module.exports.add_role_group = function add_role_group (req, res, next) {
  Role.add_role_group(req.swagger.params, res, next);
};

module.exports.add_role_user = function add_role_user (req, res, next) {
  Role.add_role_user(req.swagger.params, res, next);
};

module.exports.create_role = function create_role (req, res, next) {
    Role.create_role(req.swagger.params, res, next);
};

module.exports.delete_role = function delete_role (req, res, next) {
  Role.delete_role(req.swagger.params, res, next);
};

module.exports.delete_role_group = function delete_role_group (req, res, next) {
  Role.delete_role_group(req.swagger.params, res, next);
};

module.exports.delete_role_permission = function delete_role_permission (req, res, next) {
  Role.delete_role_permission(req.swagger.params, res, next);
};

module.exports.delete_role_user = function delete_role_user (req, res, next) {
  Role.delete_role_user(req.swagger.params, res, next);
};

module.exports.edit_role = function edit_role (req, res, next) {
  Role.edit_role(req.swagger.params, res, next);
};

module.exports.edit_role_groups = function edit_role_groups (req, res, next) {
  Role.edit_role_groups(req.swagger.params, res, next);
};

module.exports.edit_role_permissions = function edit_role_permissions (req, res, next) {
  Role.edit_role_permissions(req.swagger.params, res, next);
};

module.exports.edit_role_users = function edit_role_users (req, res, next) {
  Role.edit_role_users(req.swagger.params, res, next);
};

module.exports.get_all_roles = function get_all_roles (req, res, next) {
  Role.get_all_roles(req.swagger.params, res, next);
};

module.exports.get_role = function get_role (req, res, next) {
  Role.get_role(req.swagger.params, res, next);
};

module.exports.get_role_groups = function get_role_groups (req, res, next) {
  Role.get_role_groups(req.swagger.params, res, next);
};

module.exports.get_role_permissions = function get_role_permissions (req, res, next) {
  Role.get_role_permissions(req.swagger.params, res, next);
};

module.exports.get_role_users = function get_role_users (req, res, next) {
  Role.get_role_users(req.swagger.params, res, next);
};
