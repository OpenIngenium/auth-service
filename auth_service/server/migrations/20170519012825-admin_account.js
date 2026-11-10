'use strict';
var models = require('../../server/models/index.js');

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

  return queryInterface.bulkInsert('Groups', [{
    name: 'ingenium-dev',
      createdAt: new Date(),
      updatedAt: new Date()
  }]).then(function() { 
      return queryInterface.bulkInsert('Roles', [{
        name: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        description: "Admin role."
      }])
    })

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
