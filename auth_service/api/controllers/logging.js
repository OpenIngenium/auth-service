'use strict';

var url = require('url');

var Logging = require('./LoggingService');

module.exports.health = function health (req, res, next) {
  Logging.health(req.swagger.params, res, next);
};

module.exports.loglevelGET = function loglevelGET (req, res, next) {
  Logging.loglevelGET(req.swagger.params, res, next);
};

module.exports.loglevelPOST = function loglevelPOST (req, res, next) {
  Logging.loglevelPOST(req.swagger.params, res, next);
};
