var util = require('util');
var redis = require('redis');
const node_funcs = require('./node_funcs.js');
const log = node_funcs.log;

var client = redis.createClient(6379, "auth_service_redis"); //auth_service_redis

client.on('connect', function() {
    log.info("Connected to REDIS");
});

client.on("error", function (err) {
    log.error("Couldn't connect to REDIS ", util.inspect(err));
});

module.exports.redisClient = client;
