'use strict';

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

    return queryInterface.bulkInsert('RolePermissions', [
      {
        createdAt: new Date(),
        PermissionId: 1,
        RoleId: 1,
        updatedAt: new Date()
      }, {
        createdAt: new Date(),
        PermissionId: 2,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 3,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 4,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 5,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 6,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 7,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 8,
        RoleId: 1,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 1,
        RoleId: 2,
        updatedAt: new Date()
      }, {
        createdAt: new Date(),
        PermissionId: 2,
        RoleId: 2,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 3,
        RoleId: 2,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 4,
        RoleId: 2,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 5,
        RoleId: 2,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 6,
        RoleId: 2,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 7,
        RoleId: 2,
        updatedAt: new Date(),
      }, {
        createdAt: new Date(),
        PermissionId: 8,
        RoleId: 2,
        updatedAt: new Date(),
      }
    ])

  },

  down: function (queryInterface, Sequelize) {
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.bulkDelete('Person', null, {});
    */
    return queryInterface.dropTable('RolePermission');
  }
};
