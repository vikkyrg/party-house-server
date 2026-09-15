const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ user, action, model, modelId, changes, req }) => {
  try {
    await AuditLog.create({
      user,
      action,
      model,
      modelId,
      changes,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
    });
  } catch {
    // Audit logging should not break main flow
  }
};

module.exports = { createAuditLog };
