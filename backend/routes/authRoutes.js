const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const {
  loginUser,
  signupUser,
  getProfile,
  updateProfile,
  getAllUsers,
  getHosts,
  updateUserRole,
  deleteUser,
  createUser
} = require('../controllers/authController');

const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');

// Strict rate limit for auth endpoints (20 attempts per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

// Public routes
router.post('/login', authLimiter, loginUser);
router.post('/signup', authLimiter, signupUser);

// Public route to fetch hosts (employees/admins) for appointment forms
router.get('/hosts', getHosts);

// Protected routes
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);

// Admin routes
router.get('/users', auth, checkRole('admin'), getAllUsers);
router.post('/create-user', auth, checkRole('admin'), createUser);
router.put('/users/:id/role', auth, checkRole('admin'), updateUserRole);
router.delete('/users/:id', auth, checkRole('admin'), deleteUser);

module.exports = router;
