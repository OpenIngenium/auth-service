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
    return queryInterface.bulkInsert('Permissions', [
      {
      name: "admin",
        //description: "the admin permission",
        createdAt: new Date(),
        updatedAt: new Date()
      }, {
      name: "execute:wsts",
        //description: "second permission",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, {
      name: "execute:testbed",
        //description: "third permission",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, {
      name: "execute:sit",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, {
      name: "execute:other",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, {
      name: "config_mgmt",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, {
      name: "redline",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, {
        name: "basic",
          createdAt: new Date(),
          updatedAt: new Date(),
      }, {
        name: "imcm",
          createdAt: new Date(),
          updatedAt: new Date(),
      }, {
        name: "test_lead",
          createdAt: new Date(),
          updatedAt: new Date(),
      }, {
        name: "author",
          createdAt: new Date(),
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
    return queryInterface.dropTable('Permissions');
  }
};
