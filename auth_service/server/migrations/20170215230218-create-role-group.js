'use strict';
module.exports = {
  up: function(queryInterface, Sequelize) {
    return queryInterface.createTable('RoleGroups', {
      RoleId: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        primaryKey: true
      },
      GroupId: {
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
    return queryInterface.dropTable('RoleGroup');
  }
};
