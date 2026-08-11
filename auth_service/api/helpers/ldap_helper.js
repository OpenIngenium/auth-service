'use strict';
var util = require('util');
var ldap = require('ldapjs');
var app = require('./../../app.js');
var _ = require('lodash');
var Promise = require('bluebird');
var models = require('../../server/models/index.js');
const dc = 'ou=personnel,dc=dir,dc=jpl,dc=nasa,dc=gov';
const node_funcs = require('../../node_funcs.js');
const env_config = require('../../env_config.js');

const log = node_funcs.log;
const ldap_url = env_config.ldap_url;

function create_client() {
    var client = ldap.createClient({
        url: ldap_url,
        reconnect: false,
        tlsOptions: env_config.ldap_tls_options
    });
    client.on('error', function(err) {
        log.warning('LDAP connection failed.', util.inspect(err));
    });
    Promise.promisifyAll(client);
    return client;
}
exports.validate_ldap_groups_exist = function (groupnames) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        if (groupnames.length == 0) {
            resolve([]);
        } else {
            var groups = groupnames.join(')(cn=');
            var opts = {
                filter: '(&(objectclass=jplgroup)(|(cn=' + groups + ')))',
                scope: 'sub'
            }

            client.searchAsync(dc, opts).then(function (resobj) {
                var entries = [];
                resobj.on('searchEntry', function (entry) {
                    entries.push(_.toLower(entry.object.cn));
                })
                resobj.on('end', function () {
                    resolve(entries);
                    client.destroy();
                })
                resobj.on('error', function (err) {
                    log.warning("Unable to successfully validate groups.", util.inspect(err));
                    reject();
                    client.destroy();
                })
            }).catch(function (err) {
                log.warning("Unable to successfully validate groups.", util.inspect(err));
                reject();
                client.destroy();
            })
        }
    })
}

exports.validate_ldap_group_exists = function (groupname) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        var opts = {
            filter: '(&(objectclass=jplgroup)(cn=' + groupname + '))',
            scope: 'sub'
        }
        client.searchAsync(dc, opts).then(function(resobj) {
            var entries = [];
            resobj.on('searchEntry', function(entry) {
                entries.push(_.toLower(entry.object.cn));
            })
            resobj.on('end', function() {
                if (_.includes(entries, groupname)) {
                    resolve(true);
                } else {
                    resolve(false);
                }
                client.destroy();
            })
            resobj.on('error', function(err) {
                log.warning("Unable to successfully validate group.", util.inspect(err));
                reject();
                client.destroy();
            })
        }).catch(function(err) {
            log.warning("Unable to successfully validate group.", util.inspect(err));
            reject();
            client.destroy();
        })
    })
}

exports.validate_users_exist = function (users) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        if (users.length == 0) {
            resolve([]);
        } else {
            var usernames = users.join(')(uid=');
            var opts = {
                filter: '(&(objectclass=person)(|(uid=' + usernames + ')))',
                scope: 'sub'
            }

            client.searchAsync(dc, opts).then(function (resobj) {
                var entries = [];
                resobj.on('searchEntry', function (entry) {
                    entries.push(_.toLower(entry.object.uid));
                })
                resobj.on('end', function () {
                    resolve(entries);
                    client.destroy();
                })
                resobj.on('error', function (err) {
                    log.warning("Error attempting to validate users.", util.inspect(err));
                    reject();
                    client.destroy();
                })
            }).catch(function (err) {
                log.warning("Problem with client.searchAsync command.", util.inspect(err));
                reject();
                client.destroy();
            })
        }
    })
}

exports.validate_user_exists = function (username) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        var opts = {
            filter: '(&(objectclass=person)(uid=' + username + '))',
            scope: 'sub'
        }
        client.searchAsync(dc, opts).then(function(resobj) {
            var entries = [];
            resobj.on('searchEntry', function(entry) {
                entries.push(_.toLower(entry.object.uid));
            })
            resobj.on('end', function() {
                if (_.includes(entries, username)) {
                    log.trace("Successfully validate user exists.");
                    resolve(true);
                } else {
                    log.trace("Successfully determined user doesn't exist.");
                    resolve(false);
                }
                client.destroy();
            })
            resobj.on('error', function (err) {
                log.warning("Error in trying to determine if user exists.", util.inspect(err));
                reject();
                client.destroy();
            })
        }).catch(function(err) {
            log.warning("Error in trying to execute the clent.searchAsyn command.", util.inspect(err));
            reject();
            client.destroy();
        })
    })
}

    // queries LDAP with existing groups in system, and returns ones belonging to user
