const express = require('express');
const router = express.Router();

const {
  createAppointment,
  createAppointmentPublic,
  getAllAppointments,
  getAppointmentsByVisitor,
  getAppointment,
  getMyAppointments,
  approveAppointment,
  rejectAppointment,
  cancelAppointment,
  deleteAppointment,
  updateAppointment,
  getAppointmentStats
} = require('../controllers/appointmentController');

const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');
const { uploadPhoto, processUploadedFile } = require('../middleware/uploadMiddleware');

// Public endpoint for visitors to create appointment requests (with photo upload)
router.post('/public', uploadPhoto.single('visitorPhoto'), processUploadedFile('appointment-photos'), createAppointmentPublic);

// Public endpoint for visitors to fetch their appointments
router.get('/visitor/:visitorId', getAppointmentsByVisitor);

// All subsequent routes require authentication
router.use(auth);

// Authenticated visitor: get own appointments
router.get('/my', getMyAppointments);

// Create appointment with photo upload (authenticated users)
router.post('/', uploadPhoto.single('visitorPhoto'), processUploadedFile('appointment-photos'), createAppointment);

// Get appointments
router.get('/', checkRole('admin', 'employee'), getAllAppointments);

// Get appointment statistics
router.get('/stats', getAppointmentStats);

// Get single appointment
router.get('/:id', getAppointment);

// Approve appointment
router.patch('/:id/approve', checkRole('admin', 'employee'), approveAppointment);

// Reject appointment
router.patch('/:id/reject', checkRole('admin', 'employee'), rejectAppointment);

// Cancel appointment
router.patch('/:id/cancel', checkRole('admin', 'employee', 'visitor'), cancelAppointment);

// Delete appointment
router.delete('/:id', checkRole('admin', 'employee', 'visitor'), deleteAppointment);

// Update appointment
router.patch('/:id', updateAppointment);

module.exports = router;
