const express = require('express');
const authController = require('../controllers/authController');
const { protect, checkAuth } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} = require('../validators/authValidator');

const router = express.Router();

router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/verify-otp', validateRequest(verifyOtpSchema), authController.verifyOTP);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/logout', protect, authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post(
  '/forgot-password',
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword
);
router.post('/reset-password', validateRequest(resetPasswordSchema), authController.resetPassword);
router.post(
  '/change-password',
  protect,
  validateRequest(changePasswordSchema),
  authController.changePassword
);
router.get('/me', checkAuth, authController.getMe);
router.put(
  '/update-profile',
  protect,
  validateRequest(updateProfileSchema),
  authController.updateProfile
);
router.delete('/delete-account', protect, authController.deleteAccount);

module.exports = router;
