'use strict';
var util = require('util');
var ldap = require('ldapjs');
var fs = require('fs');
var axios = require('axios');
var uuid = require('uuid');
var Promise = require('bluebird');
const node_funcs = require('../../node_funcs.js');
const env_config = require('../../env_config.js');

const log = node_funcs.log;

module.exports.ldap_authenticate = function ldap_authenticate(username, password) {
    var ldapUrl = env_config.ldap_url;
    var dc = "ou=personnel," + env_config.ldap_base_dn;
    var userdn = "uid=" + username + "," + dc;
    var opts = {
        filter: '(&(objectclass=person)(uid=' + username + '))',
        scope: 'sub'
    }

    log.debug(`Attempting connection to LDAP. ldapUrl: ${ldapUrl} username: ${username}`);

    try {
        var client = ldap.createClient({
            url: ldapUrl,
            tlsOptions: env_config.ldap_tls_options
        });
        client.on('error', function(err) {
            log.warning('LDAP error in authenticate function:', util.inspect(err));
        });

        return new Promise(function(resolve, reject) {
            client.bind(userdn, password, function(err, result) {
                if (err) {
                    if (err instanceof ldap.InvalidCredentialsError) {
                        log.warning(`Invalid LDAP Credentials Error. username: ${username}`);
                        resolve(false);
                    } else {
                        log.warning(`General LDAP Error. username: ${username}`, util.inspect(err));
                        resolve(false);
                    }
                } else {
                    resolve(result);
                }
                client.destroy();
            })
        })
    } catch(err) {
        log.warning("Unkown General LDAP Error ", util.inspect(err));
        return new Promise((resolve, reject) => resolve(false));
    }
}

module.exports.rsa_authenticate = async function rsa_authenticate(username, passcode) {
    const initUrl = `${env_config.RSA_URL}/initialize`;
    const initPayload = {
        clientId: env_config.RSA_CLIENT_ID,
        subjectName: username,
        context: {
            messageId: uuid.v4()
        }
    }
    const headers = {
        'client-key': env_config.RSA_CLIENT_KEY,
        'Content-Type': 'application/json'
    }
    let initRes = null;
    try {
        initRes = await axios.post(initUrl, initPayload, {headers: headers});
    } catch (err) {
        log.warning(`Failed to initialize TFA request. error: ${util.inspect(err)}`);
        return false;
    }

    const initData = initRes.data;
    const payload = {
        subjectName: username,
		subjectCredentials: [
			{
				methodId: 'SECURID',
				collectedInputs: [
					{
						name: 'SECURID',
						value: passcode
					}
				]
			}
		],
		context: {
			authnAttemptId: initData['context']['authnAttemptId'],
			messageId: uuid.v4(),
			inResponseTo: initData['context']['messageId']
		}
    }

    try {
        const verifyUrl = `${env_config.RSA_URL}/verify`;
        const res = await axios.post(verifyUrl, payload, {headers: headers});
        console.log(`res.status: ${res.status}`);
        console.log(`res.data.attemptResponseCode: ${res.data.attemptResponseCode}`);
        if (res.data && res.data.attemptResponseCode === 'SUCCESS') {
            return true;
        } else {
            return false;
        }
    } catch (err) {
        log.warning(`Failed to verify passcode. error: ${util.inspect(err)}`);
        return false;
    }
}


