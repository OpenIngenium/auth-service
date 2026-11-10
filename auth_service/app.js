'use strict';

var SwaggerExpress = require('swagger-express-mw');
var app = require('express')();
var cors = require('cors');
const env_config = require('./env_config.js');
var serverPort = env_config.PORT;
var SwaggerUi = require('swagger-tools/middleware/swagger-ui');
var interceptor = require('express-interceptor');
var basicAuth = require('basic-auth');
var authentication = require('./api/helpers/authenticate.js');
var jwtHelper = require('./api/helpers/jwt_helper.js');
var jwt = require('jsonwebtoken');
var _ = require('lodash');
var redis = require('redis');
const path = require('path');
const node_funcs = require('./node_funcs.js');
var index = require('./server/models/index.js');
var Sequelize = require('sequelize');
var util = require('util');
const PUBLIC_PEM = env_config.PUBLIC_PEM;

// initialize Log Level
global.LogLevel = env_config.DEBUG;

// initialize logging 
const log = node_funcs.log;

// enable cors
app.use(cors());
app.options('*', cors());

app.use(interceptor(function (req, res) {
    return {
      isInterceptable: function() {
        let check = false;
        let apiPath = req.swagger ? req.swagger.apiPath : null;

        if (apiPath) {
          check = true;
        }

        log.trace(`isInterceptable url: ${req.url} apiPath: ${apiPath} method: ${req.method} check: ${check}`);

        return check;
      },
  
      intercept: function(body, send) {
        // req.swagger must exist since we checked it in isInterceptable()
        log.trace(`intercept apiPath: ${req.swagger.apiPath} method: ${req.method} statusCode: ${res.statusCode}`);
        // send response 
        send(body);
  
        let authorization_header = req.headers['authorization'] || req.headers['Authorization'] || '';
        let user_name = '';

        if (authorization_header.toLowerCase().startsWith('bearer')) {
          try {
            user_name = node_funcs.parse_username(authorization_header);
          } catch(err) {
            log.warning('failed to get user_name from JWT token', util.inspect(err));
          }            
        } else if (authorization_header.toLowerCase().startsWith('basic')) {
          user_name = req.params && req.params.user ? req.params.user : '';
        }

        let message = req.swagger.operation ? req.swagger.operation.description : '';
        let operation_id = req.swagger.operation ? req.swagger.operation.operationId : '';
        
        let log_entry = {
          'user_name': user_name,
          'service': 'auth_service'
        }      
  
        log_entry['event'] = operation_id;
      
        if (res.statusCode < 200 || res.statusCode >= 400) {
          log.error(message, log_entry);
        } else {
          log.info(message, log_entry);
        }
      }
    }
  }));

(async () => {
    try {
        await index.init_db(10);
    } catch(e) {
        log.error("Could not establish connection with MySQL.");
    }
})();

var config = {
  appRoot: __dirname // required config
};
config.swaggerSecurityHandlers = {
    ingenium_auth: function securityHandler1(req, authOrSecDef, scopesOrApiKey, callback) {
        var token = jwtHelper.get_jwt_from_header(req);
        if (token == null) {
            // callback({message: "Please include 'Bearer [token]' in authorization header.", code: 401 });
            callback(new Error("Please include 'Bearer [token]' in authorization header."));
        } else {
            try {
                var decoded = jwt.verify(token, PUBLIC_PEM, { algorithms: ['RS256'] });
                const scope_names = decoded.scopes.map(scope => scope.scope);
                // log.debug(`scopesOrApiKey: ${JSON.stringify(scopesOrApiKey)}`);
                // log.debug(`scope_names: ${JSON.stringify(scope_names)}`);
                // check if it's in the redis cache (neeed to make this a promise thing
                jwtHelper.is_token_blacklisted(decoded.jti).then(function (blacklisted) {
                    if (blacklisted == true) {
                        callback(new Error("Unauthorized."));
                    } else if (_.intersection(scope_names, scopesOrApiKey).length > 0) {
                        callback();
                    } else {
                        // callback({message: "Unauthorized.", code: 401 });
                        callback(new Error("Unauthorized."));
                    }
                })

            } catch (err) {
                callback({message: err.message, code: 401 });
            }
        }
    },
    basicAuth: function basicAuthentication(req, authOrSecDef, scopesOrApiKey, callback) {
      const user = basicAuth(req);
      user.name = user.name.trim().toLowerCase();
      const test_user = env_config.test_user.trim().toLowerCase();
      const test_pass = env_config.test_pass.trim();

      if (!user){
        // callback({message:"Unauthenticated: wrong username or password", code: 500 });
        callback(new Error("Unauthenticated: wrong username or password"));
      } else {
        // test user and password cant be blank
        if (test_user && test_pass && (test_user === user.name) && (test_pass === user.pass)) {
          req.params.user = user.name;
          log.debug(`Sucessfully authenticated testing user: ${user.name}`);
          callback();
        } else {
          let authMethod = 'password';
          if (req.headers['X-AUTH-METHOD']) {
            authMethod = req.headers['X-AUTH-METHOD'].toLowerCase();
          } else if (req.headers['x-auth-method']) {
            authMethod = req.headers['x-auth-method'].toLowerCase();
          }

          if (authMethod !== env_config.AUTH_METHOD.toLowerCase()) {
            callback(new Error(`Unauthenticated: auth service is configured for ${env_config.AUTH_METHOD}. ${authMethod} is not supported.`));
            return;
          }

          if (authMethod === 'rsa' ) {
            authentication.rsa_authenticate(user.name, user.pass).then(function(result) {
              if (result == false) {
                  callback(new Error("Unauthenticated: wrong username or RSA passcode"));
              } else {
                  req.params.user = user.name;
                  log.debug(`Sucessfully authenticated using RSA passcode: ${user.name}`);
                  callback();
              }
            });
          } else {
            // result of LDAP auth gets passed here ------------------------V
            authentication.ldap_authenticate(user.name, user.pass).then(function(result) {
              if (result == false) {
                  callback(new Error("Unauthenticated: wrong username or password"));
              } else {
                  req.params.user = user.name;
                  log.debug(`Sucessfully authenticated using LDAP: ${user.name}`);
                  callback();
              }
            });
          }
        }
      }
    }
};


SwaggerExpress.create(config, function(err, swaggerExpress) {
  if (err) {throw err; }

  // Add swagger-ui (This must be before swaggerExpress.register)
  app.use(SwaggerUi(swaggerExpress.runner.swagger));


  // install middleware
  swaggerExpress.register(app);

  var port = process.env.PORT || serverPort;

  app.get('/', function(req, res){
    res.send('This is the auth-Z piece!!');
  });

  if(!module.parent) {
      log.info(`service is runing on port: ${port}`);
      app.listen(port);
  }
});

module.exports = app;
