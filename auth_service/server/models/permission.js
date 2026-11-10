'use strict';
module.exports = function(sequelize, DataTypes) {
  var Permission = sequelize.define('Permission', {
    name: { type: DataTypes.STRING, unique: true, allowNull: false },
    for_venue_group: { type: DataTypes.BOOLEAN, defaultValue: false },
  });

  Permission.associate = models => {
    models.Permission.belongsToMany(models.Role, {
      as: { singular: 'Role', plural: 'Roles' },
      through: models.RolePermission
    });
    models.Permission.belongsToMany(models.User, {
      as: { singular: 'User', plural: 'Users' },
      through: models.UserPermission
    });
  };

  return Permission;
};