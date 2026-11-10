'use strict';
var _ = require('lodash');
const node_funcs = require('../../node_funcs.js');

const log = node_funcs.log;

exports.health = function(args, res, next) {
  /**
   * is the server up?
   *
   * no response value expected for this operation
   **/
  res.status(200).json({'message': 'ok'});
}

exports.loglevelGET = function(args, res, next) {
  /**
   * get the current log level for the auth service
   *
   * returns String
   **/

  res.status(200).json({ level: global.LogLevel });
}

exports.loglevelPOST = function(args, res, next) {
  /**
   * change the log level for the auth service
   *
   * loglevel String 
   * no response value expected for this operation
   **/
   if (!_.isUndefined(args.data.value.loglevel)) {
    var logLevel = args.data.value.loglevel;
    var allowedTypes = ['ERROR', 'WARNING', 'INFO', 'DEBUG', 'TRACE'];
    if (allowedTypes.includes(logLevel)) {
      global.LogLevel = logLevel;
      res.status(204).json();
    } else {
      let msg = `${logLevel} is not supported`;
      res.status(422).json({message: msg});
    }
   } else {
    res.status(422).json({message: "Required parameter missing: loglevel"});
   }
  res.end();
}

