'use strict';
var models = require('../../server/models/index.js');
var _ = require('lodash');
var login_helper = require('../helpers/login_helper.js');
var ldap_helper = require('../helpers/ldap_helper.js');
var Promise = require('bluebird');
var Sequelize = require('sequelize');
var util = require('util');
const env_config = require('../../env_config.js');
const node_funcs = require('../../node_funcs.js');
const UserService = require('./UserService.js');

const log = node_funcs.log;

exports.add_role_group = function(args, res, next) {
  /**
   * add a group with the name of group_name to the specified role
   * - if group already in system, add it to the role
   * - if not, validate group exists in LDAP
   * - if in LDAP, create a group and add it to the role
   *
   * role_id String the id of the role
   * group_name String the name of the group you wish to add to this role
   * returns String
   **/
  models.Role.findById(args.role_id.value)
  .then(function(role) {
    if (role) {
      var groupname = _.trim(_.toLower(args.group_name.value));

      ldap_helper.validate_ldap_group_exists(groupname)
      .then(function(valid) {
        if (valid == true) {
          models.Group.findOrCreate({
            where: {name: groupname}
          })
          .spread(function(group, created) {
            role.addGroup(group)
            .then(function() {
              res.status(204).json();
            }).catch(function(err) {
              let msg = "add_role_group couldn't add group successfully";
              log.error(msg, util.inspect(err));
              res.status(400).json({message: msg});
            })
          }).catch(function(err) {
              let msg = "add_role_group couldn't perform operation, spread function issue.";
              log.error(msg, util.inspect(err));
              res.status(400).json({message: msg});
          })
        } else {
          let msg = "Group does not exist with specified value.";
          log.debug(msg);
          res.status(404).json({message: msg});
        }
      }).catch(function(err) {
          let msg = "add_role_group couldn't perform its operation, validate_ldap_group_exists had problems.";
          log.critical(msg);
          res.status(400).json({message: msg});
      })
    } else {
      let msg = "Role does not exist";
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  }).catch(function(err) {
      let msg = "add_role_group could not perform its operation, findById failed";
      log.critical(msg, util.inspect(err));
      res.status(400).json({message: msg});
  })
}

exports.add_role_user = function(args, res, next) {
  /**
   * add a user to the role
   *
   * role_id String the id of the role
   * user_id String the id of the user to be added to the role
   * returns user
   **/
    models.Role.findById(args.role_id.value).then(function(role) {
      if (role) {
        var username = _.trim(_.toLower(args.username.value));

        ldap_helper.validate_user_exists(username)
        .then(function(valid) {
          if (valid == true) {
            models.User.findOrCreate({
              where: { username: username}
            })
            .spread(function(user, created) {
              role.addUser(user)
              .then(function() {
                res.status(204).json();
              }).catch(function(err) {
                let msg = "add_role_user could not perform its operation, addUser issues";
                log.critical(msg, util.inspect(err));
                res.status(500).json({message: msg});
              })
            }).catch(function(err) {
              let msg = "add_role_user could not perform its intended operation, spread function issues";
              log.critical(msg, util.inspect(err));
              res.status(500).json({message: msg});
            })
          } else {
            let msg = `User does not exist. username: ${username}`;
            log.debug(msg);
            res.status(404).json({message: msg});
          }
        }).catch(function(err) {
            let msg = "add_role_user could not perform its intended operation, findOrCreate issues";
            log.critical(msg);
            res.status(500).json({message: msg});
        })
      } else {
        let msg = `Role not found for username: ${username}`;
        log.debug(msg);
        res.status(404).json({message: msg});
      }
    }).catch(function(err) {
        let msg = "add_role_user could not perform its intended operation, validate_user_exists issues";
        log.critical(msg);
        res.status(500).json({message: msg})
    })
}

exports.create_role = function(args, res, next) {
    var desired_users = _.isUndefined(args.data.value.users) ? [] : args.data.value.users;
    var desired_groups = _.isUndefined(args.data.value.groups) ? [] : args.data.value.groups;
    var desired_perms = _.isUndefined(args.data.value.permissions) ? [] : args.data.value.permissions;

    validate_users_and_groups(desired_users, desired_groups).
    then(result => {
        if (result.valid == true) {
          if(args.data.value.name){
            Promise.join(
                login_helper.ensure_users(result.usernames), // swanchr
                login_helper.ensure_groups(result.groupnames), // ingenium-dev
                get_permissions(desired_perms), // 4
                make_role(args.data.value.name, args.data.value.description, args.data.value.venue_group_id), // ROLE_ANOTHER, This is a test role
                (users, groups, permissions, role) => {
                    // if arg permissions.length > 0 and permissions not defined  => could not set permissions
                    // if args permissions.length >0 and permissions.length != args permissions length => one or more permissions do not exist
                    if (desired_perms.length > 0 && !permissions) {
                        let msg = "create_role: Couldn't set permissions";
                        log.critical(msg);
                        res.status(500).json({message: msg});
                    } else if (desired_perms.length > 0 && (permissions.length != desired_perms.length)) {
                        var permids = _.map(permissions, function(perm) { return perm.id});
                        var invalid_perms = _.difference(desired_perms, permids);

                        let msg = "One or more permissions not found: " + _.join(invalid_perms, ", ");
                        log.debug(msg);
                        res.status(400).json({message: msg});
                    } else {
                        Promise.join(
                            role.setUsers(users),
                            role.setPermissions(permissions),
                            role.setGroups(groups),
                            () => {
                                res.status(201).json({name: role.name, description: role.description, id: role.id});
                            }
                        ).catch(function(err) {
                            let msg = "create_role couldn't perform action";
                            log.critical(msg, util.inspect(err));
                            res.status(500).json({message: msg});
                        });
                    }
                }).catch(Sequelize.ValidationError, function(err) {
                    let msg = "Sequelize had an error";
                    log.debug(msg, util.inspect(err));
                    res.status(400).json({message: msg});
                }).catch(function(err) {
                    let msg = "create_role couldn't perform action";
                    log.critical(msg, util.inspect(err));
                    res.status(500).json({message: msg});
                });
          } else {
              let msg = "Role name was not provided.";
              log.debug(msg);
              res.status(400).json({message: msg});
          }
        } else {
            let msg = "result is invalid";
            log.debug(msg, util.inspect(result.problems));
            res.status(400).json({message: 'result is invalid'});
        }
    }).catch(function(err) {
        let msg = `Error when creating a role: ${util.inspect(err)}`;
        log.error(msg);
        res.status(500).json({message: msg})
    })
}

exports.delete_role = function(args, res, next) {
  /**
   * Delete an existing role
   *
   * id String the id of the role
   *
   **/
    models.Role.findById(args.role_id.value).then(function(role) {
      if (role) {
        role.destroy().then(function(){
            res.status(204).json();
        }).catch(function(err) {
          let msg = "delete_role couldn't perform action, destroy method issue";
          log.critical(msg);
          res.status(500).json({messsage: msg});
        })
      } else {
        let msg = `Role couldn't be found. Role ID: ${args.role_id.value}`;
        log.debug(msg);
        res.status(404).json({message: msg});
      }
    }).catch(function(err) {
        let msg = "delete_role couldn't perform action, findById issue.";
        log.critical(msg)
        res.status(500).json({message: msg});
    })
}

exports.delete_role_group = function(args, res, next) {
  /**
   * delete a group from the specified role
   *
   * id String the id of the role
   * group_id String the id of the group you wish to add to this role
   * returns String
   **/
    models.Role.findById(args.role_id.value).then(function(role) {
      if (role) {
        models.Group
        //.findById(args.group_id.value)
        .findOne({ 
          where: {id: args.group_id.value}
        })
        .then(function(group) {
          if (group) {
            role.removeGroup(group).then(function(){
              let msg = `Group was successfully deleted from the role. group: ${group} role: ${role}`; 
              log.info(msg);
              res.status(204).json();
            })
          } else {
            let msg = `Group was not found. Group Name: ${args.group_name.value}`;
            log.info(msg);
            res.status(404).json({message: msg});
          }
        }).catch(function(err) {
            let msg = "delete_role_group couldn't perform action, findOne issue.";
            log.critical(msg);
            res.status(404).json({message: msg});
        })
      } else {
        let msg = `Role could not be found. Role ID: ${args.role_id.value}`;
        log.debug(msg);
        res.status(404).json({message: msg})
      }
    }).catch(function(err) {
        let msg = "delete_role_group couldn't perform action, findById issue.";
        log.critical(msg);
        res.status(500).json({message: msg});
    })
}

exports.delete_role_permission = function(args, res, next) {
  /**
   * delete a single permission from a role
   *
   * id String the id of the role
   * permission_id String id of the permission
   * no response value expected for this operation
   **/
  models.Role.findById(args.role_id.value).then(function(role) {
    if (role) {
      models.Permission.findById(args.permission_id.value)
      .then(function(permission) {
        if (permission) {
          role.removePermission(permission).then(function() {
            let msg = `Permission was deleted from role. Role: ${role} Permission: ${permission}`; 
            log.info(msg);
            res.status(204).json();
          })
        } else {
          let msg = `Permission could not be found, Permission ID: ${args.permission_id.value}`;
          log.debug(msg);
          res.status(404).json({message: msg});
        }
      }).catch(function(err) {
        let msg = "delete_role_permission couldn't perform action, findById issue.";
        log.critical(msg);
        res.status(500).json({message: msg});
      });
    } else {
      let msg = `Role could not be found. Role ID: ${args.role_id.value}`;
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  }).catch(function(err) {
      let msg = "delete_role_permission couldn't perform action, findById issue.";
      log.critical(msg);
      res.status(500).json({message: msg});
  })
}

exports.delete_role_user = function(args, res, next) {
  /**
   * delete a user from the role
   *
   * id String the id of the role
   * user_id String the id of the user to be deleted from the role
   * returns user
   **/
  models.Role.findById(args.role_id.value)
  .then(function(role) {
    if (role) {
      models.User.findOne({
          where: {id: args.user_id.value}
      })
      .then(function(user) {
        if (user) {
          role.removeUser(user).then(function() {
            let msg = `Successfully deleted user from a role. User: ${user} Role: ${role}`; 
            log.info(msg);
            res.status(204).json();
          });
        } else {
          let msg = `User couldn't be found, User username: ${args.username.value}`;
          log.debug(msg);
          res.status(404).json({message: msg});
        }
      }).catch(function(err) {
          let msg = "delete_role_user couldn't perform specified action, User.findOne issue.";
          log.critical(msg);
          res.status(404).json({message: msg});
      })
    } else {
      let msg = `Role couldn't be found, Role ID: ${args.role_id.value}`
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  }).catch(function(err) {
      let msg = "delete_role_user couldn't perform specified action, Role.findById issue.";
      log.critical(msg);
      res.status(404).json({message: msg});
  })
}

exports.edit_role = function(args, res, next) {
    var desired_users = _.isUndefined(args.data.value.users) ? [] : args.data.value.users;
    var desired_groups = _.isUndefined(args.data.value.groups) ? [] : args.data.value.groups;
    var desired_perms = _.isUndefined(args.data.value.permissions) ? [] : args.data.value.permissions;

    validate_users_and_groups(desired_users, desired_groups).
    then(function(result){
        if (result.valid == true) {
            Promise.join(
                models.Role.findById(args.role_id.value),
                login_helper.ensure_users(result.usernames),
                login_helper.ensure_groups(result.groupnames),
                get_permissions(desired_perms),
                function(role, users, groups, permissions) {
                    if (!role) {
                      let msg = "Role couldn't be found.";
                      log.debug(msg);
                      res.status(404).json({ message: msg});
                    } else {
                      if (desired_perms.length > 0 && !permissions) {
                          let msg = "edit_role couldn't perform specified action, no permissions or desired permissions amount is less than 0";
                          log.critical(msg);
                          res.status(500).json({message: msg});
                      } else if (desired_perms.length > 0 && (permissions.length != desired_perms.length)) {
                          var permids = _.map(permissions, function(perm) { return perm.id});
                          var invalid_perms = _.difference(desired_perms, permids);
                          let msg = "One or more permissions not found: " + _.join(invalid_perms, ", ");
                          log.debug(msg);
                          res.status(400).json({message: msg});
                      } else {
                          Promise.join(
                              role.updateAttributes({
                                  name: args.data.value.name,
                                  description: args.data.value.description,
                                  venue_group_id: args.data.value.venue_group_id,
                              }),
                              role.setUsers(users),
                              role.setPermissions(permissions),
                              role.setGroups(groups),
                              function() {
                                  var usersP = _.map(users, function(user){
                                    return { "id": user.id, "username": user.username };
                                  });
                                  var groupsP = _.map(groups, function(group){
                                    return group.name;
                                  });
                                  var permissionP = _.map(permissions, function(permission){
                                    return permission.id;
                                  });
                                  var return_role = {
                                    id: role.id,
                                    name: role.name,
                                    description: role.description,
                                    users: usersP,// users: users,
                                    groups: groupsP,// groups: groups,
                                    permissions: permissionP// permissions: permissions
                                  };
                                  res.status(200).json(return_role);
                              }
                          ).catch(Sequelize.ValidationError, function(err) {
                            let msg = `Sequelize had a validation error. ${util.inspect(err.errors)}`;
                            log.debug(msg);
                            res.status(400).json({message: msg});
                          }).catch(function(err) {
                              let msg = "edit_role couldn't perform specified action";
                              log.critical(msg);
                              res.status(500).json({message: msg});
                          })
                      }
                    }
                }
            ).catch(Sequelize.ValidationError, function(err) {
                let msg = `Sequelize had a validation error. ${util.inspect(err.errors)}`;
                log.debug(msg);
                res.status(400).json({message: msg});
            }).catch(function(err) {
                let msg = "edit_role couldn't perform specified action";
                log.critical(msg);
                res.status(500).json({message: msg});
            })
        } else {
            let msg = `Error when updating role: ${util.inspect(result.problems)}`;
            log.error(msg);
            res.status(400).json({message: msg});
        }
    }).catch(function(err) {
        let msg = `Error when updating a role: ${util.inspect(err)}`;
        log.error(msg);
        res.status(400).json({message: msg})
    })
}

exports.edit_role_groups = function(args, res, next) {
    models.Role.findById(args.role_id.value).then(function(role) {
      if (role) {
        var desired_groups = args.data.value;

        ldap_helper.validate_ldap_groups_exist(desired_groups)
        .then(function(valid_groups) {
          if (valid_groups.length == desired_groups.length) {
            return Promise.map(valid_groups, function(group) {
              return models.Group.findOrCreate({
                where: {name: group}
              })
            }).then(function(response) {
                var newGroups = _.map(response, function(responseArr) {
                    return _.head(responseArr);
                })
                role.setGroups(newGroups)
                .then(function() {
                    return role.getGroups();
                }).then(function(associatedGroups) {
                    return Promise.map(associatedGroups, function(group){
                        return get_scopes_and_roles(group);
                    })
                }).then(function(resGroups){
                    res.status(200).json(resGroups);
                })
                .catch(function(err) {
                    let msg = "edit_role_groups couldn't perform specified action, role.setGroups issue.";
                    log.critical(msg);
                    res.status(500).json({message: msg});
                });
            }).catch(function(err) {
                let msg = "edit_role_groups couldn't perform specified action, Promise.map issue.";
                log.critical(msg);
                res.status(500).json({message: msg});
            });
          } else {
            let msg = "One or more groups invalid: " + _.join(invalid_groups, ',');
            log.debug(msg);
            res.status(404).json({message: msg});
          }
        }).catch(function(err) {
            let msg = "edit_role_groups couldn't perform specified action, alidate_ldap_groups_exist issue.";
            log.critical(msg);
            res.status(404).json({message: msg});
        })
      } else {
        let msg = `Role not found. Role Id: ${args.role_id.value}`;
        log.debug(msg);
        res.status(404).json({message: msg});
      }
    }).catch(function(err) {
        let msg = `edit_role_groups couldn't perform specified action, Role.findById issue. ${util.inspect(err)}`;
        log.critical(msg);
        res.status(404).json({message: msg});
    })
}

exports.edit_role_users = function(args, res, next) {
    /**
     * edit the list of users for this role
     *
     * id String the id of the role
     * user_ids List the list of desired user names for this role
     * returns List
     **/
    models.Role.findById(args.role_id.value).then(function(role) {
      if (role) {
        var desired_users = args.data.value;

        ldap_helper.validate_users_exist(desired_users)
        .then(function(valid_users) {
            if (valid_users.length == desired_users.length) {
                return Promise.map(valid_users, function (user) {
                    return models.User.findOrCreate({
                        where: {username: user}
                    })
                }).then(function (response) {
                    var newUsers = _.map(response, function (responseArr) {
                        return _.head(responseArr);
                    });
                    role.setUsers(newUsers)
                        .then(function () {
                            return role.getUsers();
                        }).then(function (associatedUsers) {
                            return Promise.map(associatedUsers, function(user){
                                return UserService.get_user_full(user);
                            });
                        }).then(function(users){
                            res.status(200).json(users);
                        }).catch(function (err) {
                            let msg = "edit_role_users couldn't perform action, role.setUsers issue.";
                            log.critical(msg);
                            res.status(500).json({message: msg});
                    });
                }).catch(function (err) {
                    let msg = "edit_role_users couldn't perform action, romise.map issue.";
                    log.critical(msg);
                    res.status(500).json({message: msg});
                });
            } else {
                var invalid_users = _.difference(desired_users, valid_users);
                let msg = "One or more users not found: " + _.join(invalid_users, ',');
                log.debug(msg);
                res.status(404).json({
                    message: msg
                });
            }
        }).catch(function(err) {
            let msg = "edit_role_users couldn't perform action, validate_users_exist issue.";
            log.critical(msg);
            res.status(500).json({message: msg});
        })
      } else {
        let msg = `Role couldn't be found. Role Id: ${args.role_id.value}`;
        log.debug(msg);
        res.status(404).json({message: msg});
      }
    }).catch(function(err) {
        let msg = "edit_role_users couldn't perform action, Role.findById issue.";
        log.critical(msg);
        res.status(500).json({message: msg});
    })
  }


  exports.edit_role_permissions = function(args, res, next) {
    /**
   * Edit permissions for an existing role
   *
   * id String the id of the role
   * permission_ids List The ids of desired permissions for this role
   * returns List
   **/
  Promise.join(
    models.Role.findById(args.role_id.value),
    models.Permission.findAll({
      where: {
        id: args.data.value,
      }
    }), function(role, permissions) {
      if (!role || (permissions.length != args.data.value.length)) {
        if (!role) {
          let msg = `Role not found. Role Id: ${args.role_id.value}`;
          log.debug(msg);
          res.status(404).json({message: msg});
        } else {
          let msg = `One or more permissions not found, Permission Ids: ${args.data.value}`;
          log.debug(msg);
          res.status(404).json({message: msg});
        }
      } else {
        role.setPermissions(permissions).then(function(){
          role.getPermissions().then(function(associatedPerms) {
            var resPermissions = associatedPerms.map(function(perm) {
              return _.pick(perm, ['id', 'name']);
            });
            res.status(200).json(resPermissions);

          }).catch(function(err) {
            let msg = "edit_role_permissions couldn't perform specified action, role.getPermissions issue.";
            log.critical(msg);
            res.status(500).json({message: msg});
          })
        });
      }
    }).catch(function(err) {
      let msg = "edit_role_permissions couldn't perform specified action, Permission.findAll issue.";
      log.critical(msg);
      res.status(500).json({message: msg});
  })
}

exports.get_all_roles = function(args, res, next) {
  /**
   * Get all roles
   *
   * returns List
   **/
  var queryParams = {
    attributes: ["id", "name", "description", "venue_group_id"]
  }
  queryParams.where = {};
  if (!_.isUndefined(args.name.value)) {
    queryParams.where.name = {$like: (args.name.value) + '%'}
  }

  if (!_.isUndefined(args.venue_group_id.value)) {
    queryParams.where.venue_group_id = args.venue_group_id.value
  }

  if (!_.isUndefined(args.offset.value)) {
    queryParams.offset = args.offset.value;
  }
  
  if (!_.isUndefined(args.limit.value)) {
    queryParams.limit = args.limit.value;
  }

  if (args.order.value === 'DESC') {
    queryParams.order = 'name DESC';
  } else if (args.order.value === 'ASC') {
    queryParams.order = 'name ASC';
  }

  models.Role.findAndCountAll(queryParams)
  .then(function(roles) {
    res.status(200).json({total: roles.count, results: roles.rows});
  }).catch(function(err) {
    let msg = "get_all_roles couldn't perform action, Role.findAndCountAll issue.";
    log.critical(msg);
    res.status(500).json({message: msg});
  });
}

exports.get_role = function(args, res, next) {
    models.Role.findById(args.role_id.value).
    then(function(role) {
        if (role) {
            Promise.join(
                role.getUsers(),
                role.getPermissions(),
                role.getGroups(),
                function(users, permissions, groups) {
                    var resUsers = _.map(users, function(user) {
                        return _.pick(user, ['id','username']);
                    });
                    var resGroups = _.map(groups, function(group) {
                        return group.name;
                    });
                    var resPerms = _.map(permissions, function(perm) {
                        return perm.id;
                    });
                    var return_role = {
                      id: role.id,
                      venue_group_id: role.venue_group_id,
                      name: role.name,
                      description: role.description,
                      users: resUsers,
                      groups: resGroups,
                      permissions: resPerms
                    };
                    res.status(200).json(return_role);
                }
            ).catch(function(err) {
                let msg = "get_role couldn't perform action, Promise.join issue.";
                log.critical(msg);
                res.status(500).json({message: msg});
            })
        } else {
            let msg = `Role not found. Role Id: ${args.role_id.value}`;
            log.debug(msg);
            res.status(400).json({message: msg});
        }
    }).catch(function(err) {
        let msg = `get_role couldn't perform action, Role.findById issue. ${util.inspect(err)}`;
        log.critical(msg);
        res.status(400).json({message: msg});
    });
}

exports.get_role_groups = function(args, res, next) {
  /**
   * retrive a list of groupnames that have this role
   *
   * id String the id of the role
   * returns List
   **/
  models.Role.findById(args.role_id.value).then(function(role){
    if (role) {
      role.getGroups().then(function(groups) {
        return Promise.map(groups, function(group){
            return get_scopes_and_roles(group);
        })
        .then(function(resGroups){
            res.status(200).json(resGroups);
          }).catch(function(err) {
            let msg = `get_role_groups couldn't perform requested action, role.getGroups issue. ${util.inspect(err)}`;
            log.critical(msg);
            res.status(500).json({message: msg});
          });
      });
    } else {
      let msg = `Role not found. Role Id: ${args.role_id.value}`;
      log.debug(msg);
      res.status(404).json({message: msg})
    }
  });
}

exports.get_role_permissions = function(args, res, next) {
  /**
   * retrieve all permissions for an existing role
   *
   * id String the id of the role
   * returns List
   **/
  models.Role.findById(args.role_id.value).then(function(role) {
    if (role) {
      role.getPermissions()
      .then(function(permissions) {
        var resPermissions = permissions.map(function(permission) {
          return _.pick(permission, ['id', 'name']);
        });
        res.status(200).json(resPermissions);
      }).catch(function(err) {
        let msg = "get_role_permissions couldn't perform action, role.getPermissions issue";
        log.critical(msg);
        res.status(404).json({message: msg});
      });
    } else {
      let msg = `Role couldn't be found, Role Id: ${args.role_id.value}`;
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  }).catch(function(err) {
      let msg = `Role doesn't exist. Role Id: ${args.role_id.value}`;
      log.critical(msg);
      res.status(404).json({message: msg});
  })
}

exports.get_role_users = function(args, res, next) {
  /**
   * retrieve a list of userids and usernames for the users that are in this role
   *
   * id String the id of the role
   * returns users
   **/
  models.Role.findById(args.role_id.value)
  .then(function(role) {
    if (role) {
      role.getUsers()
      .then(function(users) {
        return Promise.map(users, function(user){
            return UserService.get_user_full(user);
        })
      })
      .then(function(users){
        res.status(200).json(users);
      }).catch(function(err) {
        let msg = "get_users_for_role couldn't perform action, role.getUsers issue.";
        log.critical(msg);
        res.status(500).json({message: msg});
      })
    } else {
      let msg = `Role couldn't be found. Role ID: ${args.role_id.value}`;
      log.debug(msg);
      res.status(404).json({message: msg})
    }
  }).catch(function(err) {
      let msg = "get_users_for_role couldn't perform action, Role.findById issue.";
      log.critical(msg);
      res.status(500).json({message: msg});
  })
}

function validate_users_and_groups(orig_usernames, orig_groupnames) {
    let test_user_included = false;
    return new Promise(function(resolve, reject) {
        var valid = false;
        var problems = [];

        var usernames = [];
        _.each(orig_usernames, function(username) {
            if (username.length) {
              let username_trimmed = _.trim(_.toLower(username));
              if (username_trimmed === env_config.test_user) {
                test_user_included = true;
              } else {
                usernames.push(username_trimmed);
              }
            }
        });

        var groupnames = [];
        _.each(orig_groupnames, function(groupname) {
            if (groupname.length) {
              groupnames.push(_.trim(_.toLower(groupname)));
            }
        });

        ldap_helper.validate_users_exist(usernames).
        then(function(valid_usernames) {
            if (usernames.length != valid_usernames.length) {
                valid =  false;
                var invalid_usernames = _.difference(usernames, valid_usernames);

                let msg = "invalid usernames: " + _.join(invalid_usernames, ", "); 
                problems.push(msg);
                resolve({valid: false, problems: problems});
            } else {
                ldap_helper.validate_ldap_groups_exist(groupnames).
                then(function (valid_groupnames) {
                    if (groupnames.length != valid_groupnames.length) {
                        var invalid_groups = _.difference(groupnames, valid_groupnames);
                        valid= false;
                        let msg = "invalid group names: " + _.join(invalid_groups, ", ");
                        problems.push(msg);
                        return;
                    } else {
                        valid = true;
                        return valid_groupnames;
                    }
                }).then(function (valid_groupnames) {
                    // add back test user account if needed
                    if (test_user_included) {
                      valid_usernames.push(env_config.test_user);
                      console.log(`validate_users_and_groups with test account. valid_usernames: ${valid_usernames}`);
                    }
                    if (valid == true) {
                        resolve({valid: true, usernames: valid_usernames, groupnames: valid_groupnames});
                    } else {
                        resolve({valid: false, problems: problems});
                    }
                })
            }
        })
    })
}

function make_role(name, description, venue_group_id) {
    return models.Role.create({
        name: name,
        description: description,
        venue_group_id: venue_group_id,
    })
}

function get_permissions(permArr) {
    return models.Permission.findAll({
        where: {
            id: {$in: permArr}
        }
    })
}

function get_scopes_and_roles(group){
    return new Promise(function(resolve, reject) {
        Promise.join(
            get_scopes(group),
            get_roles(group), 
            function(scopes, roles){
                group = group.toJSON();

                //group.scopes = scopes;
                group.scopes = scopes.map(function(scope) {
                    return scope.name;
                })
                group.roles = roles.map(function(role){
                    return role.name;
                });
                delete group.RoleGroup;
                delete group.UserGroup;

                resolve(group);
            }
        ).catch(function(err){
            reject(err);
        })
    });
}

function get_scopes(group){
    return new Promise(function(resolve, reject){
        if(group){
            group.getRoles()
            .then(function(roles){
                if(roles){
                    return Promise.map(roles, function(role){
                        return role.getPermissions();
                    })
                }else{
                    reject();
                }
            })
            .then(function(permissions){
                var permissions = _.flatten(permissions);
                permissions = _.uniqBy(permissions, 'id');

                resolve(permissions);
            })
            .catch(function(){
                reject();
            });
        }else{
            reject("No groups");
        }
    });
}

function get_roles(group){
    return new Promise(function(resolve, reject){
        group.getRoles()
        .then(function(roles){
            resolve(roles);
        })
        .catch(function(){
            reject();
        })
    });
}

// make it available to other classes.
exports.get_scopes_and_roles = get_scopes_and_roles;