exports.getGroupsForUser = function (username) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        //get all existing groups
        models.Group.findAll({ 
            attributes: ['name']
        }).then(function(groups) {
            //only proceed if there are groups in the ingenium system
            if (groups.length > 0) {
                var groupnames = _.map(groups, function(group) {
                    return group.name;
                });
                var groupstring = groupnames.join(')(cn=');
                var userdn = "uid=" + username + "," + dc;
                var opts = {
                    filter: '(&(objectclass=jplgroup)(uniqueMember=' + userdn + ')(|(cn=' + groupstring + ')))',
                    scope: 'sub'
                }

                client.searchAsync(dc, opts).then(function(resobj) {
                    var entries = [];
                    resobj.on('searchEntry', function (entry) {
                        entries.push(entry.object);
                    });
                    resobj.on('end', function (result) {
                        var groupsArr = [];
                        _.forEach(entries, function (entry) {
                            if (entry.uniqueMember) {
                                var name = entry.cn;
                                groupsArr.push(_.toLower(name));
                            }
                        })
                        resolve(groupsArr);
                        client.destroy();
                    })
                    resobj.on('error', function (err) {
                        log.warning("Error in attempting to retrieve groups for a user.", util.inspect(err));
                        reject();
                        client.destroy();
                    })
                }).catch(function(err) {
                    log.warning("Attempting to run the client.searchAsync command, but was unsuccessful.", util.inspect(err));
                    reject();
                    client.destroy();
                })
            } else {
                log.warning("The user does not belong to any groups in auth service.");
                resolve([]);
                client.destroy();
            }
        }).catch(function(err) {
            log.warning("Error in attempting to retrieve groups for a user. Groups.findAll", util.inspect(err));
            reject();
            client.destroy();
        })
    })
}

exports.get_user_info = function (username) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        var opts = {
            filter: '(&(objectclass=person)(uid=' + username + '))',
            scope: 'sub'
        }
        client.searchAsync(dc, opts).then(function(resobj) {
            var entries = [];
            resobj.on('searchEntry', function(entry) {
                entries.push({"username": entry.object.uid, "displayName": entry.object.displayName});
            });
            resobj.on('end', function() {
                resolve(entries);
                client.destroy();
            });
            resobj.on('error', function (err) {
                log.warning("Error attempting to search for users.", util.inspect(err));
                reject();
                client.destroy();
            })
        }).catch(function(err) {
            log.warning("Error searching for user, client.searchAsync problem.", util.inspect(err));
            reject();
            client.destroy();
        })
    })
}

exports.search_users = function (user_string) {
    var client = create_client();
    return new Promise(function(resolve, reject) {
        var opts = {
            filter: '(&(objectclass=person)(uid=' + user_string + '*))',
            scope: 'sub'
        }
        client.searchAsync(dc, opts).then(function(resobj) {
            var entries = [];
            resobj.on('searchEntry', function(entry) {
                entries.push({"username": entry.object.uid, "displayName": entry.object.displayName});
            });
            resobj.on('end', function() {
                resolve(entries);
                client.destroy();
            });
            resobj.on('error', function (err) {
                log.warning("Error attempting to search for users.", util.inspect(err));
                reject();
                client.destroy();
            })
        }).catch(function(err) {
            log.warning("Error searching for users, client.searchAsync problem.", util.inspect(err));
            reject();
            client.destroy();
        })
    })
}

exports.search_groups = function (group_string) {
    var client = create_client();
    return new Promise(function(resolve, reject) {

        var opts = {
            filter: '(&(objectclass=jplgroup)(cn=' + group_string + '*))',
            scope: 'sub'
        }
        client.searchAsync(dc, opts).then(function(resobj) {
                var entries = [];
                resobj.on('searchEntry', function (entry) {
                    entries.push(entry.object.cn);
                })
                resobj.on('end', function () {
                    resolve(entries);
                    client.destroy();
                })
                resobj.on('error', function(err) {
                    log.warning("Error attempting to search for groups.", util.inspect(err));
                    reject();
                    client.destroy();
                })

        }).catch(function(err) {
            log.warning("Error attempting to search for groups, client.searchAsync problem", util.inspect(err));
            reject();
            client.destroy();
        })
    })
}


