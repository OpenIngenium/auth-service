var jwt = require('jsonwebtoken');
var jwtHelper = require('../helpers/jwt_helper.js');
var crypto = require('crypto');
var redisClient = require('../../redis.js');
var Promise = require('bluebird');
Promise.promisifyAll(require('redis'));
const node_funcs = require('../../node_funcs.js');
const env_config = require("../../env_config.js");
const models = require('../../server/models/index.js');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');

const ACCESS_TOKEN_TIMEOUT = env_config.ACCESS_TOKEN_TIMEOUT;
const TEN_SEC_OFFSET = env_config.TEN_SEC_OFFSET;
const publicPem = env_config.PUBLIC_PEM;
const privatePem = env_config.PRIVATE_PEM;

const log = node_funcs.log;

function encode_token(username, permission, jti, oit) {
    var payload = {}
    payload.username = username;
    payload.scopes = permission.scopes;
    payload.roles = permission.roles;
    payload.jti = jti;
    payload.iat = Math.floor(Date.now() / 1000) - TEN_SEC_OFFSET;
    payload.oit = oit || Math.floor(Date.now() / 1000);
    
    var token = jwt.sign(payload, privatePem, {
        algorithm: 'RS256',
        expiresIn: ACCESS_TOKEN_TIMEOUT
    });

    return token;
}

function decode_jwt(token) {
    var decoded = null;
    try {
        decoded = jwt.verify(token, publicPem, {
            algorithms: ['RS256']
        });
    } catch(err) {
        log.error("Couldnt decode jwt token");
        decoded = null;
    }
    return decoded;
}
exports.decode_jwt = decode_jwt;

exports.create_access_token = async function(username, permission) {
    // set time that user could possibly be logged in until.
    await updateLoggedInStatus(username);
    var jti = uuid.v4();
    var token = encode_token(username, permission, jti);
    log.info(`Access token created. timeout: ${ACCESS_TOKEN_TIMEOUT}`);
    return {"token": token, "access_token_timeout": ACCESS_TOKEN_TIMEOUT};
}

exports.refresh_token = async function(access_token) {
    var decoded = decode_jwt(access_token);
    if (decoded == null) {
        log.warning("Refresh token couldn't be issued, problem decoding the passed token.");
        return null;
    } else {
        var jti = decoded.jti;
        // amount of seconds elapsed since issued time is less than 12 hours (configurable)
        log.debug(`Elapsed Seconds: ${Math.floor(Date.now() / 1000) - decoded.oit}`);
        log.debug(`Expires: ${env_config.long_expire}`);

        if ((Math.floor(Date.now() / 1000) - decoded.oit) < env_config.long_expire) {
            let reply = await redisClient.redisClient.existsAsync(jti);
            if (reply == 0) {
                let decodedPermission = {};
                decodedPermission.scopes = decoded.scopes;
                decodedPermission.roles = decoded.roles;
                var token = encode_token(decoded.username, decodedPermission, decoded.jti, decoded.oit);

                // extend time user could possibly be logged in until.
                await updateLoggedInStatus(decoded.username);
                return {"access_token": token, "access_token_timeout": ACCESS_TOKEN_TIMEOUT};
            } else {
                log.warning("Refresh token had problems issuing a new refresh token.");
                return null;
            }
        } else {
            return {"access_token": "error"};
        }
    }
    
}

exports.get_jwt_from_header = function(req) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        return req.headers.authorization.split(' ')[1];
    } else {
        log.warning("Couldn't get the JWT from the header.");
        return null;
    }
}

exports.is_token_blacklisted = function(jti) {
    return new Promise(function(resolve, reject) {
        redisClient.redisClient.getAsync(jti)
            .then(function(reply) {
                if (reply) {
                    log.debug(`Token is blacklisted: ${jti}`);
                    resolve(true);
                } else {
                    log.debug("Token isn't blacklisted.");
                    resolve(false);
                }
            }).catch(function(err) {
                reject();
            })
        })

}

async function updateLoggedInStatus(_username, logout=false) {
    var date = new Date();
    // add zero to single digit numbers
    var hour = (date.getHours() < 10 ? "0"+date.getHours() : date.getHours());

    // if user logs out set back the login_expire time one hour
    log.debug(`Username: ${_username}  Logout: ${logout}`);
    if(!logout){
        // add an hour, goto 00, not 24
        if(date.getHours() === 23){
            log.trace("Hour was 23, setting forward to 00.");
            hour = "00";
        }else{
            log.trace("Setting login_expire forward one hour from current time.");
            hour = ( (date.getHours()+1) < 10 ? "0"+(date.getHours()+1) : (date.getHours()+1) );
            log.trace(`Current hour: ${date.getHours()} New hour: ${date.getHours()+1} Actual hour: ${hour}`);
        }
    }

    login_expire_date_formatted = date.getFullYear()+"-"+
                                  ((date.getMonth()+1) < 10 ?  "0"+(date.getMonth()+1) :(date.getMonth()+1))+"-"+
                                  date.getDate()+" "+
                                  hour+":"+
                                  (date.getMinutes() < 10 ? "0"+date.getMinutes() : date.getMinutes())+":"+
                                  (date.getSeconds() < 10 ? "0"+date.getSeconds() : date.getSeconds());
                                  
    await models.User.update({
        login_expire: login_expire_date_formatted
      }, {
        where: {
            username: _username
        }
    });
    log.info(`Successfully updated login_expire to ${login_expire_date_formatted} for ${_username}`);
}

exports.updateLoggedInStatus = updateLoggedInStatus;

