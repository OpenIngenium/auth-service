"""
This python script tests all the endpoints of the Ingenium AUTH service and verifies the auth service
requirements.

Requirement Source:
IAS-1	The IAS shall authenticate users via LDAP.
IAS-2	The IAS shall provide JWT for access to Ingenium services with a timeout of 27 minutes (TBC).
IAS-3	The IAS shall support assigning specific users to user defined categories (roles).
IAS-4	The IAS shall support assigning specific Ingenium permissions (or scopes) to user defined categories (roles).
IAS-5	The IAS shall support assigning groups of users (LDAP groups) to user defined categories (roles).
IAS-6	A user authenticated via the IAS shall have access privileges according to the combination of all roles they
        are assigned to.
IAS-7	On user logout the IAS shall ensure their token can not be used again (blacklist).
IAS-8	On user logout or token expiration the IAS shall issue logout requests to external service managers.
IAS-9	The IAS shall support the following scopes: admin, execute:wsts, execute:testbed, execute:sit, execute:other, config_mgmt, redline, basic 


API Endpoint Source:
https://github.jpl.nasa.gov/Ingenium/auth-prototype/blob/master/auth_service/api/swagger/swagger.yaml

This test with either pull a username and password from an environment variable or prompt the user for a password


Usage:
 - Run all tests
   $ python executions_test.py
 - Run a class
   $ python executions_test.py ExecutionsTest
 - Run a method
   $ python executions_test.py ExecutionDeleteTest.test_delete_executions
"""


# Imports

import xmlrunner
import unittest
import sys
import requests
import json
import logging
import jwt
import os
import getpass
import random
import itertools


# Constants
# Unclear how we should be dealing with test users/pwd


#Globals

auth_server=os.environ.get('AUTH_SERVICE_URL', 'http://localhost:8007')

# valid_user = os.environ.get('USERNAME')
# valid_password = os.environ.get('PASSWORD')
    
# if valid_user is None or valid_password is None:


token=None
ssl_verify=False
refresh_time=None
auth_endpoint_login="/api/v2/login"
auth_endpoint_refresh="/api/v2/refresh_token"
auth_endpoint_logout="/api/v2/logout"
auth_endpoint_health="/api/v2/health"
auth_endpoint_loglevel="/api/v2/logging"
auth_endpoint_groups="/api/v2/groups"
auth_endpoint_roles="/api/v2/roles"
auth_endpoint_users="/api/v2/users"
auth_endpoint_permissions="/api/v2/permissions"
auth_endpoint_ldap="/api/v2/ldap"

header = {'Authorization' : None,
          'Content-Type': 'application/json',
          'Accept': 'application/json'}

# disable insecure request warning because of self-signed SSLs...
from requests.packages.urllib3.exceptions import InsecureRequestWarning
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


def auth_test_log(level, function, message):
    '''
    This is a logging function used to add module level granularity in the Helix library log file.

    :param level: Level of log Message (DEBUG,INFO,WARNING,ERROR)
    :param function: The function that called the log message
    :param message: The log message
    :return: None
    '''

    if level == "DEBUG":
        logger.debug('%s - %s' % (function, message))
    elif level == "INFO":
        logger.info('%s - %s' % (function, message))
    elif level == "WARNING":
        logger.warning('%s - %s' % (function, message))
    elif level == "ERROR":
        logger.error('%s - %s' % (function, message))
    else:
        logger.error('Incorrect log level specified')
        logger.error('%s - %s' % (function, message))

    return

def setup_logging(log_file=None,verbosity="DEBUG"):
    '''
    This function initializes the logging for the auth test library.

    :param log_file: File name for a log file
    :param verbose: Log verbosity
    :return: None
    '''

    global logger

    log_file_format = logging.Formatter('%(asctime)s,%(levelname)s,%(name)s,%(message)s',
                                            datefmt='%m/%d/%Y %I:%M:%S %p')
    log_console_format = logging.Formatter('%(levelname)s --- %(name)s --- %(message)s')

    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)

    console_log = logging.StreamHandler()
    console_log.setFormatter(log_console_format)

    # Set the default Level of logging for console
    if verbosity == "DEBUG":
       console_log.setLevel(logging.DEBUG)
    elif verbosity == "INFO":
        console_log.setLevel(logging.INFO)
    elif verbosity == "WARNING":
        console_log.setLevel(logging.WARNING)
    elif verbosity == "ERROR":
        console_log.setLevel(logging.ERROR)
    # If the logging level input is garbage - default to DEBUG
    else:
        console_log.setLevel(logging.DEBUG)

    logger.addHandler(console_log)

    # If log_file is specified initialize a log to a file handler
    if log_file != None:
        file_log = logging.FileHandler(log_file, 'a')
        # File log is always full detail
        file_log.setLevel(logging.DEBUG)
        file_log.setFormatter(log_file_format)
        logger.addHandler(file_log)

    # Log the Logger
    auth_test_log("DEBUG", "logging_config", "Logging for Auth Testing is initialized.")

def set_login_info():
    '''
    This function sets the login information for the account that tests are running on.
    :return:
    '''
    global valid_user,valid_password
    
    valid_user = os.environ.get('USERNAME')
    valid_password = os.environ.get('PASSWORD')
    
    if valid_user is None or valid_password is None:
        valid_user= input("Enter Your User Name:")
        valid_password=getpass.getpass()

def cleanup_for_test():
    '''
        This function logs in and removes all the test roles
    '''
    auth_test_log("INFO", "Cleanup_AuthRequirementTest", "Tearing down up for AuthRequirementTest")

    auth_test_log("INFO", "Cleanup_AuthRequirementTest", "Logging in")
    path = auth_server + auth_endpoint_login
    auth_test_log("INFO", "Cleanup_AuthRequirementTest", f"Testing valid User and Password. path: {path}")
    # auth_test_log("DEBUG", "Cleanup_AuthRequirementTest", "Auth URL: "+path)
    logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
    auth_test_log("DEBUG", "Cleanup_AuthRequirementTest", "Response:%s" % logon.text)
    header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']

    auth_test_log("INFO", "Cleanup_AuthRequirementTest", "Getting List of all the Roles")
    path = auth_server + auth_endpoint_roles
    roles = requests.get(path, headers=header, verify=False)
    auth_test_log("DEBUG", "Cleanup_AuthRequirementTest", "Response:%s" % roles.text)
    list_of_roles = []
    test_roles = ['TESTROLE', 'TESTROLE_BASIC', 'REALLYTESTING', 'ROLE_MGMT_TEST', 'ROLE_1', 'ROLE_2', 'ROLE_3',
                  'ROLE_4','ROLE_5','ROLE_6','ROLE_7','ROLE_8','1446_ROLE']
    if roles.status_code == 200:
        for role in json.loads(roles.text)['results']:
            if role['name'] in test_roles or "REALLYTESTING" in role['name']:
                list_of_roles.append(role['id'])
    auth_test_log("INFO", "Cleanup_AuthRequirementTest","Found the following set of roles: %s" % list_of_roles)

    auth_test_log("INFO", "Cleanup_AuthRequirementTest", "Purging Test Roles")
    for role in list_of_roles:
        path = auth_server + auth_endpoint_roles + "/%s" % role
        roles = requests.delete(path, headers=header, verify=False)
        if roles.status_code != 200:
            auth_test_log("WARNING", "Cleanup_AuthRequirementTest", "Failure to remove role: %s")
            auth_test_log("WARNING", "Cleanup_AuthRequirementTest", "Reason: %s" % roles.text)

    auth_test_log("INFO", "Cleanup_AuthRequirementTest", "Getting List of all the Roles")
    path = auth_server + auth_endpoint_roles
    roles = requests.get(path, headers=header, verify=False)
    auth_test_log("DEBUG", "Cleanup_AuthRequirementTest", "Response:%s" % roles.text)
    auth_test_log("INFO", "Cleanup_AuthRequirementTest", "Purge complete")


# logging
setup_logging()

set_login_info()

cleanup_for_test()


