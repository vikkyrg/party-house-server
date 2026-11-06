const jwt = require('jsonwebtoken');

const tokenBlacklist = new Set();

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });

  return { accessToken, refreshToken };
};

const verifyAccessToken = (token) => {
  if (tokenBlacklist.has(token)) {
    throw new Error('Token has been revoked');
  }
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  if (tokenBlacklist.has(token)) {
    throw new Error('Token has been revoked');
  }
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const blacklistToken = (token) => {
  tokenBlacklist.add(token);
};

const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: (parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10) || 30) * 24 * 60 * 60 * 1000,
  };

  res.cookie('accessToken', accessToken, cookieOptions);
  res.cookie('refreshToken', refreshToken, cookieOptions);
};

const clearTokenCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  blacklistToken,
  setTokenCookies,
  clearTokenCookies,
};
