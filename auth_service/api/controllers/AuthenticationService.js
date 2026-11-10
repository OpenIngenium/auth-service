'use strict';
var login_helper = require('../helpers/login_helper.js');
var jwtHelper = require('../helpers/jwt_helper.js');
var redis = require('../../redis.js');
var ms = require('ms');
const node_funcs = require('../../node_funcs.js');
const env_config = require('../../env_config.js');

const log = node_funcs.log;

exports.login = async function(args, res, next) {
    /**
     * log in user
     *
     * returns inline_response_200
     **/
    var username = args.user;
    let permission = await login_helper.getPermission(username);
    log.debug(`username: ${username}`);
    log.debug(`permission: ${JSON.stringify(permission, null, 2)}`);
    
    if (permission.scopes && permission.scopes.length > 0) {
        var tokens = await jwtHelper.create_access_token(username, permission);
        res.status(200).json({"access_token": tokens.token, "access_token_timeout": tokens.access_token_timeout});
        // if logon was successful, create user in DB if it does not exist
        login_helper.ensure_user(username);
    } else {
        res.status(401).json({message: "Unauthorized"});
    }
  }


exports.logout = function(token, res, next) {
  /**
   * log out a user
   * logs out a user. add their tokens to blacklist
   *
   * no response value expected for this operation
   **/

  // decode token
  // get jti from token
  // add jti to redis
  // set timeout to refresh token timeout
  var decoded = jwtHelper.decode_jwt(token);
  if (token == null) {
      res.status(401).json({message: "Unauthorized"});
  } else {
      var jti = decoded.jti;
      redis.redisClient.set(jti, jti, redis.redisClient.print);
      redis.redisClient.get(jti, function(err, reply) {
          // log.debug("Successful logout:");
      })
      
      redis.redisClient.expire(jti, ms(env_config.ACCESS_TOKEN_TIMEOUT)/1000);
      // log.debug(`Decoded token, username: ${decoded.username} jti: ${decoded.jti}`);
      jwtHelper.updateLoggedInStatus(decoded.username, true);
      res.status(200).json();
  }
}

exports.refresh_token = async function(token, res, next) {
  /**
   * get new api token
   *
   * refresh_token String 
   * returns String
   **/

    let new_token = await jwtHelper.refresh_token(token);
    if (new_token == null) {
        res.status(401).json({message: "Unauthorized"});
    } else if (new_token.access_token == "error"){
        res.status(403).json({message: "Long expire, Unauthorized"});
    } else {
        res.status(200).json({"access_token" : new_token.access_token, "access_token_timeout": new_token.access_token_timeout})
    }
}

