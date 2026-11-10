'use strict';

module.exports = {
  up: function (queryInterface, Sequelize) {
    console.log(`Adding ForVenueGroup column to Permissions`);
    return queryInterface.addColumn('Permissions', 'for_venue_group', 
      {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      }
    ).then(function() {
      console.log(`Adding VenueGroupId column to Roles`);
      return queryInterface.addColumn('Roles', 'venue_group_id', 
        {
          type: Sequelize.STRING
        }
      )
    });
  },

  down: function (queryInterface, Sequelize) {
    console.warn(`20240930000000-venuegroup.js: down is not implemented`);
  }
};
