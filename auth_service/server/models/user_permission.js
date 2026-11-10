module.exports = function(sequelize, DataTypes) {
    var UserPermission = sequelize.define('UserPermission', {});

    return UserPermission;
}