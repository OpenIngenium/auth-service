'use strict';

var env = process.env.NODE_ENV || 'development';
var db_username = process.env.MYSQL_USERNAME || 'root';
var db_password = process.env.MYSQL_ROOT_PASSWORD || '';
var db_name = process.env.MYSQL_DATABASE || 'auth';
var db_host = process.env.MYSQL_HOST || 'auth_service_mysql';
var PUBLIC_PEM = process.env.PUBLIC_PEM || '';
var PRIVATE_PEM = process.env.PRIVATE_PEM || '';
var test_user = process.env.USERNAME || '';
var test_pass = process.env.PASSWORD || '';
var long_expire = process.env.LONG_EXPIRE || 43200;
var AUTH_METHOD = process.env.AUTH_METHOD || 'password';
var ldap_url = process.env.LDAP_URL || '';
var RSA_URL = process.env.RSA_URL || 'https://jpltfa-primary.jpl.nasa.gov:5555/mfa/v1_1/authn';
var RSA_CLIENT_ID = process.env.RSA_CLIENT_ID || 'jw1';
var RSA_CLIENT_KEY = process.env.RSA_CLIENT_KEY || '';

module.exports.env = env;
module.exports.db_username = db_username;
module.exports.db_password = db_password;
module.exports.db_name = db_name;
module.exports.db_host = db_host;
module.exports.test_user = test_user;
module.exports.test_pass = test_pass;
module.exports.long_expire = long_expire;
module.exports.AUTH_METHOD = AUTH_METHOD;
module.exports.ldap_url = ldap_url;
module.exports.RSA_URL = RSA_URL;
module.exports.RSA_CLIENT_ID = RSA_CLIENT_ID;
module.exports.RSA_CLIENT_KEY = RSA_CLIENT_KEY;
module.exports.PUBLIC_PEM = PUBLIC_PEM;
module.exports.PRIVATE_PEM = PRIVATE_PEM;

// TLS options for the configured LDAP server. Override via env/config if your
// LDAP server requires a different TLS version or cipher policy.
module.exports.ldap_tls_options = {
  minVersion: 'TLSv1',
  maxVersion: 'TLSv1',
  ciphers: 'DEFAULT@SECLEVEL=0'
};

module.exports.ACCESS_TOKEN_TIMEOUT = '3410s';
module.exports.TEN_SEC_OFFSET = 10;
module.exports.PORT = 8080;
module.exports.LOG_LEVEL = 'DEBUG';
