'use strict';
module.exports = function(sequelize, DataTypes) {
  var Role = sequelize.define('Role', {
    name: {type: DataTypes.STRING, unique: true, allowNull: false},
    description: DataTypes.TEXT,
    venue_group_id: {type: DataTypes.STRING}
  });

  Role.associate = models => {
    models.Role.belongsToMany(models.User, {
      as: { singular: 'User', plural: 'Users' },
      through: models.RoleUser
    });
    models.Role.belongsToMany(models.Permission, {
      as: { singular: 'Permission', plural: 'Permissions' },
      through: models.RolePermission
    });
    models.Role.belongsToMany(models.Group, {
      as: { singular: 'Group', plural: 'Groups'},
      through: models.RoleGroup
    });
  }

  return Role;
};                                                                                       