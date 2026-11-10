'use strict';

var url = require('url');

var Group = require('./GroupService');

module.exports.get_all_groups = function get_all_groups (req, res, next) {
  Group.get_all_groups(req.swagger.params, res, next);
};

module.exports.get_group = function get_group (req, res, next) {
  Group.get_group(req.swagger.params, res, next);
};

module.exports.delete_group = function delete_group (req, res, next) {
  Group.delete_group(req.swagger.params, res, next);
};
