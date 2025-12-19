const express = require('express');
const router = express.Router();

const {
  createAppointment,
  createAppointmentPublic,
  getAllAppointments,
  getAppointmentsByVisitor,
  getAppointment,
  approveAppointment,
  rejectAppointment,
  cancelAppointment,
  updateAppointment,
  getAppointmentStats
} = require('../controllers/appointmentController'); // ✅ fixed typo

const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');
const uploadPhoto = require('../middleware/uploadPhoto');

// Public endpoint for visitors to create appointment requests
router.post('/public', createAppointmentPublic);
// Public endpoint for visitors to fetch their appointments (status checks)
router.get('/visitor/:visitorId', getAppointmentsByVisitor);

// all routes require authentication
router.use(auth);

// Authenticated visitor: get own appointments
router.get('/my', require('../middleware/auth'), require('../controllers/appointmentController').getMyAppointments);

// Create appointment with photo upload (authenticated users)
router.post('/', uploadPhoto.single('visitorPhoto'), createAppointment);

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

// Cancel appointment (✅ restricted)
router.patch('/:id/cancel', checkRole('admin', 'employee'), cancelAppointment);

// Update appointment
router.patch('/:id', updateAppointment);

module.exports = router;
