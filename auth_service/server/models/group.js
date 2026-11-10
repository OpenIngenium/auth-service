// https://sequelize.readthedocs.io/en/1.7.0/articles/express/
module.exports = function(sequelize, DataTypes) {
  // Old Way
  // var Group = sequelize.define('Group', {
  //   name: {type: DataTypes.STRING, unique: true, allowNull: false}
  // }, {
  //   classMethods: {
  //     associate: function(models) {
  //       // associations can be defined here
  //       Group.belongsToMany(models.Role, {through: 'RoleGroup'});
  //       // Group.belongsToMany(models.User, {through: 'UserGroup'});
  //       // Group.hasMany(models.User, {as: 'Users', constraints: false});
  //       //Group.hasMany(models.User, {as: 'Users', constraints: false, foreignKey: 'id'});
  //       Group.belongsToMany(models.User, {as: 'Users', through: 'UserGroup'});
  //     }
  //   }
  // });
  // return Group;

  // New Way
  var Group = sequelize.define('Group', {
    name: {type: DataTypes.STRING, unique: true, allowNull: false}
  });

  Group.associate = models => {
    models.Group.belongsToMany(models.Role, {
      as: { singular: 'Role', plural: 'Roles' },
      through: models.RoleGroup
    });
    models.Group.belongsToMany(models.User, {
      as: { singular: 'User', plural: 'Users' },
      through: models.UserGroup
    });
  }

  return Group;
};