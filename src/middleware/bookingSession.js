const crypto = require('crypto');

const COOKIE_NAME = 'bookingSession';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE,
});

const createBookingSessionId = () => crypto.randomBytes(32).toString('hex');
const hashBookingSessionId = (sessionId) =>
  crypto.createHash('sha256').update(sessionId).digest('hex');

const setBookingSessionCookie = (res, sessionId = createBookingSessionId()) => {
  res.cookie(COOKIE_NAME, sessionId, cookieOptions());
  return sessionId;
};

const clearBookingSessionCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
};

const ensureBookingSession = (req, res, next) => {
  const existingSession = req.cookies?.[COOKIE_NAME];
  if (typeof existingSession === 'string' && /^[a-f0-9]{64}$/.test(existingSession)) {
    req.bookingSessionId = hashBookingSessionId(existingSession);
    return next();
  }

  req.bookingSessionId = hashBookingSessionId(setBookingSessionCookie(res));
  return next();
};

module.exports = {
  COOKIE_NAME,
  clearBookingSessionCookie,
  createBookingSessionId,
  ensureBookingSession,
  setBookingSessionCookie,
};
