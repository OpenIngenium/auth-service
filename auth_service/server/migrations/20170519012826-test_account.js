'use strict';
var models = require('../../server/models/index.js');
const env_config = require('../../env_config.js');

module.exports = {
  up: function (queryInterface, Sequelize) {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.bulkInsert('Person', [{
        name: 'John Doe',
        isBetaMember: false
      }], {});
    */
    return queryInterface.bulkInsert('Users', [{
      display_name: 'Ingenium Test User',
      username: env_config.test_user,
      createdAt: new Date(),
      updatedAt: new Date(),
      login_expire: new Date()
    }])
    .then(() => {
      queryInterface.bulkInsert('Roles', [{
        name: "test-role",
        createdAt: new Date(),
        updatedAt: new Date(),
        description: "Role for test account."
      }])
      .then(() => {
        queryInterface.bulkInsert('RoleUsers', [{
          RoleId: 2,
          UserId: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }])
        .then(() => {
          queryInterface.bulkInsert('UserPermissions', [{
            PermissionId: 1,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 2,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 3,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 4,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 5,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 6,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 7,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          },{
            PermissionId: 8,
            UserId: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          }]);
        });
      });
    });

  },

  down: function (queryInterface, Sequelize) {
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.bulkDelete('Person', null, {});
    */
  }
};