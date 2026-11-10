'use strict';

var url = require('url');

var LdapService = require('./LdapService');

module.exports.search_users = function search_users (req, res, next) {
	LdapService.search_users(req.swagger.params, res, next);
}

module.exports.search_groups = function search_groups (req, res, next) {
	LdapService.search_groups(req.swagger.params, res, next);
}