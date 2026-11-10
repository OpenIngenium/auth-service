'use strict';
var util = require('util');
var models = require('../../server/models/index.js');
var Promise = require('bluebird');
var _ = require('lodash');
const node_funcs = require('../../node_funcs.js');

const log = node_funcs.log;


exports.get_all_users = function(args, res, next) {
  
  /**
   * Get all users
   *
   * returns users
   **/

  let total_count = 0;
  
  // create query paramaters based on request parameters
  var queryParams = {
    attributes: ["id", "username", "display_name", "login_expire", "createdAt", "updatedAt"]
  }
  if (!_.isUndefined(args.limit.value)) {
    queryParams.limit = args.limit.value;
  }
  if (!_.isUndefined(args.q.value)) {
    queryParams.where = {};
    queryParams.where.username = {$like: (args.q.value) + '%'}
  }
  if (!_.isUndefined(args.offset.value)) {
    queryParams.offset = args.offset.value;
  }

  if (args.order.value === 'DESC') {
    queryParams.order = 'username DESC';
  } else if (args.order.value === 'ASC') {
    queryParams.order = 'username ASC';
  }

  // NEW V2 
  var avoid = false;
  if (!_.isUndefined(args.loggedin.value)) {
    log.trace("LOGGEDIN query parameter specified.");
    if(args.loggedin.value == "Yes"){
      queryParams.where = {};
      queryParams.where.login_expire = { gte: Date.now() }
    }else{
      queryParams.where = {};
      queryParams.where.login_expire = { lt: Date.now() }
    }
  }

  if (!_.isUndefined(args.rolefilter.value)) {
    avoid = true;
    log.trace("ROLEFILTER query parameter specified.");
    
    //search for roles equal to query
    models.Role.findAndCountAll({
      where: {
        name: { $like: args.rolefilter.value+'%' }
      }
    })
    .then(function(roles) {
      return Promise.map(roles.rows, function(role) {
        return role.getUsers({
          attributes: ["id", "username", "login_expire", "display_name", "createdAt", "updatedAt"],
        });
      });
    }).then(function(userLists) {
      var users = _.flatten(userLists);
      users = _.uniqBy(users, 'id');

      total_count = users.length;

      // order by
      if (args.order.value === 'DESC'){
        users = _.orderBy(users, ['username'], ['desc']);
      } else{
        users = _.orderBy(users, ['username'], ['asc']);
      }

      //offset
      if (!_.isUndefined(args.offset.value)) {
        users = _.drop(users, args.offset.value);
      }

      // limit
      if (!_.isUndefined(args.limit.value)) {
        users = _.take(users, args.limit.value);
      }

      return Promise.map(users, function(user){
        return get_user_full(user);
      });
    }).then(function(users){
      res.status(200).json({"total": total_count, "results": users});
    });
  }
  // It is assumed that all roles including those from groups are added upon login.
  if (!_.isUndefined(args.scopefilter.value)) {
    avoid = true;
    log.trace("SCOPEFILTER query parameter specified.");
    //find all users with specified scope/permission

    //fetch all permissions matching query
    models.Permission.findAll({
      where: { 
        name: { $like: args.scopefilter.value+'%' }
      }
    })
    .then(function(permissions){
      var user_ids = [];
      //fetch all roles with matching permissions
      return Promise.map(permissions, function(permission){
        return permission.getUsers()
        .then(function(users){
          return Promise.map(users, function(user){
            user_ids.push(user.id);
          });
        })
      })
      .then(function(){
        //convert the user_ids back into users
        models.User.findAndCountAll({
          where: {
            id: {$in: user_ids}
          },
          attributes: ["id", "username", "login_expire", "display_name", "createdAt", "updatedAt"]
        })
        .then(function(users) {
          total_count = users.count;
          return Promise.map(users.rows, function(user){
            return get_user_full(user);
          });
        })
        .then(function(users){
          // order by
          if(args.order.value === 'DESC'){
            users = _.orderBy(users, ['username'], ['desc']);
          }else{
            users = _.orderBy(users, ['username'], ['asc']);
          }

          //offset
          if (!_.isUndefined(args.offset.value)) {
            users = _.drop(users, args.offset.value);
          }

          // limit
          if (!_.isUndefined(args.limit.value)) {
            users = _.take(users, args.limit.value);
          }
          
          res.status(200).json({"total": total_count, "results": users});
        }).catch(function(err) {
          let msg = "get_all_users couldn't perform action, User.findAndCountAll issue.";
          log.critical(msg, util.inspect(err));
          res.status(500).json({message: msg});
        });
      })
    })
  }
  
  if (!_.isUndefined(args.groupfilter.value)) {
    avoid = true;
    log.trace("GROUPFILTER query parameter specified.");
    //search for users belonging to a specified group
    var user_ids = [];
    if(typeof args.groupfilter.value === 'string' || args.groupfilter.value instanceof String){
      models.Group.findAll({
        where: { 
          name: { $like: args.groupfilter.value+'%' }
        }
      })
      .then(function(groups){
        //go through each group, get their users, and push to user_ids
        return Promise.map(groups, function (group) {
          return group.getUsers()
          .then(function(users){
            return Promise.map(users, function(user){
              user_ids.push(user.id);
            });
          })
        })
        .then(function(){
          //remove duplicates
          user_ids = _.uniq(user_ids);

          //convert user_ids back into users
          models.User.findAndCountAll({
            where: {
              id: {$in: user_ids}
            },
            attributes: ["id", "username", "login_expire", "display_name", "createdAt", "updatedAt"]
          })
          .then(function(users){
            total_count = users.count;
            return Promise.map(users.rows, function(user){
              return get_user_full(user);
            });
          })
          .then(function(users){
            // order by
            if(args.order.value === 'DESC'){
              users = _.orderBy(users, ['username'], ['desc']);
            }else{
              users = _.orderBy(users, ['username'], ['asc']);
            }

            //offset
            if (!_.isUndefined(args.offset.value)) {
              users = _.drop(users, args.offset.value);
            }

            // limit
            if (!_.isUndefined(args.limit.value)) {
              users = _.take(users, args.limit.value);
            }
            res.status(200).json({"total": total_count, "results": users});
          });
        });
      });
    }else{
      res.status(500).json({message: "Improper format for input."});
    }
  }

  if(!avoid){
    models.User.findAndCountAll(queryParams)
    .then(function(users){
      total_count = users.count;
      return Promise.map(users.rows, function(user){
        return get_user_full(user);
      });
    })
    .then(function(users){
      res.status(200).json({"total": total_count, "results": users});
    }).catch(function(err) {
      let msg = "get_all_users couldn't perform action, User.findAndCountAll issue.";
      log.critical(msg, util.inspect(err));
      res.status(500).json({message: msg});
    });
  } 
}

