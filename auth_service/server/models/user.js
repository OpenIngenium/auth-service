'use strict';
module.exports = function(sequelize, DataTypes) {
  var User = sequelize.define('User', {
    display_name: DataTypes.STRING,
    username: {type: DataTypes.STRING, unique: true, allowNull: false},
    login_expire: {type: DataTypes.DATE, defaultValue: sequelize.NOW }
  });

  User.associate = models => {
    models.User.belongsToMany(models.Role, {
      as: { singular: 'Role', plural: 'Roles' },
      through: models.RoleUser
    });
    models.User.belongsToMany(models.Group, {
      as: { singular: 'Group', plural: 'Groups' },
      through: models.UserGroup
    });
    models.User.belongsToMany(models.Permission, {
      as: { singular: 'Permission', plural: 'Permissions' },
      through: models.UserPermission
    })
  }

  return User;
};