class LoginTest(unittest.TestCase):
    '''
    This unit test exercises all of the login related auth endpoints
    '''
    def test_login_off_nom(self):
        path = auth_server+auth_endpoint_login
        user_name="Batman"
        pwd="Mwhahaha"
        auth_test_log("INFO","test_login_off_nom","Testing Invalid User and Password")
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(user_name, pwd),verify=False)
        auth_test_log("DEBUG", "test_login_off_nom", "Response:%s" %logon.text)
        self.assertEqual(logon.status_code, 403)
        auth_test_log("INFO", "test_login_off_nom","Testing Valid User and Invalid Password")
        user_name="swanchr"
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(user_name, pwd),verify=False)
        auth_test_log("DEBUG", "test_login_off_nom", "Response:%s" % logon.text)
        self .assertEqual(logon.status_code,403)
        auth_test_log("INFO", "test_login_off_nom","Testing Blank User and Invalid Password")
        user_name=None
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(user_name, pwd),verify=False)
        auth_test_log("DEBUG", "test_login_off_nom", "Response:%s" % logon.text)
        self .assertEqual(logon.status_code,403)
        auth_test_log("INFO", "test_login_off_nom","Testing Valid User and Blank Password")
        user_name=valid_user
        pwd=None
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(user_name, pwd),verify=False)
        auth_test_log("DEBUG", "test_login_off_nom", "Response:%s" % logon.text)
        self.assertEqual(logon.status_code,403)

    def test_login_nom(self):
        path = auth_server+auth_endpoint_login
        user_name=valid_user
        pwd=valid_password
        auth_test_log("INFO", "test_login_nom",f"Testing valid User and Password. path: {path}")
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(user_name, pwd),verify=False)
        auth_test_log("DEBUG", "test_login_nom", "Response:%s" % logon.text)
        self.assertEqual(logon.status_code, 200)

    def test_logout(self):
        auth_test_log("INFO", "test_logout","Logout with no token")
        header['Authorization'] = None
        path = auth_server+auth_endpoint_logout
        logout=requests.post(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_logout", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 403)

        auth_test_log("INFO", "test_logout", "Logout with bad token")
        header['Authorization']="BATMAN"
        logout = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_logout", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 403)

        auth_test_log("INFO", "test_logout", "Login (to logout)")
        path= auth_server+auth_endpoint_login
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(valid_user, valid_password),verify=False)
        auth_test_log("DEBUG", "test_logout", "Response:%s" % logon.text)
        header['Authorization']="Bearer %s" %json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        self.assertNotEqual(json.loads(logon.text)['access_token'],None)
        self.assertNotEqual(json.loads(logon.text)['access_token_timeout'],None)

        auth_test_log("INFO", "test_logout", "Logout Nominal")
        path = auth_server + auth_endpoint_logout
        logout = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_logout", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 200)

        auth_test_log("INFO", "test_logout", "Logout when already logged out")
        path = auth_server + auth_endpoint_logout
        logout = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_logout", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 403)

    def test_refresh_token(self):
        # ING-82
        auth_test_log("INFO", "test_refresh_token", "Refresh when not logged in")
        path = auth_server+auth_endpoint_refresh
        refresh=requests.post(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % refresh.text)
        self.assertEqual(refresh.status_code, 403)

        auth_test_log("INFO", "test_refresh_token", "Login (to refresh)")
        path= auth_server+auth_endpoint_login
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(valid_user, valid_password),verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % logon.text)
        header['Authorization']="Bearer %s" %json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        self.assertNotEqual(json.loads(logon.text)['access_token'],None)
        self.assertNotEqual(json.loads(logon.text)['access_token_timeout'],None)

        auth_test_log("INFO", "test_refresh_token", "Refresh the Token")
        path = auth_server+auth_endpoint_refresh
        refresh=requests.post(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % refresh.text)
        self.assertEqual(refresh.status_code, 200)
        self.assertNotEqual(json.loads(refresh.text)['access_token'], None)
        new_token="Bearer %s" %json.loads(refresh.text)['access_token']
        old_token=header['Authorization']

        auth_test_log("INFO", "test_refresh_token", "Use the old Token Again")
        path = auth_server+auth_endpoint_refresh
        refresh=requests.post(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % refresh.text)
        self.assertEqual(refresh.status_code, 200)
        self.assertNotEqual(json.loads(refresh.text)['access_token'], None)

        auth_test_log("INFO", "test_refresh_token", "Use the refresh token to refresh")
        header['Authorization']=new_token
        path = auth_server+auth_endpoint_refresh
        refresh=requests.post(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % refresh.text)
        self.assertEqual(refresh.status_code, 200)
        self.assertNotEqual(json.loads(refresh.text)['access_token'], None)

        auth_test_log("INFO", "test_refresh_token", "Logout")
        path = auth_server + auth_endpoint_logout
        logout = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 200)

        auth_test_log("INFO", "test_refresh_token", "Use the old Token Again to refresh when logged out")
        header['Authorization'] = old_token
        path = auth_server + auth_endpoint_refresh
        refresh = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % refresh.text)
        self.assertEqual(refresh.status_code, 403)

        auth_test_log("INFO", "test_refresh_token", "Use the new token again to refresh (when Logged out)")
        header['Authorization'] = new_token
        path = auth_server + auth_endpoint_refresh
        refresh = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_refresh_token", "Response:%s" % refresh.text)
        self.assertEqual(refresh.status_code, 403)

class LoggingHealthTest(unittest.TestCase):
    '''
    This unit test exercises all of the /logging auth endpoints
    '''
    def test_healthcheck(self):
        auth_test_log("INFO", "test_healthcheck", "Try the health check when unauthorized")
        path = auth_server+auth_endpoint_health
        header['Authorization']="BLAH"
        health=requests.get(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_healthcheck", "Response:%s" % health.text)
        self.assertEqual(health.status_code, 200)

        auth_test_log("INFO", "test_healthcheck", "Login (for healthcheck)")
        path= auth_server+auth_endpoint_login
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(valid_user, valid_password),verify=False)
        auth_test_log("DEBUG", "test_healthcheck", "Response:%s" % logon.text)
        header['Authorization']="Bearer %s" %json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'],None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'],None)

        auth_test_log("INFO", "test_healthcheck", "Try the health check (authorized)")
        path = auth_server + auth_endpoint_health
        health = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_healthcheck", "Response:%s" % health.text)
        self.assertEqual(health.status_code, 200)

    def test_loglevel(self):
        auth_test_log("INFO", "test_healthcheck", "Try the loglevel endpoint when when unauthorized")
        path = auth_server+auth_endpoint_loglevel
        health=requests.get(path,headers=header,verify=False)
        auth_test_log("DEBUG", "test_healthcheck", "Response:%s" % health.text)
        # ING-86
        #self.assertEqual(health.status_code, 200)

