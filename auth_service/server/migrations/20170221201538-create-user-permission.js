'use strict';
module.exports = {
  up: function(queryInterface, Sequelize) {
    return queryInterface.createTable('UserPermissions', {
      PermissionId: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        primaryKey: true
      },
      UserId: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        primaryKey: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: function(queryInterface, Sequelize) {
    return queryInterface.dropTable('UserPermission');
  }
};