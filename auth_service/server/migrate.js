const path = require('path');
const child_process = require('child_process');
const Promise = require('bluebird');
const Sequelize = require('sequelize');
const Umzug = require('umzug');
const node_funcs = require('../node_funcs.js');

const log = node_funcs.log;

const env_config = require('../env_config.js');
const sequelize = new Sequelize(env_config.db_name, env_config.db_username, env_config.db_password, {
  "database": env_config.db_name,
  "host": env_config.db_host,
  "dialect": "mysql",
  "logging": false
});

const umzug = new Umzug({
    storage: 'sequelize',
    storageOptions: {
        sequelize: sequelize,
    },

    // see: https://github.com/sequelize/umzug/issues/17
    migrations: {
        params: [
            sequelize.getQueryInterface(), // queryInterface
            sequelize.constructor, // DataTypes
            function() {
                throw new Error('Migration tried to use old style "done" callback. Please upgrade to "umzug" and return a promise instead.');
            }
        ],
        path: path.join(process.env.PWD, '/server', '/migrations'),
        pattern: /\.js$/
    },

    logging: false
});

function logUmzugEvent(eventName) {
    return function(name, migration) {
        log.debug(`${ name } ${ eventName }`);
    }
}
umzug.on('migrating', logUmzugEvent('migrating'));
umzug.on('migrated',  logUmzugEvent('migrated'));
umzug.on('reverting', logUmzugEvent('reverting'));
umzug.on('reverted',  logUmzugEvent('reverted'));

function cmdStatus() {
    let result = {};

    return umzug.executed()
      .then(executed => {
        result.executed = executed;
        return umzug.pending();
    }).then(pending => {
        result.pending = pending;
        return result;
    }).then(({ executed, pending }) => {

        executed = executed.map(m => {
            m.name = path.basename(m.file, '.js');
            return m;
        });
        pending = pending.map(m => {
            m.name = path.basename(m.file, '.js');
            return m;
        });

        const current = executed.length > 0 ? executed[0].file : '<NO_MIGRATIONS>';
        const status = {
            current: current,
            executed: executed.map(m => m.file),
            pending: pending.map(m => m.file),
        }

        return { executed, pending };
    })
}

function cmdMigrate(){
    log.debug("Umzug up");
    return umzug.up();
}

function cmdMigrateNext() {
    return cmdStatus()
        .then(({ executed, pending }) => {
            if (pending.length === 0) {
                return Promise.reject(new Error('No pending migrations'));
            }
            const next = pending[0].name;
            return umzug.up({ to: next });
        })
}

function cmdReset() {
    log.debug("Umzug reset");
    return umzug.down({ to: 0 });
}

function cmdResetPrev() {
    return cmdStatus()
        .then(({ executed, pending }) => {
            if (executed.length === 0) {
                return Promise.reject(new Error('Already at initial state'));
            }
            const prev = executed[executed.length - 1].name;
            return umzug.down({ to: prev });
        })
}

function cmdHardReset() {
    log.debug("Umzug hard reset");
    var interface = sequelize.getQueryInterface();
    return interface.dropAllSchemas();
}

// being run as a command line utility
if(process.argv[2] !== undefined){
    const cmd = process.argv[2].trim();
    let executedCmd;

    log.debug(`${ cmd.toUpperCase() } BEGIN`);

    switch(cmd) {
        case 'status':
            executedCmd = cmdStatus();
            break;

        case 'up':
        case 'migrate':
            executedCmd = cmdMigrate();
            break;

        case 'next':
        case 'migrate-next':
            executedCmd = cmdMigrateNext();
            break;

        case 'down':
        case 'reset':
            executedCmd = cmdReset();
            break;

        case 'prev':
        case 'reset-prev':
            executedCmd = cmdResetPrev();
            break;

        case 'reset-hard':
            executedCmd = cmdHardReset();
            break;

        default:
            log.error(`invalid cmd: ${ cmd }`);
            process.exit(1);
    }

    executedCmd
    .then(result => {
        const doneStr = `${ cmd.toUpperCase() } DONE`;
        log.debug(doneStr);
        log.debug("=".repeat(doneStr.length));
    })
    .catch(err => {
        const errorStr = `${ cmd.toUpperCase() } ERROR`;
        log.debug(errorStr);
        log.debug("=".repeat(errorStr.length));
        log.debug(err);
        log.debug("=".repeat(errorStr.length));
    })
    .then(() => {
        if (cmd !== 'status' && cmd !== 'reset-hard') {
            return cmdStatus()
        }
        return Promise.resolve();
    })
    .then(() => process.exit(0));
}

module.exports.cmdMigrate = cmdMigrate;
module.exports.cmdMigrateNext = cmdMigrateNext;
module.exports.cmdReset = cmdReset;
module.exports.cmdResetPrev = cmdResetPrev;
module.exports.cmdHardReset = cmdHardReset;