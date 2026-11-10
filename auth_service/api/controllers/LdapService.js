'use strict';
var util = require('util');
var _ = require('lodash');
var ldap_helper = require('./../helpers/ldap_helper.js');
const node_funcs = require('../../node_funcs.js');

const log = node_funcs.log;


exports.search_users = function(args, res, next) {
	var username = args.q.value;
	ldap_helper.search_users(username).then(function(users) {
		if (users == null) {
            res.status(404).json({message: `Couldn't find users with username: ${username}`});
		} else {
			res.status(200).json(users);
		}
	}).catch(function(err) {
        let msg = "search_users couldnt search for users";
        log.critical(msg, util.inspect(err));
        res.status(400).json({message: msg});
    })
}

exports.search_groups = function(args, res, next) {
    var groupname = args.q.value;
    ldap_helper.search_groups(groupname).then(function(groups) {
        if (groups == null) {
            res.status(404).json({message: `Couldn't find groups with groupname: ${groupname}`});
        } else {
            res.status(200).json(groups);
        }
    }).catch(function(err) {
        let msg = "search_groups couldnt search for groups";
        log.critical(msg, util.inspect(err));
        res.status(400).json({message: msg});
    })
}