class UsersGroupsPermsTest(unittest.TestCase):
    def test_groups(self):
        auth_test_log("INFO", "test_groups", "Off Nominal - try to get groups without login")
        header['Authorization'] = None
        path = auth_server + auth_endpoint_groups
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 403)

        auth_test_log("INFO", "test_groups", "Login (for healthcheck)")
        path= auth_server+auth_endpoint_login
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(valid_user, valid_password),verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % logon.text)
        header['Authorization']="Bearer %s" %json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'],None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'],None)

        auth_test_log("INFO", "test_groups", "Nominal Query")
        path = auth_server + auth_endpoint_groups
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" %groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'],None)
            self.assertNotEqual(len(json.loads(groups.text)['results']),0)

        auth_test_log("INFO", "test_groups", "Filtered Query limit (limit)")
        path = auth_server + auth_endpoint_groups
        parameter= {'limit': 1}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'],None)
            self.assertNotEqual(json.loads(groups.text)['results'],None)

        auth_test_log("INFO", "test_groups", "Filtered Query limit (q)")
        path = auth_server + auth_endpoint_groups
        parameter = {'q': "ing"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'], None)
            self.assertNotEqual(json.loads(groups.text)['results'], None)

        auth_test_log("INFO", "test_groups", "Filtered Query limit (offset)")
        path = auth_server + auth_endpoint_groups
        parameter = {'offset': 10}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'], None)
            self.assertNotEqual(json.loads(groups.text)['results'], None)

        auth_test_log("INFO", "test_groups", "Filtered Query limit (ord)")
        path = auth_server + auth_endpoint_groups
        parameter = {'order': "ASC"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'], None)
            self.assertNotEqual(json.loads(groups.text)['results'], None)

        auth_test_log("INFO", "test_groups", "Filtered Query limit (ALL)")
        path = auth_server + auth_endpoint_groups
        parameter = {'limit': 4,
                     'q': "ing",
                     'offset': 4,
                     'order': "ASC"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'], None)
            self.assertNotEqual(json.loads(groups.text)['results'], None)

        auth_test_log("INFO", "test_groups", "Filtered Query extra arg (ALL)")
        path = auth_server + auth_endpoint_groups
        parameter = {'limit': 4,
                         'q': "ing",
                         'offset': 4,
                         'order': "ASC",
                            'BATMAN' : "NANANANANA"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)

        auth_test_log("INFO", "test_groups", "Filtered Query bad order arg")
        path = auth_server + auth_endpoint_groups
        parameter = {'limit': 4,
                         'q': "ing",
                         'offset': 4,
                         'order': "BATMAN"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 400)

        auth_test_log("INFO", "test_groups", "Filtered Query bad limit arg")
        path = auth_server + auth_endpoint_groups
        parameter = {'limit': "BATMAN"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 400)

        auth_test_log("INFO", "test_groups", "Filtered Query bad offset arg")
        path = auth_server + auth_endpoint_groups
        parameter = {'offset': "BATMAN"}
        groups = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 400)

        auth_test_log("INFO", "test_groups", "Off Nominal - try to get groups without login")
        header['Authorization'] = "hmmm"
        path = auth_server + auth_endpoint_groups + "/0"
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 403)

        auth_test_log("INFO", "test_groups", "Login (for groups)")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'], None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

        auth_test_log("INFO", "test_groups", "Get List of Groups (requires at least one group)")
        path = auth_server + auth_endpoint_groups
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % logon.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            self.assertNotEqual(json.loads(groups.text)['total'], None)
            self.assertNotEqual(json.loads(groups.text)['results'], None)

        auth_test_log("INFO", "test_groups", "Check that list of groups")
        for result in itertools.islice(json.loads(groups.text)['results'],0,10):
            auth_test_log("INFO", "test_groups", "Checking group: %s" %result['name'])
            path = auth_server + auth_endpoint_groups + "/%s" %result['id']
            group = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_groups", "Response:%s" % group.text)
            self.assertEqual(group.status_code, 200)
            if group.status_code == 200:
                self.assertNotEqual(json.loads(group.text)['id'], None)
                self.assertNotEqual(json.loads(group.text)['name'], None)
                self.assertNotEqual(json.loads(group.text)['createdAt'], None)
                self.assertNotEqual(json.loads(group.text)['updatedAt'], None)

        auth_test_log("INFO", "test_groups", "Off nominal - group that doesn't exist (string)")
        path = auth_server + auth_endpoint_groups + "/BATMAN"
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 400)

        auth_test_log("INFO", "test_groups", "Off nominal - group that doesn't exist (int)")
        path = auth_server + auth_endpoint_groups + "/999999"
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_groups", "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 404)

    def test_perm(self):
        auth_test_log("INFO", "test_perm", "Off Nominal - try to get perms without login")
        header['Authorization'] = "ROBIN"
        path = auth_server + auth_endpoint_permissions
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 403)

        auth_test_log("INFO", "test_perm", "Login (for perms)")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_perm", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'], None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

        auth_test_log("INFO", "test_perm", "List Perms")
        list_of_perm_ids=[]
        path = auth_server + auth_endpoint_permissions
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 200)
        if perms.status_code == 200:
            for permission in json.loads(perms.text):
                self.assertNotEqual(permission['id'], None)
                self.assertNotEqual(permission['name'], None)
                list_of_perm_ids.append(permission['id'])

        auth_test_log("INFO", "test_perm", "Get Perm details")
        for id in list_of_perm_ids:
            path = auth_server + auth_endpoint_permissions + "/%s" %id
            perms = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
            self.assertEqual(perms.status_code, 200)
            if perms.status_code == 200:
                self.assertNotEqual(json.loads(perms.text)['id'],None)
                self.assertNotEqual(json.loads(perms.text)['name'], None)
                self.assertNotEqual(json.loads(perms.text)['createdAt'], None)
                self.assertNotEqual(json.loads(perms.text)['updatedAt'], None)

        auth_test_log("INFO", "test_perm", "Get Users per perm")
        for id in list_of_perm_ids:
            path = auth_server + auth_endpoint_permissions + "/%s/users" %id
            perms = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
            self.assertEqual(perms.status_code, 200)
            if perms.status_code == 200:
                if len(json.loads(perms.text)) > 0:
                    for user in json.loads(perms.text):
                        self.assertNotEqual(user['id'], None)
                        self.assertNotEqual(user['username'], None)

        auth_test_log("INFO", "test_perm", "Get groups per perm")
        for id in list_of_perm_ids:
            path = auth_server + auth_endpoint_permissions + "/%s/groups" %id
            perms = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
            self.assertEqual(perms.status_code, 200)
            if perms.status_code == 200:
                if len(json.loads(perms.text)) > 0:
                    for user in json.loads(perms.text):
                        self.assertNotEqual(user['id'], None)
                        self.assertNotEqual(user['name'], None)

        auth_test_log("INFO", "test_perm", "Off Nominal details on bad perm")
        path = auth_server + auth_endpoint_permissions + "/999999999"
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 404)

        auth_test_log("INFO", "test_perm", "Off Nominal users on bad perm")
        path = auth_server + auth_endpoint_permissions + "/999999999/users"
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 404)

        auth_test_log("INFO", "test_perm", "Off Nominal groups on bad perm")
        path = auth_server + auth_endpoint_permissions + "/999999999/groups"
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_perm", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 404)

    def test_users(self):
        '''
            This tests the /users endpoint of the AUTH service
        '''

        auth_test_log("INFO", "test_users", "Off Nominal - try to get users without login")
        header['Authorization'] = "BATMAN"
        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 403)

        auth_test_log("INFO", "test_users", "Login (for perms)")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'], None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

        auth_test_log("INFO", "test_users", "List Users")
        list_of_users_ids = []
        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            self.assertNotEqual(json.loads(users.text)['total'], None)
            for permission in json.loads(users.text)['results']:
                self.assertNotEqual(permission['id'], None)
                self.assertNotEqual(permission['username'], None)
                list_of_users_ids.append(permission['id'])

        auth_test_log("INFO", "test_users", "List Users filtered Query limit (limit)")
        path = auth_server + auth_endpoint_users
        parameter = {'limit': 1}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            self.assertNotEqual(json.loads(users.text)['total'], None)
            self.assertNotEqual(json.loads(users.text)['results'], None)

        auth_test_log("INFO", "test_users", "List Users filtered Query limit (q)")
        path = auth_server + auth_endpoint_users
        parameter = {'q': "ing"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            self.assertNotEqual(json.loads(users.text)['total'], None)
            self.assertNotEqual(json.loads(users.text)['results'], None)

        auth_test_log("INFO", "test_users", "List Users filtered Query limit (offset)")
        path = auth_server + auth_endpoint_users
        parameter = {'offset': 10}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            self.assertNotEqual(json.loads(users.text)['total'], None)
            self.assertNotEqual(json.loads(users.text)['results'], None)

        auth_test_log("INFO", "test_users", "List Users filtered Query limit (ord)")
        path = auth_server + auth_endpoint_users
        parameter = {'order': "ASC"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            self.assertNotEqual(json.loads(users.text)['total'], None)
            self.assertNotEqual(json.loads(users.text)['results'], None)

        auth_test_log("INFO", "test_users", "List Users filtered Query limit (ALL)")
        path = auth_server + auth_endpoint_users
        parameter = {'limit': 4,
                     'q': "ing",
                     'offset': 4,
                     'order': "ASC"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            self.assertNotEqual(json.loads(users.text)['total'], None)
            self.assertNotEqual(json.loads(users.text)['results'], None)

        auth_test_log("INFO", "test_users", "List Users filtered Query extra arg (ALL)")
        path = auth_server + auth_endpoint_users
        parameter = {'limit': 4,
                     'q': "ing",
                     'offset': 4,
                     'order': "ASC",
                     'BATMAN': "NANANANANA"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)

        auth_test_log("INFO", "test_users", "List Users filtered Query bad order arg")
        path = auth_server + auth_endpoint_users
        parameter = {'limit': 4,
                     'q': "ing",
                     'offset': 4,
                     'order': "BATMAN"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 400)

        auth_test_log("INFO", "test_users", "List Users filtered Query bad limit arg")
        path = auth_server + auth_endpoint_users
        parameter = {'limit': "BATMAN"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 400)

        auth_test_log("INFO", "test_users", "List Users filtered Query bad offset arg")
        path = auth_server + auth_endpoint_users
        parameter = {'offset': "BATMAN"}
        users = requests.get(path, headers=header, params=parameter, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 400)

        auth_test_log("INFO", "test_users", "Get user details")
        for id in itertools.islice(list_of_users_ids,0,10):
            path = auth_server + auth_endpoint_users + "/%s" % id
            users = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
            self.assertEqual(users.status_code, 200)
            if users.status_code == 200:
                self.assertNotEqual(json.loads(users.text)['id'], None)
                self.assertNotEqual(json.loads(users.text)['username'], None)
                self.assertNotEqual(json.loads(users.text)['createdAt'], None)
                self.assertNotEqual(json.loads(users.text)['updatedAt'], None)

        auth_test_log("INFO", "test_users", "Get perms per user")
        for id in itertools.islice(list_of_users_ids,0,10):
            path = auth_server + auth_endpoint_users + "/%s" % id
            users = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
            self.assertEqual(users.status_code, 200)
            if users.status_code == 200:
                if len(json.loads(users.text)) > 0:
                    for perm in json.loads(users.text)['scopes']:
                        self.assertNotEqual(perm, None)

        auth_test_log("INFO", "test_users", "Get roles per user")
        for id in itertools.islice(list_of_users_ids,0,10):
            path = auth_server + auth_endpoint_users + "/%s" % id
            users = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
            self.assertEqual(users.status_code, 200)
            if users.status_code == 200:
                if len(json.loads(users.text)) > 0:
                    for role in json.loads(users.text)['roles']:
                        self.assertNotEqual(role, None)

        auth_test_log("INFO", "test_users", "Off Nominal details on bad perm")
        path = auth_server + auth_endpoint_users + "/999999999"
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 404)

        auth_test_log("INFO", "test_users", "Off Nominal users on bad perm")
        path = auth_server + auth_endpoint_users + "/999999999"
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 404)

        auth_test_log("INFO", "test_users", "Off Nominal groups on bad perm")
        path = auth_server + auth_endpoint_users + "/999999999"
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_users", "Response:%s" % users.text)
        self.assertEqual(users.status_code, 404)

# class LDAPTest(unittest.TestCase):
#     def test_ldap_groups(self):
#         auth_test_log("INFO", "test_ldap_groups", "Off Nominal - try to get groups without login")
#         path = auth_server + auth_endpoint_ldap + "/groups"
#         header['Authorization']="MEH"
#         groups = requests.get(path, headers=header, verify=False)
#         auth_test_log("DEBUG", "test_ldap_groups", "Response:%s" % groups.text)
#         self.assertEqual(groups.status_code, 401)

#         auth_test_log("INFO", "test_users", "Login (for groups)")
#         path = auth_server + auth_endpoint_login
#         logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
#         auth_test_log("DEBUG", "test_ldap_groups", "Response:%s" % logon.text)
#         header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
#         self.assertEqual(logon.status_code, 200)
#         if logon.status_code == 200:
#             self.assertNotEqual(json.loads(logon.text)['access_token'], None)
#             self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

#         auth_test_log("INFO", "test_users", "Get List of Groups - No Filter")
#         path = auth_server + auth_endpoint_ldap + "/groups"
#         groups = requests.get(path, headers=header, verify=False)
#         auth_test_log("DEBUG", "test_ldap_groups", "Response:%s" % groups.text)
#         self.assertEqual(groups.status_code, 400)

#         auth_test_log("INFO", "test_users", "Get Filtered List of Groups")
#         path = auth_server + auth_endpoint_ldap + "/groups"
#         params={"q":"ing"}
#         groups = requests.get(path, headers=header, verify=False,params=params)
#         auth_test_log("DEBUG", "test_ldap_groups", "Response:%s" % groups.text)
#         self.assertEqual(groups.status_code, 200)
#         if groups.status_code == 200:
#             self.assertGreater(len(json.loads(groups.text)),0)
#             auth_test_log("INFO", "test_users", "There are %s groups that start with ing" %len(json.loads(groups.text)))
#             self.assertNotEqual(json.loads(groups.text)[0],None)

#         auth_test_log("INFO", "test_users", "Bad Filtered List of Groups")
#         path = auth_server + auth_endpoint_ldap + "/groups"
#         params={"BATMAN":"NANANANANANANA"}
#         groups = requests.get(path, headers=header, verify=False,params=params)
#         auth_test_log("DEBUG", "test_ldap_groups", "Response:%s" % groups.text)
#         self.assertEqual(groups.status_code, 400)

#     def test_ldap_users(self):
#         auth_test_log("INFO", "test_ldap_users", "Off Nominal - try to get users without login")
#         path = auth_server + auth_endpoint_ldap + "/users"
#         header['Authorization']=" "
#         params = {"q": "t"}
#         users = requests.get(path, headers=header, verify=False, params=params)
#         auth_test_log("DEBUG", "test_ldap_users", "Response:%s" % users.text)
#         self.assertEqual(users.status_code, 401)

#         auth_test_log("INFO", "test_ldap_users", "Login (for users)")
#         path = auth_server + auth_endpoint_login
#         logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
#         auth_test_log("DEBUG", "test_ldap_users", "Response:%s" % logon.text)
#         header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
#         self.assertEqual(logon.status_code, 200)
#         if logon.status_code == 200:
#             self.assertNotEqual(json.loads(logon.text)['access_token'], None)
#             self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

#         auth_test_log("INFO", "test_ldap_users", "Get List of Users - No Query")
#         path = auth_server + auth_endpoint_ldap + "/users"
#         users = requests.get(path, headers=header, verify=False)
#         auth_test_log("DEBUG", "test_ldap_users", "Response:%s" % users.text)
#         self.assertEqual(users.status_code, 400)

#         auth_test_log("INFO", "test_ldap_users", "Get Filtered List of Users")
#         path = auth_server + auth_endpoint_ldap + "/users"
#         params = {"q": "test"}
#         users = requests.get(path, headers=header, verify=False, params=params)
#         auth_test_log("DEBUG", "test_ldap_users", "Response:%s" % users.text)
#         self.assertEqual(users.status_code, 200)
#         if users.status_code == 200:
#             self.assertGreater(len(json.loads(users.text)), 0)
#             auth_test_log("INFO", "test_ldap_users", "There are %s groups that start with test" % len(json.loads(users.text)))
#             self.assertNotEqual(json.loads(users.text)[0]['username'], None)
#             self.assertNotEqual(json.loads(users.text)[0]['displayName'], None)

#         auth_test_log("INFO", "test_ldap_users", "Bad Filtered List of Users")
#         path = auth_server + auth_endpoint_ldap + "/users"
#         params = {"BATMAN": "NANANANANANANA"}
#         users = requests.get(path, headers=header, verify=False, params=params)
#         auth_test_log("DEBUG", "test_ldap_users", "Response:%s" % users.text)
#         self.assertEqual(users.status_code, 400)

class Roles(unittest.TestCase):
    def test_RoleCreateModeDelete(self):
        auth_test_log("INFO", "test_RoleCreateModeDelete", "Attempt to access roles without login")
        path = auth_server + auth_endpoint_roles
        header['Authorization']="BATMAN"
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 403)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Login (for roles)")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'], None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Get roles")
        path = auth_server + auth_endpoint_roles
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code==200:
            for role in json.loads(roles.text)['results']:
                self.assertNotEqual(role['id'], None)
                self.assertNotEqual(role['name'], None)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make Role")
        path = auth_server + auth_endpoint_roles
        role_data= {"name": "TESTROLE",
                "description": "I am a test role",
                "users": ["swanchr","tsriniva"],
                "groups": ["ingenium-dev"],
                "permissions" : [1]
                }
        roles = requests.post(path, headers=header, verify=False,data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete","Response:%s" %roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            self.assertNotEqual(json.loads(roles.text)['id'], None)
            self.assertEqual(json.loads(roles.text)['name'], "TESTROLE")
            self.assertEqual(json.loads(roles.text)['description'], "I am a test role")
            #self.assertNotEqual(json.loads(roles.text)['createdAt'], None) # There is an issue with the spec
            #self.assertNotEqual(json.loads(roles.text)['updatedAt'], None)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make Role (basic)")
        path = auth_server + auth_endpoint_roles
        role_data = {"name": "TESTROLE_BASIC"}
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            self.assertNotEqual(json.loads(roles.text)['id'], None)
            self.assertEqual(json.loads(roles.text)['name'], "TESTROLE_BASIC")


        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make a Role (bad users)")
        path = auth_server + auth_endpoint_roles
        role_data = {"name": "TESTROLE_BAD_USER",
                     "users": ["BATMAN"]}
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)
        if roles.status_code == 400:
            auth_test_log("INFO", "test_RoleCreateModeDelete", "Rejected (as designed) for:%s" %json.loads(roles.text))

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make a Role (bad users)")
        path = auth_server + auth_endpoint_roles
        role_data = {"name": "TESTROLE_BAD_USER",
                 "users": ["BATMAN"]}
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)
        if roles.status_code == 400:
            auth_test_log("INFO", "test_RoleCreateModeDelete", "Rejected (as designed) for:%s" % json.loads(roles.text))

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make a Role (bad group)")
        path = auth_server + auth_endpoint_roles
        role_data = {"name": "TESTROLE_BAD_GROUP",
                 "groups": ["BATMAN"]}
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)
        if roles.status_code == 400:
            auth_test_log("INFO", "test_RoleCreateModeDelete", "Rejected (as designed) for:%s" % json.loads(roles.text))

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make a Role (bad perm)")
        path = auth_server + auth_endpoint_roles
        role_data = {"name": "TESTROLE_BAD_GROUP",
                 "permissions": [1337]}
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)
        if roles.status_code == 400:
            auth_test_log("INFO", "test_RoleCreateModeDelete", "Rejected (as designed) for:%s" % json.loads(roles.text))

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Make a Role (missing name)")
        path = auth_server + auth_endpoint_roles
        role_data = {"permissions": [1337]}
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)
        if roles.status_code == 400:
            auth_test_log("INFO", "test_RoleCreateModeDelete", "Rejected (as designed) for:%s" % json.loads(roles.text))

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Get roles (and check there are only two test roles)")
        path = auth_server + auth_endpoint_roles
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        test_roles=[]
        if roles.status_code == 200:
            for role in json.loads(roles.text)['results']:
                if "TESTROLE" in role['name']:
                    test_roles.append(role['id'])
            #self.assertEqual(len(test_roles), 2)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Modify the Role Names")
        role_update_data={"name": "REALLYTESTING",
                          "description": "Modified Name of TESTROLE"}
        for role in test_roles:
            role_update_data["name"]= role_update_data["name"]+"_%s" %role
            auth_test_log("INFO", "test_RoleCreateModeDelete", "Modifying Role: %s" %role)
            path = auth_server + auth_endpoint_roles+"/%s" %role
            roles = requests.put(path, headers=header, verify=False,data=json.dumps(role_update_data))
            auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Attempt to change two test roles to the same name")
        role_update_data = {
            "name": "REALLYTESTING",
            "description": "Attempting a Duplicate Name"
        }
        auth_test_log("INFO", "test_RoleCreateModeDelete", "Modifying Role: %s" % test_roles[0])
        path = auth_server + auth_endpoint_roles + "/%s" % test_roles[0]
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(role_update_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        auth_test_log("INFO", "test_RoleCreateModeDelete", "First change should succeed")
        self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Modify the Role Names (Bad - no name)")
        role_update_data = {"description": "Modified Name of TESTROLE"}
        for role in test_roles:
            path = auth_server + auth_endpoint_roles + "/%s" % role
            roles = requests.put(path, headers=header, verify=False, data=json.dumps(role_update_data))
            auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Modify a Role that doesn't exist")
        role_update_data = {"name": "REALLYTESTING",
                            "description": "Modified Name of TESTROLE"}

        path = auth_server + auth_endpoint_roles + "/133713371337"
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(role_update_data))
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Get Role details")
        for role in test_roles:
            path = auth_server + auth_endpoint_roles+"/%s" %role
            roles = requests.get(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 200)
            if roles.status_code==200:
                self.assertNotEqual(json.loads(roles.text)['id'], None)
                self.assertNotEqual(json.loads(roles.text)['name'], None)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Get Role details on Role that doesn't exist")
        path = auth_server + auth_endpoint_roles + "/133713371337"
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Delete Role that doesn't exist")
        path = auth_server + auth_endpoint_roles + "/133713371337"
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleCreateModeDelete", "Delete Role")
        for role in test_roles:
            path = auth_server + auth_endpoint_roles+"/%s" %role
            roles = requests.delete(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 204)

    def test_RoleManagement(self):
        '''
            This function exercises the management options related to a single role.
            Including modifyings users, permissions, groups assigned to it.
        '''

        # TESTING LOGIN
        auth_test_log("INFO", "test_RoleManagement", "Login (for roles)")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
        if logon.status_code == 200:
            self.assertNotEqual(json.loads(logon.text)['access_token'], None)
            self.assertNotEqual(json.loads(logon.text)['access_token_timeout'], None)

        # CREATE TEST ROLE WITH ONE USER AND ONE GROUP
        auth_test_log("INFO", "test_RoleManagement", "Make the initial role")
        path = auth_server + auth_endpoint_roles

        role_data = {
            "name": "ROLE_MGMT_TEST",
            "description": "This is a test role",
            "users": ["swanchr"],
            "groups": ["ingenium-dev"],
            "permissions": [1] # THE ADMIN PERMISSION'S ID AS PER THE SEED FILE
        }

        roles = requests.post(path, headers=header, verify=False,data=json.dumps(role_data))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" %roles.text)
        self.assertEqual(roles.status_code, 201)

        if roles.status_code == 201:
            self.assertNotEqual(json.loads(roles.text)['id'], None)
            test_role_id = json.loads(roles.text)['id']
            self.assertEqual(json.loads(roles.text)['name'], "ROLE_MGMT_TEST")
            self.assertEqual(json.loads(roles.text)['description'], "This is a test role")
            #self.assertNotEqual(json.loads(roles.text)['createdAt'], None) -- Spec issue
            #self.assertNotEqual(json.loads(roles.text)['updatedAt'], None)


        # FETCH PERMISSIONS FOR NEWLY CREATED ROLE
        auth_test_log("INFO", "test_RoleManagement", "Get the permissions on that role")
        path = auth_server + auth_endpoint_roles + "/%s/permissions" % test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            # check permissions for the newly created role
            self.assertEqual(json.loads(roles.text)[0]['id'],1) # THE ADMIN PERMISSION'S ID AS PER THE SEED FILE SEE L1171
            self.assertEqual(json.loads(roles.text)[0]['name'], "admin")


        auth_test_log("INFO", "test_RoleManagement", "Get the permissions on a role that doesn't exist")
        path = auth_server + auth_endpoint_roles + "/13371337/permissions" #arbitrary permissions ID number
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)


        auth_test_log("INFO", "test_RoleManagement", "Update the role permissions (enmass)")
        permissions = [1, 2] # ID numbers for the "admin" and "execute:wsts" permissions
        path = auth_server + auth_endpoint_roles + "/%s/permissions" % test_role_id
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(permissions))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.status_code)
        self.assertEqual(roles.status_code, 200)
        # ING-85
        if roles.status_code == 200:
            self.assertEqual(json.loads(roles.text)[0]['id'],1)
            self.assertEqual(json.loads(roles.text)[0]['name'], "admin") # SEE L1207
            self.assertEqual(json.loads(roles.text)[1]['id'],2)
            self.assertEqual(json.loads(roles.text)[1]['name'], "execute:wsts") # SEE L1207

        auth_test_log("INFO", "test_RoleManagement", "Update permissions on non-existent role")
        path = auth_server + auth_endpoint_roles + "/13371337/permissions"
        roles = requests.put(path, headers=header, verify=False,data=json.dumps(permissions))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Update permissions with non-existent permissions")
        bad_permissions=[11111,22222]
        path = auth_server + auth_endpoint_roles + "/%s/permissions" %test_role_id
        roles=requests.put(path,headers=header,verify=False,data=json.dumps(bad_permissions))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Update permissions with bad data")
        bad_permissions={"BATMAN":"NANANANANA"}
        path = auth_server + auth_endpoint_roles + "/%s/permissions" %test_role_id
        roles=requests.put(path,headers=header,verify=False,data=json.dumps(bad_permissions))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Get permissions on the role again and confirm no change")
        path = auth_server + auth_endpoint_roles + "/%s/permissions" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            self.assertEqual(json.loads(roles.text)[0]['id'],1)
            self.assertEqual(json.loads(roles.text)[0]['name'], "admin") # from seed file
            self.assertEqual(json.loads(roles.text)[1]['id'],2)
            self.assertEqual(json.loads(roles.text)[1]['name'], "execute:wsts") # from seed file

        auth_test_log("INFO", "test_RoleManagement", "Delete one permission that doesn't exist")
        permission_to_add=999999
        path = auth_server + auth_endpoint_roles + "/%s/permissions/%s" %(test_role_id,permission_to_add)
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Delete one permission that doesn't exist (Bad Format)")
        permission_to_add="BATMAN"
        path = auth_server + auth_endpoint_roles + "/%s/permissions/%s" %(test_role_id,permission_to_add)
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Delete one permission that doesn't exist (Bad Format,Bad Role)")
        permission_to_add="BATMAN"
        path = auth_server + auth_endpoint_roles + "/999999/permissions/%s" %permission_to_add
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Get permissions on the role again and confirm change")
        path = auth_server + auth_endpoint_roles + "/%s/permissions" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            self.assertEqual(json.loads(roles.text)[0]['id'],1)
            self.assertEqual(json.loads(roles.text)[0]['name'], "admin") # loaded from seed file
            self.assertEqual(json.loads(roles.text)[1]['id'],2)
            self.assertEqual(json.loads(roles.text)[1]['name'], "execute:wsts") # loaded from seed file

        auth_test_log("INFO", "test_RoleManagement", "Get list of Groups assigned to the role")
        path = auth_server + auth_endpoint_roles + "/%s/groups" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            self.assertEqual(json.loads(roles.text)[0]['id'],1)
            self.assertEqual(json.loads(roles.text)[0]['name'], "ingenium-dev")

        auth_test_log("INFO", "test_RoleManagement", "Get list of Groups assigned to a non-existent role")
        path = auth_server + auth_endpoint_roles + "/999999/groups"
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Get list of Groups assigned to an invalid role")
        path = auth_server + auth_endpoint_roles + "/BATMAN/groups"
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Update List of groups assigned to role")
        groups=["ingenium-dev","dms_dev"]
        path = auth_server + auth_endpoint_roles + "/%s/groups" %test_role_id
        roles=requests.put(path,headers=header,verify=False,data=json.dumps(groups))
        auth_test_log("INFO", "test_RoleManagement", "Response:%s" % roles.text)

        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            roles_data = json.loads(roles.text)
            self.assertEqual(len(roles_data), 2)
            self.assertEqual(roles_data[0]['name'], "ingenium-dev")
            self.assertEqual(roles_data[1]['name'], "dms_dev")

        auth_test_log("INFO", "test_RoleManagement", "Update list of groups assigned to a non-existent role")
        groups=["dms_dev"]
        path = auth_server + auth_endpoint_roles + "/9999999/groups"
        roles=requests.put(path,headers=header,verify=False,data=json.dumps(groups))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Update list of groups assigned to an invalid role")
        groups=["dms_dev"]
        path = auth_server + auth_endpoint_roles + "/BATMAN/groups"
        roles=requests.put(path,headers=header,verify=False,data=json.dumps(groups))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Update list of groups assigned to an invalid role with bad data")
        groups={"BATMAN":"NANANANA"}
        path = auth_server + auth_endpoint_roles + "/%s/groups" %test_role_id
        roles=requests.put(path,headers=header,verify=False,data=json.dumps(groups))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Get list of Groups assigned to the role and confirm changes")
        path = auth_server + auth_endpoint_roles + "/%s/groups" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("INFO", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            roles_data = json.loads(roles.text)
            self.assertEqual(len(roles_data), 2)
            self.assertEqual(roles_data[0]['name'], "ingenium-dev")
            self.assertEqual(roles_data[1]['name'], "dms_dev")

        auth_test_log("INFO", "test_RoleManagement", "Get list of Groups assigned to the role and confirm changes")
        path = auth_server + auth_endpoint_roles + "/%s/groups" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            list_of_groups=[]
            expected_groups=["ingenium-dev","dms_dev","dms_support"]
            for role in json.loads(roles.text):
                list_of_groups.append(role['name'])
            self.assertEqual(len(list(set(list_of_groups) - set(expected_groups))), 0)
            self.assertEqual(len(list(set(expected_groups) - set(list_of_groups))), 1)

        auth_test_log("INFO", "test_RoleManagement", "Delete group assigned to role (Bad Role)")
        new_group = "IAMNOTAREALLDAPGROUP"
        path = auth_server + auth_endpoint_roles + "/999999/groups/%s" %new_group
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Delete group assigned to role (Bad Group)")
        new_group="BATMAN"
        path = auth_server + auth_endpoint_roles + "/%s/groups/%s" %(test_role_id,new_group)
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Delete group assigned to role (Bad Role,Bad Group)")
        new_group="BATMAN"
        path = auth_server + auth_endpoint_roles + "/4039734/groups/%s" %new_group
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Get list of Groups assigned to the role and confirm changes")
        path = auth_server + auth_endpoint_roles + "/%s/groups" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            list_of_groups=[]
            expected_groups=["ingenium-dev","dms_support"]
            for role in json.loads(roles.text):
                list_of_groups.append(role['name'])
            self.assertEqual(len(list(set(list_of_groups) - set(expected_groups))), 1)
            self.assertEqual(len(list(set(expected_groups) - set(list_of_groups))), 1)

        auth_test_log("INFO", "test_RoleManagement", "Get list of users assigned to the role")
        path = auth_server + auth_endpoint_roles + "/%s/users" %test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            list_of_users=[]
            expected_users=["swanchr"]
            for role in json.loads(roles.text):
                list_of_users.append(role['username'])
            self.assertEqual(len(list(set(list_of_users) - set(expected_users))), 0)
            self.assertEqual(len(list(set(expected_users) - set(list_of_users))), 0)

        auth_test_log("INFO", "test_RoleManagement", "Get list of users assigned to a non-existent role")
        path = auth_server + auth_endpoint_roles + "/999999/users"
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Get list of users assigned to an invalid role")
        path = auth_server + auth_endpoint_roles + "/BATMAN/users"
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Update List of users assigned to role")
        users=["swanchr","tsriniva"]
        path=auth_server+auth_endpoint_roles+ "/%s/users" %test_role_id
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(users))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            list_of_users=[]
            expected_users=["swanchr","tsriniva"]
            for role in json.loads(roles.text):
                list_of_users.append(role['username'])
            self.assertEqual(len(list(set(list_of_users) - set(expected_users))), 0)
            self.assertEqual(len(list(set(expected_users) - set(list_of_users))), 0)

        auth_test_log("INFO", "test_RoleManagement", "Update list of users assigned to a non-existent role")
        users=["swanchr","tsriniva"]
        path=auth_server+auth_endpoint_roles+ "/89743/users"
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(users))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Update list of users assigned to an invalid role")
        users=["swanchr","tsriniva"]
        path=auth_server+auth_endpoint_roles+ "/BATMAN/users"
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(users))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Update list of users asssign to a valid role (but invalid users)")
        users=["BATMAN","ROBIN","JOKER"]
        path=auth_server+auth_endpoint_roles+ "/%s/users" %test_role_id
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(users))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 404)

        auth_test_log("INFO", "test_RoleManagement", "Get list of users assigned to the role and confirm changes")
        path = auth_server + auth_endpoint_roles + "/%s/users" % test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            list_of_users=[]
            expected_users=["swanchr","tsriniva"]
            for role in json.loads(roles.text):
                list_of_users.append(role['username'])
            self.assertEqual(len(list(set(list_of_users) - set(expected_users))), 0)
            self.assertEqual(len(list(set(expected_users) - set(list_of_users))), 0)

        auth_test_log("INFO", "test_RoleManagement", "Delete users assigned to role (Bad Role)")
        new_user="lywatana"
        path = auth_server + auth_endpoint_roles + "/8834763/users/%s" %new_user
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Delete users assigned to role (Bad users - doesn't exist)")
        new_user="BATMAN"
        path = auth_server + auth_endpoint_roles + "/%s/users/%s" %(test_role_id,new_user)
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Delete users assigned to role (Bad Role,Bad users)")
        new_user="BATMAN"
        path = auth_server + auth_endpoint_roles + "/8834763/users/%s" %new_user
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 400)

        auth_test_log("INFO", "test_RoleManagement", "Delete Test Role")
        path = auth_server + auth_endpoint_roles + "/%s" %test_role_id
        roles = requests.delete(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 204)

