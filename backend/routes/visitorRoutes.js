const express = require('express');
const router = express.Router();

const {
  registerVisitor,
  registerVisitorPublic,
  getAllVisitors,
  getVisitor,
  updateVisitor,
  toggleBlacklist,
  deleteVisitor,
  getVisitorStats
} = require('../controllers/visitorController');

const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');
const { uploadPhoto, processUploadedFile } = require('../middleware/uploadMiddleware');

// Public pre-registration (photo upload handled via storageService)
router.post('/register', uploadPhoto.single('photo'), processUploadedFile('visitor-photos'), registerVisitorPublic);

// All other visitor routes require authentication
router.use(auth);

// Register a new visitor (admin and security)
router.post('/', checkRole('admin', 'security'), uploadPhoto.single('photo'), processUploadedFile('visitor-photos'), registerVisitor);

// Get all visitors (authenticated)
router.get('/', getAllVisitors);

// Get visitor statistics (admin only)
router.get('/stats', checkRole('admin'), getVisitorStats);

// Get single visitor
router.get('/:id', getVisitor);

// Update visitor details
router.patch('/:id', checkRole('admin', 'security'), uploadPhoto.single('photo'), processUploadedFile('visitor-photos'), updateVisitor);

// Toggle blacklist status (admin only)
router.patch('/:id/blacklist', checkRole('admin'), toggleBlacklist);

// Delete visitor (admin only)
router.delete('/:id', checkRole('admin'), deleteVisitor);

module.exports = router;
