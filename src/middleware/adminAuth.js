const { restrictTo } = require('./auth');

exports.adminOnly = restrictTo('admin', 'super-admin');
exports.superAdminOnly = restrictTo('super-admin');
