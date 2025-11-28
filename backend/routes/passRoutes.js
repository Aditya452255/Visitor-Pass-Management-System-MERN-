const express = require('express');
const router = express.Router();

const {
  issuePass,
  getAllPasses,
  getPass,
  verifyPass,
  revokePass,
  updateExpiredPasses,
  getPassStats
} = require('../controllers/passController');

const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');

// All routes require authentication
router.use(auth);

// Issue pass (admin or security)
router.post('/', checkRole('admin', 'security'), issuePass);

// Get all passes
router.get('/', getAllPasses);

// Get pass stats
router.get('/stats', getPassStats);

// Update expired passes (admin or security)
router.patch('/update-expired', checkRole('admin', 'security'), updateExpiredPasses);

// Verify pass by number (admin or security)
router.get('/verify/:passNumber', checkRole('admin', 'security'), verifyPass);

// Get single pass by ID
router.get('/:id', getPass);

// Revoke pass (✅ admin only)
router.patch('/:id/revoke', checkRole('admin'), revokePass);

module.exports = router;
