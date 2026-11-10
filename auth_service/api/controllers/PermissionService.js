'use strict';
var util = require('util');
var models = require('../../server/models/index.js');
var _ = require('lodash');
var Promise = require('bluebird');
const node_funcs = require('../../node_funcs.js');
const RoleService = require('./RoleService.js');
const UserService = require('./UserService.js');

const log = node_funcs.log;

exports.get_all_permissions = function(args, res, next) {
  /**
   * Get all permission ids and names
   *
   * returns List
   **/

  models.Permission.findAll(
    {
      attributes: ["id", "name", "for_venue_group"]
    }).then(function (all_permissions) {
      res.status(200).json(all_permissions);
    }).catch(function(err) {
      let msg = "get_all_permissions couldn't get all permissions";
      log.error(msg, util.inspect(err));
      res.status(400).json({message: msg});
    });
}

exports.get_groups_for_permission = function(args, res, next) {
  /**
   * Get a list of group ids and group names that have this permission
   *
   * id String the id of the permission
   * no response value expected for this operation
   **/
  models.Permission.findById(args.permission_id.value).then(function(permission) {
    if (permission) {
      permission.getRoles()
      .then(function(roles) {
        return Promise.map(roles, function(role) {
          return role.getGroups({
            attributes: ["id", "name"],
          });
        });
      }).then(function(groupLists) {
        var groups = _.flatten(groupLists);
        groups = _.uniqBy(groups, 'id');

        return Promise.map(groups, function(group){
          return RoleService.get_scopes_and_roles(group);
        })
      })
      .then(function(groups){
        res.status(200).json(groups);
      }).catch(function(err) {
          let msg = "get_groups_for_permission couldn't get all groups associated with specified permission";
          log.error(msg, util.inspect(err));
          res.status(400).json({message: msg});
      });
    } else {
      let msg = `Permission not found with ID: ${args.permission_id.value}`;
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  });
}

exports.get_permission = function(args, res, next) {
  /**
   * Retrieve an existing permission
   *
   * id String the id of the permission
   * returns permission
   **/
  models.Permission.findById(args.permission_id.value).then(function(permission) {
    if (permission) {
      res.status(200).json(permission);
    } else {
      let msg = 'Permission was not found';
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  }).catch(function(err) {
      let msg = "get_permission couldnt get specified permission.";
      log.error(msg, util.inspect(err));
      res.status(400).json({message: msg});
  });
}

exports.get_users_for_permission = function(args, res, next) {
  /**
   * Get a list of userids and user names that have this permission
   *
   * id String the id of the permission
   * no response value expected for this operation
   **/
  models.Permission.findById(args.permission_id.value).then(function(permission) {
    if (permission) {
      permission.getRoles()
      .then(function(roles) {
        return Promise.map(roles, function(role) {
          return role.getUsers({
            attributes: ["id", "username", "login_expire", "display_name", "createdAt", "updatedAt"],
          });
        });
      }).then(function(userLists) {
        var users = _.flatten(userLists);
        users = _.uniqBy(users, 'id');

        return Promise.map(users, function(user){
          return UserService.get_user_full(user);
        })
      }).then(function(users){
        res.status(200).json(users);
      }).catch(function(err) {
        let msg = "get_users_for_permission couldnt find users for specified permission";
        log.error(msg, util.inspect(err));
        res.status(400).json({message: msg});
      });
    } else {
        let msg = `Permission not found with ID: ${args.permission_id.value}`;
        log.debug(msg);
        res.status(404).json({message: msg});
    }
  });
}