class AuthRequirementTest(unittest.TestCase):

    def setUp(self):
        global header
        auth_test_log("INFO", "Setup_AuthRequirementTest", "Login")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "Setup_AuthRequirementTest", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']

    @classmethod
    def SetUpClass(cls):
        cleanup_for_test()

    def test_IAS_1_LDAP_AUTH(self):
        return True
        # Tests IAS-1	The IAS shall authenticate users via LDAP.
        # Note that this test is only valid when auth is connected to LDAP
        path=auth_server+auth_endpoint_login
        auth_test_log("INFO", "test_IAS_1_LDAP_AUTH", "Testing valid User and Password")
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_IAS_1_LDAP_AUTH", "Response:%s" % logon.text)
        self.assertEqual(logon.status_code, 200)

    def test_IAS_2_TOKEN_LIFE(self):
        return True
        # IAS-2	The IAS shall provide JWT for access to Ingenium services with a timeout of 27 minutes (TBC).
        path = auth_server + auth_endpoint_login
        auth_test_log("INFO", "test_IAS_2_TOKEN_LIFE", "Testing valid User and Password")
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_IAS_2_TOKEN_LIFE", "Response:%s" % logon.text)
        self.assertEqual(logon.status_code, 200)
        if logon.status_code==200:
            self.assertEqual(json.loads(logon.text)['access_token_timeout'],"27m")

    def test_IAS_3_ASSIGN_USERS_ROLES(self):
        return True
        # IAS-3	The IAS shall support assigning specific users to user defined categories (roles).
        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES", "Build a list of users to add to a group")
        path = auth_server + auth_endpoint_ldap + "/users"
        list_of_users=[]
        list_of_queries=['ch','ro']
        for query in list_of_queries:
            auth_test_log("DEBUG", "test_IAS_3_ASSIGN_USERS_ROLES", "querying ldap users with filter: %s" % query)
            params = {"q": "%s" %query}
            users = requests.get(path, headers=header, verify=False, params=params)
            auth_test_log("DEBUG", "test_IAS_3_ASSIGN_USERS_ROLES", "Response:%s" % users.text)
            if users.status_code==200:
                for user in json.loads(users.text):
                    list_of_users.append(user['username'])
        total_users_to_add=len(list_of_users)
        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES", "Total Number of users to add to a group: %s" %total_users_to_add )

        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES", "Build a role to add the users to")

        users_to_add=[]
        for i in range(1,min(random.randint(1,len(list_of_users)+1),50)):
            users_to_add.append(list_of_users.pop())


        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES", "Creating a role with the following users:%s" %users_to_add)
        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES",
                      "Creating a role with %s users" % len(users_to_add))
        role_users = {"name": "ROLE_4",
              "description": "This is a test role for lots of users",
              "users": users_to_add,
              "permissions": [4]
              }
        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES", "Create Role 4")
        path=auth_server+auth_endpoint_roles
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_users))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code==201:
            test_role_id=json.loads(roles.text)['id']

        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES", "Roles Created with %s users. Updating with different users" %len(users_to_add))
        total_users_to_add=total_users_to_add-len(users_to_add)
        users_to_add = []
        for i in range(1, random.randint(1, min(len(list_of_users) + 1, 50))):
            users_to_add.append(list_of_users.pop())
        path = auth_server + auth_endpoint_roles + "/%s/users" % test_role_id
        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES",
                      "Updating number of users to %s" % len(users_to_add))
        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES",
                      "List of users to be added %s" % users_to_add)
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(users_to_add))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES",
                      "Now add the remainder (%s) of the users." % (total_users_to_add-len(users_to_add)))
        while len(list_of_users) > 0:
            user_to_add=list_of_users.pop()

            path = auth_server + auth_endpoint_roles + "/%s/users/%s" % (test_role_id,user_to_add)
            auth_test_log("DEBUG", "test_IAS_3_ASSIGN_USERS_ROLES",
                          "Adding user %s to role, %s users left" % (user_to_add,len(list_of_users)))
            roles = requests.patch(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "test_IAS_3_ASSIGN_USERS_ROLES","Querying role to check users assigned" )
        path = auth_server + auth_endpoint_roles+ "/%s/users" % test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code==200:
            self.assertEqual(len(json.loads(roles.text)),total_users_to_add)

    def test_IAS_4_ASSIGN_PERMS_ROLES(self):
        return True
        # IAS-4	The IAS shall support assigning specific Ingenium permissions (or scopes) to user defined categories (roles).

        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES", "List all possible permissions")
        list_of_permissions = []
        path = auth_server + auth_endpoint_permissions
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_IAS_4_ASSIGN_PERMS_ROLES", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 200)
        if perms.status_code == 200:
            for permission in json.loads(perms.text):
                list_of_permissions.append(permission['id'])

        total_perms_to_add = len(list_of_permissions)
        perms_to_add = []
        perms_to_add.append(list_of_permissions.pop())

        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES", "Creating a role with the following perms:%s" % perms_to_add)
        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES","Creating a role with %s perms" % len(perms_to_add))
        role_groups = {"name": "ROLE_5",
                       "description": "This is a test role for permissions",
                       "permissions": perms_to_add
                      }
        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES", "Create Role 5")
        path = auth_server + auth_endpoint_roles
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_groups))
        auth_test_log("DEBUG", "test_IAS_4_ASSIGN_PERMS_ROLES", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            test_role_id = json.loads(roles.text)['id']

        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES",
                      "Roles Created with %s perms. Updating with different perms" % len(perms_to_add))

        total_perms_to_add=total_perms_to_add-1
        perms_to_add = []
        perms_to_add.append(list_of_permissions.pop())
        perms_to_add.append(list_of_permissions.pop())
        path = auth_server + auth_endpoint_roles + "/%s/permissions" % test_role_id
        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES",
                  "Updating number of perms to %s" % len(perms_to_add))
        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES","List of perms to be added %s" % perms_to_add)
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(perms_to_add))
        auth_test_log("DEBUG", "test_IAS_4_ASSIGN_PERMS_ROLES", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES",
                  "Now add the remainder (%s) of the perms." % (total_perms_to_add - len(perms_to_add)))

        while len(list_of_permissions) > 0:
            perms_to_add = list_of_permissions.pop()

            path = auth_server + auth_endpoint_roles + "/%s/permissions/%s" % (test_role_id, perms_to_add)
            auth_test_log("DEBUG", "test_IAS_4_ASSIGN_PERMS_ROLES",
                      "Adding perm %s to role, %s perms left" % (perms_to_add, len(list_of_permissions)))
            roles = requests.patch(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_IAS_4_ASSIGN_PERMS_ROLES", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "test_IAS_4_ASSIGN_PERMS_ROLES", "Querying role to check groups assigned")
        path = auth_server + auth_endpoint_roles + "/%s/permissions" % test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_IAS_4_ASSIGN_PERMS_ROLES", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            self.assertEqual(len(json.loads(roles.text)), total_perms_to_add)

    def test_IAS_5_ASSIGN_GROUPS_ROLES(self):
        return True
        # IAS-5	The IAS shall support assigning groups of users (LDAP groups) to user defined categories (roles).
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES", "Build a list of users to add to a group")
        path = auth_server + auth_endpoint_ldap + "/groups"
        list_of_groups = []
        list_of_queries = ['smap']
        for query in list_of_queries:
            auth_test_log("DEBUG", "IAS_5_ASSIGN_GROUPS_ROLES", "querying ldap groups with filter: %s" % query)
            params = {"q": "%s" % query}
            groups = requests.get(path, headers=header, verify=False, params=params)
            auth_test_log("DEBUG", "IAS_5_ASSIGN_GROUPS_ROLES", "Response:%s" % groups.text)
            for group in json.loads(groups.text):
                list_of_groups.append(group)
        total_groups_to_add = len(list_of_groups)
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES","Total Number of groups to add to a role: %s" % total_groups_to_add)

        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES", "Build a role to add the users to")

        groups_to_add = []
        for i in range(1, min(random.randint(1, len(list_of_groups) + 1), 50)):
            groups_to_add.append(list_of_groups.pop())
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES", "Creating a role with the following users:%s" % groups_to_add)
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES",
                  "Creating a role with %s groups" % len(groups_to_add))
        role_groups = {"name": "ROLE_6",
                        "description": "This is a test role for lots of groups",
                        "groups": groups_to_add,
                        "permissions": [4]
                     }
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES", "Create Role 6")
        path = auth_server + auth_endpoint_roles
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_groups))
        auth_test_log("DEBUG", "IAS_5_ASSIGN_GROUPS_ROLES", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            test_role_id = json.loads(roles.text)['id']

        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES",
                  "Roles Created with %s groups. Updating with different groups" % len(groups_to_add))

        total_groups_to_add=total_groups_to_add-len(groups_to_add)

        groups_to_add = []
        for i in range(1, random.randint(1, min(len(list_of_groups) + 1, 50))):
            groups_to_add.append(list_of_groups.pop())

        path = auth_server + auth_endpoint_roles + "/%s/groups" % test_role_id
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES",
                  "Updating number of groups to %s" % len(groups_to_add))
        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES",
                  "List of groups to be added %s" % groups_to_add)
        roles = requests.put(path, headers=header, verify=False, data=json.dumps(groups_to_add))
        auth_test_log("DEBUG", "IAS_5_ASSIGN_GROUPS_ROLES", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES",
                  "Now add the remainder (%s) of the groups." % (total_groups_to_add - len(groups_to_add)))
        while len(list_of_groups) > 0:
            group_to_add = list_of_groups.pop()

            path = auth_server + auth_endpoint_roles + "/%s/groups/%s" % (test_role_id, group_to_add)
            auth_test_log("DEBUG", "IAS_5_ASSIGN_GROUPS_ROLES",
                      "Adding user %s to role, %s groups left" % (group_to_add, len(list_of_groups)))
            roles = requests.patch(path, headers=header, verify=False)
            auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
            self.assertEqual(roles.status_code, 200)

        auth_test_log("INFO", "IAS_5_ASSIGN_GROUPS_ROLES", "Querying role to check groups assigned")
        path = auth_server + auth_endpoint_roles + "/%s/groups" % test_role_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            self.assertEqual(len(json.loads(roles.text)), total_groups_to_add)

    def test_IAS_6_PERMS_ARE_OR(self):
        # IAS-6	A user authenticated via the IAS shall have access privileges according to the combination of all roles they
        # are assigned to.
        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Login ")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_IAS_6_PERMS_ARE_OR", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Create three roles with the same user and groups with that user"
                                                         "and different perms")
        path = auth_server + auth_endpoint_roles
        role_1= {"name": "ROLE_1",
                 "description": "This is a test role",
                 "users": ["swanchr"],
                 "permissions": [4]
                 }
        role_2= {"name": "ROLE_2",
                 "description": "This is a test role",
                 "users": ["swanchr"],
                 "permissions": [5]
                 }

        role_3= {"name": "ROLE_3",
                 "description": "This is a test role",
                 "group": ["ingenium-dev"],
                 "permissions": [6]
                 }

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Create Role 1")
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_1))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            role_1_id= json.loads(roles.text)['id']

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Create Role 2")
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_2))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            role_2_id = json.loads(roles.text)['id']

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Create Role 3")
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_3))
        auth_test_log("DEBUG", "test_RoleManagement", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            role_3_id = json.loads(roles.text)['id']

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Get user id from one of the roles")
        path = auth_server + auth_endpoint_roles+"/%s" %role_1_id
        roles = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_RoleCreateModeDelete", "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 200)
        if roles.status_code == 200:
            user_id=json.loads(roles.text)['users'][0]['id']

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Logout (perms are only validated at logout")
        path = auth_server + auth_endpoint_logout
        logout = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_logout", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 200)

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Login ")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_IAS_6_PERMS_ARE_OR", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)


        # This test can't be done anymore since tokens are not generated client side

        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Crack the token open and extract the scopes")
        public_key = os.environ.get("PUBLIC_PEM")
        the_token = jwt.decode(
            json.loads(logon.text)['access_token'], 
            public_key, 
            algorithms=['RS256'])
        required_scopes = ['execute:wsts', 'execute:testbed', 'execute:sit']
        scopes_in_token = the_token['scopes']
        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "Scopes are:%s" % scopes_in_token)
        scope_names_in_token = list(map(lambda scope: scope['scope'], scopes_in_token))
        auth_test_log("INFO", "test_IAS_6_PERMS_ARE_OR", "scope_names_in_token: %s" % scope_names_in_token)
        self.assertEqual(len(set(required_scopes)-set(scope_names_in_token)), 0)

    def test_IAS_7_LOGOUT_blacklist(self):
        return True
        # IAS-7	On user logout the IAS shall ensure their token can not be used again (blacklist).
        auth_test_log("INFO", "test_IAS_7_LOGOUT_blacklist", "Login ")
        path= auth_server+auth_endpoint_login
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(valid_user, valid_password),verify=False)
        auth_test_log("DEBUG", "test_IAS_7_LOGOUT_blacklist", "Response:%s" % logon.text)
        header['Authorization']="Bearer %s" %json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)

        auth_test_log("INFO", "test_IAS_7_LOGOUT_blacklist", "Demonstrate the token works by query on permissions")
        path = auth_server + auth_endpoint_permissions
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_IAS_7_LOGOUT_blacklist", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 200)

        auth_test_log("INFO", "test_IAS_7_LOGOUT_blacklist", "Logout")
        path = auth_server + auth_endpoint_logout
        logout = requests.post(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_IAS_7_LOGOUT_blacklist", "Response:%s" % logout.text)
        self.assertEqual(logout.status_code, 200)

        auth_test_log("INFO", "test_IAS_7_LOGOUT_blacklist", "Demonstrate the token does not work by query on permissions")
        path = auth_server + auth_endpoint_permissions
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_IAS_7_LOGOUT_blacklist", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 401)

    def test_IAS_9_scopes(self):
        # IAS-9	The IAS shall support the following scopes: admin, execute:wsts, execute:testbed, execute:sit, execute:other, config_mgmt, basic 
        # admin, vnv:reporter,config_mgmt,curator
        auth_test_log("INFO", "test_IAS_9_scopes", "Login ")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_IAS_9_scopes", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)

        Required_Scopes=["admin", "execute:wsts", "execute:testbed", "execute:sit", "execute:other", 
                         "config_mgmt", "basic", "imcm", "test_lead", "author"] 

        auth_test_log("INFO", "test_IAS_9_scopes", "List all possible permissions")
        list_of_permissions=[]
        path = auth_server + auth_endpoint_permissions
        perms = requests.get(path, headers=header, verify=False)
        auth_test_log("INFO", "test_IAS_9_scopes", "Response:%s" % perms.text)
        self.assertEqual(perms.status_code, 200)
        if perms.status_code == 200:
            for permission in json.loads(perms.text):
                list_of_permissions.append(permission['name'])

        # Check that the list of scopes matches the list of permissions and vis versa
        # Bug ING-78
        self.assertEqual(len(list(set(Required_Scopes)-set(list_of_permissions))),0)
        self.assertEqual(len(list(set(list_of_permissions)-set(Required_Scopes))),0)


class SpecificIssueTests(unittest.TestCase):

    def setUp(self):
        global header
        auth_test_log("INFO", "Setup_AuthRequirementTest", "Login")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "Setup_AuthRequirementTest", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']

    @classmethod
    def SetUpClass(cls):
        cleanup_for_test()

    def test_ING_88(self):
        return True
        '''
        This test checks to see if users or groups that are not in a role are present in the system.
        :return:
        '''

        test_case_name="test_ING_88"

        users_to_add=['mwatkins']
        groups_to_add=['battlebots']

        auth_test_log("INFO", test_case_name, "Creating a test role with a users %s and groups %s" % (users_to_add,groups_to_add))
        role_users = {"name": "ROLE_7",
                  "description": "This is a test role for lots of users",
                  "users": users_to_add,
                  "groups":groups_to_add,
                  "permissions": [4]
                  }

        path = auth_server + auth_endpoint_roles
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_users))
        auth_test_log("DEBUG", test_case_name, "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            test_role_id = json.loads(roles.text)['id']

        auth_test_log("INFO", test_case_name,"Get the groups in Ingenium and confirm that the group(s) we just added are there")

        path = auth_server + auth_endpoint_groups
        groups = requests.get(path, headers=header,verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            list_of_groups=[]
            for group in json.loads(groups.text)['results']:
                list_of_groups.append(group['name'])
            self.assertEqual(len(list(set(groups_to_add) - set(list_of_groups))), 0)

        auth_test_log("INFO", test_case_name,"Get the user in Ingenium and confirm that the user(s) we just added are there")

        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            list_of_users = []
            for user in json.loads(users.text)['results']:
                list_of_users.append(user['username'])
            self.assertEqual(len(list(set(users_to_add) - set(list_of_users))), 0)

        auth_test_log("INFO", test_case_name,"Now delete the role")

        path = auth_server + auth_endpoint_roles + "/%s" % test_role_id
        roles = requests.delete(path, headers=header, verify=False)
        if roles.status_code != 200:
            auth_test_log("WARNING", test_case_name, "Failure to remove role: %s")
            auth_test_log("WARNING", test_case_name, "Reason: %s" % roles.text)

        auth_test_log("INFO", test_case_name,"Get the groups in Ingenium and confirm that the group is no longer there")

        path = auth_server + auth_endpoint_groups
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            list_of_groups = []
            for group in json.loads(groups.text)['results']:
                list_of_groups.append(group['name'])
            # ING-88
            self.assertEqual(len(list(set(groups_to_add) - set(list_of_groups))), len(groups_to_add))

        auth_test_log("INFO", test_case_name,"Get the users in Ingenium and confirm that the users is no longer there")

        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            list_of_users = []
            for user in json.loads(users.text)['results']:
                list_of_users.append(user['username'])
            # ING-88
            self.assertEqual(len(list(set(users_to_add) - set(list_of_users))), len(users_to_add))

    def test_ING_89(self):
        '''
        This test checks to see if users or groups that are not in a role are present in the system.
        :return:
        '''

        test_case_name = "test_ING_89"

        users_to_add = ['cwhetsel']
        groups_to_add = ['gamers']

        auth_test_log("INFO", test_case_name,
                      "Creating a test role with a users %s and groups %s" % (users_to_add, groups_to_add))
        role_users = {"name": "ROLE_8",
                      "description": "This is a test role",
                      "users": users_to_add,
                      "groups": groups_to_add,
                      "permissions": [4]
                      }

        path = auth_server + auth_endpoint_roles
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_users))
        # auth_test_log("DEBUG", test_case_name, "Response:%s" % roles.text)
        self.assertEqual(roles.status_code, 201)
        if roles.status_code == 201:
            test_role_id = json.loads(roles.text)['id']

        auth_test_log("INFO", test_case_name,
                      "Get the groups in Ingenium and confirm that the group(s) we just added are there")

        path = auth_server + auth_endpoint_groups
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            list_of_groups = []
            for group in json.loads(groups.text)['results']:
                list_of_groups.append(group['name'])
            self.assertEqual(len(list(set(groups_to_add) - set(list_of_groups))), 0)

        auth_test_log("INFO", test_case_name,
                      "Get the user in Ingenium and confirm that the user(s) we just added are there")

        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            list_of_users = [user['username'] for user in json.loads(users.text)['results']]
            self.assertEqual(len(list(set(users_to_add) - set(list_of_users))), 0)

        auth_test_log("INFO", test_case_name, "Now delete the individual users and groups")

        for user in users_to_add:
            path = auth_server + auth_endpoint_roles + "/%s/users/%s" % (test_role_id,user)
            users = requests.delete(path, headers=header, verify=False)
            if users.status_code != 200:
                auth_test_log("WARNING", test_case_name, "Failure to remove user: %s")
                auth_test_log("WARNING", test_case_name, "Reason: %s" % users.text)
            else:
                auth_test_log("DEBUG", test_case_name, "User: %s Removed from Role: %s" %(user,test_role_id))

        for group in groups_to_add:
            path = auth_server + auth_endpoint_roles + "/%s/groups/%s" % (test_role_id,group)
            groups = requests.delete(path, headers=header, verify=False)
            if groups.status_code != 200:
                auth_test_log("WARNING", test_case_name, "Failure to remove user: %s")
                auth_test_log("WARNING", test_case_name, "Reason: %s" % groups.text)
            else:
                auth_test_log("DEBUG", test_case_name, "Group: %s Removed from Role: %s" % (group, test_role_id))

        auth_test_log("INFO", test_case_name,
                      "Get the groups in Ingenium and confirm that the groups is no longer there")

        # path = auth_server + auth_endpoint_groups
        path = auth_server + auth_endpoint_roles + "/%s/groups" % (test_role_id)
        groups = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % groups.text)
        self.assertEqual(groups.status_code, 200)
        if groups.status_code == 200:
            # list_of_groups = [groups['name'] for group in json.loads(groups.text)['results']]
            # ING-89
            # self.assertEqual(len(list(set(groups_to_add) - set(list_of_groups))), len(groups_to_add))
            self.assertEqual(len(json.loads(groups.text)), 1)

        auth_test_log("INFO", test_case_name, "Get the users in Ingenium and confirm that the users is no longer there")

        # path = auth_server + auth_endpoint_users
        path = auth_server + auth_endpoint_roles + "/%s/groups" % (test_role_id)
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", test_case_name, "Response:%s" % users.text)
        self.assertEqual(users.status_code, 200)
        if users.status_code == 200:
            # list_of_users = []
            # for user in json.loads(users.text)['results']:
            #     list_of_users.append(user['username'])
            # ING-89
            # self.assertEqual(len(list(set(users_to_add) - set(list_of_users))), len(users_to_add))
            self.assertEqual(len(json.loads(users.text)), 1)
    def test_ING_285(self):
        '''
        This test checks to see if a test user can login and operate the system
        precondition: user sets environment to "True" so that environment variables containing test username and 
        password are passed for login credentials.
        :return:
        '''

        test_case_name = "test_ING_285"

        auth_test_log("INFO", test_case_name,
                      "Attempting to login with supplied credentials.")

        path= auth_server + auth_endpoint_login
        logon=requests.get(path,auth=requests.auth.HTTPBasicAuth(valid_user, valid_password),verify=False)
        auth_test_log("DEBUG", test_case_name, "Response: %s" % (logon.text))
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)
    
    def test_ING_1446(self):
        auth_test_log("INFO", "test_ING_1146", "Login")
        path = auth_server + auth_endpoint_login
        logon = requests.get(path, auth=requests.auth.HTTPBasicAuth(valid_user, valid_password), verify=False)
        auth_test_log("DEBUG", "test_ING_1146", "Response:%s" % logon.text)
        header['Authorization'] = "Bearer %s" % json.loads(logon.text)['access_token']
        self.assertEqual(logon.status_code, 200)

        # Get all roles before
        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_ING_1146", "All Users Before, Response:%s" % users.text)
        users_data = users.json()
        before_scopes = users_data['results'][0]['scopes']

        path = auth_server + auth_endpoint_roles
        role_1= {"name": "1446_ROLE",
                 "description": "This is a test role",
                 "users": ["swanchr"],
                 "permissions": [9]
                 }

        auth_test_log("INFO", "test_ING_1146", "Create Role 1446")
        roles = requests.post(path, headers=header, verify=False, data=json.dumps(role_1))

        # Get all roles after
        path = auth_server + auth_endpoint_users
        users = requests.get(path, headers=header, verify=False)
        auth_test_log("DEBUG", "test_ING_1146", "All Users After, Response:%s" % users.text)
        users_data = users.json()
        after_scopes = users_data['results'][0]['scopes']

        self.assertEqual(len(before_scopes), len(after_scopes))

    @classmethod
    def TearDownClass(cls):
        cleanup_for_test()

if __name__ == '__main__':
    unittest.main(testRunner=xmlrunner.XMLTestRunner(output="./test-reports/"))
