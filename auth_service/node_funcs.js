'use strict';
var util = require('util');
var jwt = require('jsonwebtoken');
const env_config = require('./env_config.js');
var winston = require('winston');
const MESSAGE = Symbol.for('message');
const SPLAT = Symbol.for('splat');
const PUBLIC_PEM = env_config.PUBLIC_PEM;

/**
 * format function for string.
 * Example:  'element id is {0}'.format(elem_id)
 */
String.prototype.format = function () {
  var args = arguments;
  return this.replace(/\{(\d+)\}/g, function (m, n) { return args[n]; });
};


const custom_log_levels = {
  levels: {
    critical: 0, error: 1, warning: 2, info: 3, debug: 4, trace: 5
  }
};

const json_formatter = (log_entry) => {
  const json_data = {timestamp: new Date()};
  json_data['level'] = log_entry['level'].toUpperCase();
  json_data['message'] = log_entry['message'];

  // meta is the object passed as the 2nd argument to the logging function.
  // If multiple objects are passed, meta will be an array.
  let log_entry_meta = log_entry['meta'];

  // winston 3 no longer sets `meta`; extra args land on the SPLAT symbol as an
  // array. A single extra arg is unwrapped so the branches below behave as they
  // did under winston 2 (string -> details, object -> merge, etc.).
  if (log_entry_meta === undefined) {
    const splat = log_entry[SPLAT];
    if (Array.isArray(splat) && splat.length > 0) {
      log_entry_meta = splat.length === 1 ? splat[0] : splat;
    }
  }

  if (log_entry_meta) {
    // If the passed object is string, array, or object with no properties, 
    // add it as details.
    if (typeof log_entry_meta === 'string' || log_entry_meta instanceof String) {
      json_data['details'] = [log_entry_meta];
    } else if (Array.isArray(log_entry_meta)) {
      json_data['details'] = log_entry_meta.map(function(item) {
        let item_inspected = util.inspect(item);
        return item_inspected
      });
    } else if (Object.keys(log_entry_meta).length == 0) {
      json_data['details'] = util.inspect(log_entry_meta);
    } else {
      // merge the passed object into json_data
      Object.assign(json_data, log_entry_meta);
    }
  }
  // log_entry[MESSAGE] is not in JSON format. Overwrite in JSON format.
  log_entry[MESSAGE] = JSON.stringify(json_data);  
  
  return log_entry;
}

let transports = [new winston.transports.Console()];

if (process.env.LOG_FILE_PATH != undefined) {
  transports.push(new winston.transports.File({
    filename: process.env.LOG_FILE_PATH, 
    handleExceptions: true,
    maxsize: 5242880,
    maxFiles: 2,
    colorize: false
  }))
}

const log = winston.createLogger({
  levels: custom_log_levels.levels,
  level: process.env.LOG_LEVEL != undefined ? process.env.LOG_LEVEL.toLowerCase() : 'debug',
  format: winston.format.combine(winston.format.splat(), winston.format.simple(), winston.format(json_formatter)()),
  transports: transports,
});

function parse_username(authorization_header) {
  let username = '';
  if (authorization_header) {
    let decoded = jwt.verify(parse_token(authorization_header), PUBLIC_PEM, { algorithms: ['RS256'] });
    username = decoded['username'];  
  }
  return username;
}

function parse_token(key) {
  let token = '';

  let tokens = key.split(' ');
  if (tokens.length > 1) {
    token = tokens[1];
  } else {
    log.warning('authorization header is not in the correct format');
  }
  return token;
}

module.exports.log = log;
module.exports.parse_username = parse_username;