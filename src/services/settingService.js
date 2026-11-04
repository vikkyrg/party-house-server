const Setting = require('../models/Setting');

const DEFAULT_ADVANCE_AMOUNT = 750;

/**
 * Get setting value by key, or return default
 */
exports.getSetting = async (key, defaultValue = null) => {
  try {
    const doc = await Setting.findOne({ key });
    if (doc && doc.value !== undefined && doc.value !== null) {
      return doc.value;
    }
    return defaultValue;
  } catch (error) {
    return defaultValue;
  }
};

/**
 * Set setting value by key
 */
exports.setSetting = async (key, value, description = '', updatedBy = null) => {
  const updated = await Setting.findOneAndUpdate(
    { key },
    { value, description, updatedBy },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return updated;
};

/**
 * Get the configured advance payment amount (defaults to 750)
 */
exports.getAdvancePaymentAmount = async () => {
  const val = await exports.getSetting('advancePaymentAmount', DEFAULT_ADVANCE_AMOUNT);
  const parsed = Number(val);
  return isNaN(parsed) || parsed < 0 ? DEFAULT_ADVANCE_AMOUNT : parsed;
};

