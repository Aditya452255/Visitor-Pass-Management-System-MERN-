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
  deleteAppointment,
  updateAppointment,
  getAppointmentStats
} = require('../controllers/appointmentController'); // ✅ fixed typo

const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');
const uploadPhotoCloudinary = require('../middleware/uploadPhotoCloudinary');

// Public endpoint for visitors to create appointment requests (with photo upload)
router.post('/public', uploadPhotoCloudinary.single('visitorPhoto'), createAppointmentPublic);
// Public endpoint for visitors to fetch their appointments (status checks)
router.get('/visitor/:visitorId', getAppointmentsByVisitor);

// all routes require authentication
router.use(auth);

// Authenticated visitor: get own appointments
router.get('/my', require('../middleware/auth'), require('../controllers/appointmentController').getMyAppointments);

// Create appointment with photo upload (authenticated users)
router.post('/', uploadPhotoCloudinary.single('visitorPhoto'), createAppointment);

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

// Cancel appointment: allow admin/employee, and visitors to cancel their own appointments
router.patch('/:id/cancel', checkRole('admin', 'employee', 'visitor'), cancelAppointment);

// Delete appointment: allow admin/employee, and visitors to delete their own appointments
router.delete('/:id', checkRole('admin', 'employee', 'visitor'), deleteAppointment);

// Update appointment
router.patch('/:id', updateAppointment);

module.exports = router;
