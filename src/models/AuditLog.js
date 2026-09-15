const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete', 'login', 'logout', 'view', 'export'],
    },
    model: { type: String, required: true },
    modelId: { type: mongoose.Schema.Types.ObjectId, required: true },
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ user: 1, createdAt: -1 });
AuditLogSchema.index({ model: 1, modelId: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