exports.get_user = function(args, res, next) {
  /**
   * Get user
   *
   * id String the id of the user
   * returns user
   **/
  models.User.findById(args.user_id.value).then(function(user) {
    if (user) {
      get_user_full(user)
      .then(function(user){
        res.status(200).json(user);
      })
    } else{
      let msg = `User not found. User Id: ${args.user_id.value}`;
      log.debug(msg);
      res.status(404).json({message: msg});
    }
  }).catch(function(err) {
    let msg = "get_user couldn't perform action, User.findById issue.";
    log.critical(msg);
    res.status(500).json({message: msg});
  })
}

function get_user_full(user){
  return new Promise(function(resolve, reject){
    if(user){
      Promise.join(
        get_logged_in(user),
        get_scopes(user),
        get_roles(user),
        get_groups(user),
        function(logged_in, scopes, roles, groups){
          user = user.toJSON();

          user.loggedin = logged_in;
          user.scopes = scopes.map(scope => {
            return scope.name;
          });
          user.roles = roles.map(role => {
            return role.name;
          });
          user.groups = groups.map(group => {
            return group.name;
          })
          delete user.RoleUser;
          delete user.login_expire;
          
          resolve(user);
        }
      );
    }else{
      reject("No user");
    }
  });
}

function get_logged_in(user){
  return new Promise(function(resolve, reject){
    //check if current time is less than or greater than Date.now()
    if(Date.now() < user.login_expire){
      resolve("Yes");
    }else{
      resolve("No");
    }
    reject();
  });
}

async function get_scopes(user){
    try{
      let roles = await user.getRoles();

      const pArray = roles.map(async role => {
        return await role.getPermissions();
      });

      const permissions = await Promise.all(pArray);

      return _.flatten(permissions);
    } catch(e){
      let msg = "Couldn't retrieve scopes from user and user's groups.";
      log.error(msg, util.inspect(e));
      return [];
    }
}

function get_roles(user){
  return new Promise(function(resolve, reject){
    user.getRoles()
    .then(function(roles){
      resolve(roles);
    })
    .catch(function(){
      reject();
    });
  });
}

function get_groups(user){
  return new Promise(function(resolve, reject){
    user.getGroups()
    .then(function(groups){
      resolve(groups);
    })
    .catch(function(){
      reject();
    });
  });
}

exports.get_user_full = get_user_full;