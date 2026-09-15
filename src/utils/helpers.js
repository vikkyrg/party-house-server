const slugify = require('slugify');

exports.generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i += 1) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

exports.createSlug = (text) => {
  return slugify(text, { lower: true, strict: true });
};

exports.parseCorsOrigins = (originString) => {
  if (!originString || originString === '*') return '*';
  return originString.split(',').map((o) => o.trim());
};

exports.sendResponse = (res, statusCode, data = {}) => {
  res.status(statusCode).json({
    success: true,
    ...data,
  });
};
