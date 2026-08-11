'use strict';

var fs        = require('fs');
var path      = require('path');
var Sequelize = require('sequelize');
var basename  = path.basename(module.filename);
var db        = {};
const Umzug = require('umzug');
const migrate = require('../migrate.js');
var Promise = require('bluebird');
var env_config = require(path.join(process.env.PWD, '/env_config.js'));
const node_funcs = require('../../node_funcs.js');

const log = node_funcs.log;

// Synchronous blocking sleep (in seconds) implemented with Atomics.wait so the
// image builds on modern Node without the native `sleep` addon / a compiler.
function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

// If database doesn't exist, then make it.
try{
  var sequelize = new Sequelize(env_config.db_name, env_config.db_username, env_config.db_password, {
    "database": env_config.db_name,
    "host": env_config.db_host, 
    "dialect": "mysql",
    "logging": false
  });
} catch(e) {
  log.warn("Could not establish connection with MySQL, try rebuilding & rerunning.");
}

// create database if it doesn't exist already
(async () => {
  // sequelize instance with no database defined.
  var sequelize_dhc = new Sequelize("", env_config.db_username, env_config.db_password, {
    "database": "",
    "host": env_config.db_host, 
    "dialect": "mysql"
  });

  try{
    await sequelize_dhc.query("CREATE DATABASE `auth`;");
  } catch(err) {
    log.info("Auth table exists");
  }
})();

async function init_db(count) {
  // dont try connecting to database after the last attempt
  if (count > 0) {
    log.info(`Attempting to connect to DB. Remaining count: ${count}`);
    // sleep for 5 seconds, set to 5 so that full migration script can be ran without being cut off
    sleepSeconds(5);
    try {
      const res = await sequelize.query(" SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'auth';", { type: sequelize.QueryTypes.SELECT});
      if (res[0].count === 0) {
        log.info("No table was found. Create database schema.");
        await migrate.cmdHardReset();
        await migrate.cmdMigrate();
        log.info("Database migration scripts were completed.");
      } else {
        log.info("Runnning new database migration scripts (if any)");
        await migrate.cmdMigrate();
        log.info("Runnning new database migration scripts (if any) completed");
      }
    } catch (err) {
      log.error(err)
      return init_db(count-1);
    }
  }
}

fs
  .readdirSync(__dirname)
  .filter(function(file) {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(function(file) {
    var model = sequelize['import'](path.join(__dirname, file));
    db[model.name] = model;
  });

Object.keys(db).forEach(function(modelName) {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// uncomment if you need to update the database after changing models (will wipe the db)
sequelize.sync({
  // TODO:
  // remove this force thing before production
    // force: true
});

module.exports = db;
module.exports.init_db = init_db;
