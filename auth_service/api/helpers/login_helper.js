'use strict';
var util = require('util');
var ldap = require('ldapjs');
var Promise = require('bluebird');
var models = require('../../server/models/index.js');
var _ = require('lodash');
var ldap_helper = require('./ldap_helper.js');
const node_funcs = require('../../node_funcs.js');

const log = node_funcs.log;

// this method appears to sync data from LDAP to the MySQL database
exports.getPermission = username => {
    return new Promise(async (resolve, reject) => {
        // 1) get the user from DB. If the user exists in DB, get permissions of the user from DB
        // 2) get groups of the user from LDAP. Find permissions of the LDAP groups from DB
        // 3) Combine the permissions from 1) and 2)

        const globalPermissions = [];

        // get the user from DB. If the user exists in DB, get permissions of the user from DB
        let user = await models.User.findOne({ 
            where: { 
                username: username
            } 
        });

        let userRoles = [];
        let userRoleInfos = [];
        let userRoleIds = [];

        // If user exists in DB, get roles of the user.
        if (user != null) {
            // grab this user's roles
            userRoles = await user.getRoles();
            userRoleInfos = userRoles.map(userRole => ({role: userRole.name, venue_group_id: userRole.venue_group_id || ''}));
            userRoleIds = userRoles.map(userRole => userRole.id);
            log.debug(`userRoleInfos: ${userRoleInfos}`);
        }
            
        // get groups of the user from LDAP.
        let ldapGroupNames = await ldap_helper.getGroupsForUser(username);
        let groups = await models.Group.findAll({
            where: {
                name:
                    { 
                        $in: ldapGroupNames
                    } 
                } 
            } 
        );
            
        // grab roles of the groups
        let groupsRoles = await Promise.all(groups.map(async group => { 
            return await group.getRoles({ attributes: ['id', 'name'] }) 
        }));
            
        const groupRoleIds = [];
        const groupRoleInfos = [];

        groupsRoles.forEach(groupRoles => {
            groupRoles.forEach(groupRole => {
                groupRoleIds.push(groupRole.id);
                groupRoleInfos.push({role: groupRole.name, venue_group_id: groupRole.venue_group_id || ''});
            });
        });

        // get unique roles of user and groups
        const roleIds = _.uniq(userRoleIds.concat(groupRoleIds));
        const distinctGlobalRoles = _.uniqBy(userRoleInfos.concat(groupRoleInfos), function(roleInfo) {
            return `${roleInfo.role}#${roleInfo.venue_group_id}`;
        });

        // convert roles back into Role object
        let rolesObjects = await models.Role.findAll({
            where: {
                id: {
                    $in: roleIds
                }
            }
        });

        for (const rolesObject of rolesObjects) {
            const rolePermissions = await rolesObject.getPermissions({attributes: ['name']});
            const venue_group_id = rolesObject.venue_group_id || '';
            for (const rolePermission of rolePermissions) {
                globalPermissions.push({scope: rolePermission.name, venue_group_id: venue_group_id || ''});
            }
        }

        // get unique permissions
        const distinctGlobalPermissions = _.uniqBy(globalPermissions, function(globalPermission) {
            return `${globalPermission.scope}#${globalPermission.venue_group_id}`;
        });

        return resolve({
            roles: distinctGlobalRoles,
            scopes: distinctGlobalPermissions
        });
    });
}

exports.ensure_user = async function (username) {
    // Try to get the user from DB
    let user = await models.User.findOne({ 
        where: { 
            username: username
        } 
    });

    // If the user logs on the first time, create the user in auth database.
    // Note that at this point, the user has already authenticated via LDAP.
    if (user === null) {
        let ldapUserInfo = await ldap_helper.get_user_info(username);
        if (ldapUserInfo) {
            const displayName = ldapUserInfo[0]['displayName'];
            log.info(`Creating a user: ${username} displayName: ${displayName}`);
            user = await models.User.create({
                username: username,
                display_name: displayName
            });
        }
    }
} 

exports.ensure_users = function (usernames) {
    return new Promise(function(resolve, reject) {
      return Promise.map(usernames, function(username) {
          return models.User.findOrCreate({
              where: {username: username}
          })
      }).then(function(response) {
          var new_users = _.map(response, function(responseArr) {
              return _.head(responseArr);
          })
          resolve(new_users);
      })
    })
}

exports.ensure_groups = function (groupnames) {
    return new Promise(function(resolve, reject) {
        return Promise.map(groupnames, function (group) {
            return models.Group.findOrCreate({
                where: {name: group}
            })
        }).then(function (response) {
            var new_groups = _.map(response, function(responseArr) {
                return _.head(responseArr);
            });
            resolve(new_groups);
        })
    })
}