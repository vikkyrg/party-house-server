const { getTwilioClient } = require('../config/sms');
const logger = require('../utils/logger');

const sendSMS = async (phone, message) => {
  if (process.env.SMS_ENABLED !== 'true') {
    logger.info(`SMS (dev mode) to ${phone}: ${message}`);
    return;
  }

  const client = getTwilioClient();
  if (!client) {
    logger.warn(`SMS not sent (Twilio not configured): ${phone}`);
    return;
  }

  const toNumber = phone.startsWith('+') ? phone : `+91${phone}`;

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: toNumber,
  });

  logger.info(`SMS sent to ${phone}`);
};

module.exports = { sendSMS };
