// controllers/appointmentController.js  (fixed)
const Appointment = require('../models/Appointment');
const Visitor = require('../models/Visitor');
const User = require('../models/User');
const { sendAppointmentConfirmation, sendEmail } = require('../utils/emailService');
const { sendAppointmentSMS } = require('../utils/smsService');

const { generateQRCode } = require('../utils/qrGenerator');

// Helper: build Date from possible shapes
const buildAppointmentDate = (dateInput, timeInput) => {
  if (!dateInput) return null;

  // If dateInput is ISO-like including time, try parse directly
  const direct = new Date(dateInput);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  // Otherwise expect dateInput = 'YYYY-MM-DD' and timeInput = 'HH:MM'
  if (timeInput && /^\d{2}:\d{2}$/.test(timeInput)) {
    const combined = new Date(`${dateInput}T${timeInput}`);
    if (!Number.isNaN(combined.getTime())) return combined;
  }

  return null;
};

// Create appointment
const createAppointment = async (req, res) => {
  try {
    const {
      visitorId,
      hostId,
      appointmentDate, // ISO or date-only
      appointmentTime, // optional time HH:MM
      duration,
      purpose,
      location,
      notes
    } = req.body;

    // If the request is from an authenticated visitor, link to the Visitor record
    // Note: `User` (auth) and `Visitor` (profile) are separate collections. When a logged-in
    // visitor creates an appointment, find or create the corresponding Visitor document
    // and use its `_id` for the appointment to keep queries consistent for `/api/appointments/my`.

    // Basic validation: hostId, purpose and location are required. visitor is optional.
    if (!hostId || !purpose || !location) {
      return res.status(400).json({ error: 'hostId, purpose and location are required' });
    }

    // Resolve visitor if provided or if the request is from an authenticated visitor.
    let visitor = null;
    if (req.user && req.user.role === 'visitor') {
      // Try to find a Visitor document that matches the logged-in user's email
      visitor = await Visitor.findOne({ email: req.user.email });
      if (!visitor) {
        // If no Visitor doc exists yet, create a minimal one from the User info
        visitor = await Visitor.create({
          name: req.user.name || req.user.email.split('@')[0],
          email: req.user.email,
          phone: req.user.phone || ''
        });
      }
      if (visitor && visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot create appointment for blacklisted visitor' });
      }
    } else if (finalVisitorId) {
      visitor = await Visitor.findById(finalVisitorId);
      if (visitor && visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot create appointment for blacklisted visitor' });
      }
    }

    const host = await User.findById(hostId);
    if (!host) return res.status(404).json({ error: 'Host not found' });

    // Build appointment Date object
    const appointmentDateObj = buildAppointmentDate(appointmentDate, appointmentTime);
    if (!appointmentDateObj) {
      return res.status(400).json({ error: 'Invalid or missing appointmentDate. Provide ISO datetime or YYYY-MM-DD with appointmentTime (HH:MM).' });
    }

    // Prevent scheduling in the past
    const now = new Date();
    if (appointmentDateObj < now) {
      return res.status(400).json({ error: 'Appointment date/time cannot be in the past' });
    }

    // Normalize appointmentTime for storage
    const normalizedTime = appointmentTime && /^\d{2}:\d{2}$/.test(appointmentTime)
      ? appointmentTime
      : appointmentDateObj.toTimeString().slice(0, 5); // "HH:MM"

    const newAppointment = await Appointment.create({
      visitor: visitor ? visitor._id : undefined,
      host: host._id,
      appointmentDate: appointmentDateObj,
      appointmentTime: normalizedTime,
      duration: Number(duration) || 60,
      purpose,
      location,
      notes,
      status: 'pending',
      createdBy: req.user ? req.user._id : undefined
    });

    const populatedAppointment = await Appointment.findById(newAppointment._id)
      .populate('visitor')
      .populate('host', 'name email phone department');

    // Notify host by email (do not block if email fails)
    try {
      const visitorDisplayName = visitor ? visitor.name : (req.body.visitorName || 'Guest');
      const hostEmailHtml = `
        <h2>New Appointment Request</h2>
        <p>Dear ${host.name},</p>
        <p>You have a new appointment request:</p>
        <ul>
          <li><strong>Visitor:</strong> ${visitorDisplayName}</li>
          <li><strong>Date:</strong> ${appointmentDateObj.toLocaleDateString()}</li>
          <li><strong>Time:</strong> ${normalizedTime}</li>
          <li><strong>Purpose:</strong> ${purpose}</li>
        </ul>
        <p>Please review and approve/reject this appointment.</p>
      `;
      await sendEmail(host.email, 'New Appointment Request', hostEmailHtml);
    } catch (mailErr) {
      console.warn('Failed to send new appointment email to host:', mailErr?.message || mailErr);
    }

    return res.status(201).json({ success: true, appointment: populatedAppointment });
  } catch (err) {
    console.error('Error creating appointment:', err);
    return res.status(500).json({ error: 'Server error while creating appointment', details: err.message });
  }
};

// Public create appointment (for visitors who are not logged in)
const createAppointmentPublic = async (req, res) => {
  try {
    const {
      visitorId,
      hostId,
      appointmentDate,
      appointmentTime,
      duration,
      purpose,
      location,
      notes
    } = req.body;

    // hostId, purpose and location are required; visitor is optional for public creation
    if (!hostId || !purpose || !location) {
      return res.status(400).json({ error: 'hostId, purpose and location are required' });
    }

    let visitor = null;
    if (visitorId) {
      visitor = await Visitor.findById(visitorId);
      if (visitor && visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot create appointment for blacklisted visitor' });
      }
    }

    const host = await User.findById(hostId);
    if (!host) return res.status(404).json({ error: 'Host not found' });

    const appointmentDateObj = buildAppointmentDate(appointmentDate, appointmentTime);
    if (!appointmentDateObj) {
      return res.status(400).json({ error: 'Invalid or missing appointmentDate. Provide ISO datetime or YYYY-MM-DD with appointmentTime (HH:MM).' });
    }

    const now = new Date();
    if (appointmentDateObj < now) {
      return res.status(400).json({ error: 'Appointment date/time cannot be in the past' });
    }

    const normalizedTime = appointmentTime && /^\d{2}:\d{2}$/.test(appointmentTime)
      ? appointmentTime
      : appointmentDateObj.toTimeString().slice(0, 5);

    const newAppointment = await Appointment.create({
      visitor: visitor ? visitor._id : undefined,
      host: host._id,
      appointmentDate: appointmentDateObj,
      appointmentTime: normalizedTime,
      duration: Number(duration) || 60,
      purpose,
      location,
      notes,
      status: 'pending'
    });

    const populatedAppointment = await Appointment.findById(newAppointment._id)
      .populate('visitor')
      .populate('host', 'name email phone department');

    // Notify host (best-effort)
    try {
      const visitorDisplayName = visitor ? visitor.name : (req.body.visitorName || 'Guest');
      const hostEmailHtml = `
        <h2>New Appointment Request</h2>
        <p>Dear ${host.name},</p>
        <p>You have a new appointment request:</p>
        <ul>
          <li><strong>Visitor:</strong> ${visitorDisplayName}</li>
          <li><strong>Date:</strong> ${appointmentDateObj.toLocaleDateString()}</li>
          <li><strong>Time:</strong> ${normalizedTime}</li>
          <li><strong>Purpose:</strong> ${purpose}</li>
        </ul>
        <p>Please review and approve/reject this appointment.</p>
      `;
      await sendEmail(host.email, 'New Appointment Request', hostEmailHtml);
    } catch (mailErr) {
      console.warn('Failed to send new appointment email to host:', mailErr?.message || mailErr);
    }

    return res.status(201).json({ success: true, appointment: populatedAppointment });
  } catch (err) {
    console.error('Error creating public appointment:', err);
    return res.status(500).json({ error: 'Server error while creating appointment', details: err.message });
  }
};

// Get all appointments
const getAllAppointments = async (req, res) => {
  try {
    let { status, date, hostId, page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;

    const query = {};

    if (status) query.status = status;

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.appointmentDate = { $gte: startDate, $lt: endDate };
    }

    if (hostId) query.host = hostId;

    const appointments = await Appointment.find(query)
      .populate('visitor')
      .populate('host', 'name email phone department')
      .populate('approvedBy', 'name')
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const count = await Appointment.countDocuments(query);

    return res.status(200).json({
      appointments,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalAppointments: count
    });
  } catch (err) {
    console.error('getAllAppointments error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Get single appointment
const getAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id)
      .populate('visitor')
      .populate('host', 'name email phone department')
      .populate('approvedBy', 'name');

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    return res.status(200).json(appointment);
  } catch (err) {
    console.error('getAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Authenticated: Get appointments for the currently logged-in visitor
const getMyAppointments = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // If user is visitor, return their appointments; else return for specified user (admin/employee can use other endpoints)
    if (req.user.role !== 'visitor') {
      return res.status(403).json({ error: 'Only visitors can access this endpoint to see their own appointments' });
    }

    // Determine the Visitor _id to query appointments by. The logged-in `User` and
    // the `Visitor` profile are separate documents, so map by email when possible.
    let visitorId = req.user._id;
    if (req.user.role === 'visitor') {
      const visitorDoc = await Visitor.findOne({ email: req.user.email });
      if (visitorDoc) visitorId = visitorDoc._id;
    }

    const appointments = await Appointment.find({ visitor: visitorId })
      .populate('visitor', 'name email phone')
      .populate('host', 'name email department')
      .populate('approvedBy', 'name')
      .sort({ appointmentDate: -1, appointmentTime: -1 });

    return res.status(200).json({ appointments });
  } catch (err) {
    console.error('getMyAppointments error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Public: Get appointments for a visitor (by visitorId)
const getAppointmentsByVisitor = async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!visitorId) return res.status(400).json({ error: 'visitorId is required' });

    const appointments = await Appointment.find({ visitor: visitorId })
      .populate('visitor', 'name email phone')
      .populate('host', 'name email department')
      .populate('approvedBy', 'name')
      .sort({ appointmentDate: -1, appointmentTime: -1 });

    return res.status(200).json({ appointments });
  } catch (err) {
    console.error('getAppointmentsByVisitor error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Approve appointment
const approveAppointment = async (req, res) => {
  const { id } = req.params;
  console.log(`[Approve] Received request to approve appointment ID: ${id}`);
  console.log(`[Approve] Action performed by user: ${req.user ? req.user.email : 'Unknown'}`);

  try {
    const appointment = await Appointment.findByIdAndUpdate(
      id,
      {
        status: 'approved',
        approvedBy: req.user ? req.user._id : undefined,
        approvalDate: new Date()
      },
      { new: true }
    ).populate('visitor').populate('host', 'name email phone');

    if (!appointment) {
      console.log(`[Approve] Appointment not found for ID: ${id}`);
      return res.status(404).json({ error: 'Appointment not found' });
    }
    console.log(`[Approve] Successfully updated appointment status to 'approved' for ID: ${id}`);

    // Send confirmation email + SMS (best-effort) only if visitor contact exists
    try {
      if (appointment.visitor && appointment.visitor.email) {
        console.log(`[Approve] Visitor has email (${appointment.visitor.email}). Preparing to send confirmation.`);
        // Generate QR code for the appointment details
        const qrCodeDataURL = await generateQRCode({
          appointmentId: appointment._id,
          visitorId: appointment.visitor._id,
          hostId: appointment.host._id,
          date: appointment.appointmentDate,
        });
        console.log(`[Approve] QR Code generated. Sending email...`);
        await sendAppointmentConfirmation(appointment, appointment.visitor, appointment.host, qrCodeDataURL);
        console.log(`[Approve] Email sending process completed for appointment ID: ${id}`);
      } else {
        console.log(`[Approve] Skipping email for appointment ID: ${id}. Visitor has no email address.`);
      }
    } catch (e) {
      console.error(`[Approve] Failed to send appointment confirmation email for ID: ${id}. Error:`, e?.message || e);
    }

    try {
      if (appointment.visitor && appointment.visitor.phone) {
        console.log(`[Approve] Visitor has phone number. Sending SMS...`);
        await sendAppointmentSMS(appointment.visitor.phone, {
          date: new Date(appointment.appointmentDate).toLocaleDateString(),
          time: appointment.appointmentTime,
          location: appointment.location,
          host: appointment.host?.name || ''
        });
        console.log(`[Approve] SMS sending process completed for appointment ID: ${id}`);
      }
    } catch (e) {
      console.warn(`[Approve] Failed to send appointment SMS for ID: ${id}. Error:`, e?.message || e);
    }

    // mark as notificationsSent (model has notificationsSent)
    appointment.notificationsSent = true;
    await appointment.save();
    console.log(`[Approve] Marked 'notificationsSent' as true for appointment ID: ${id}`);

    return res.status(200).json(appointment);
  } catch (err) {
    console.error(`[Approve] Critical error during approval for ID: ${id}. Error:`, err);
    return res.status(500).json({ error: err.message });
  }
};

// Reject appointment
const rejectAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      {
        status: 'rejected',
        approvedBy: req.user ? req.user._id : undefined,
        approvalDate: new Date(),
        rejectionReason
      },
      { new: true }
    ).populate('visitor').populate('host', 'name email');

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    // Send rejection email (best-effort)
    try {
      if (appointment.visitor && appointment.visitor.email) {
        const rejectionEmail = `
          <h2>Appointment Rejected</h2>
          <p>Dear ${appointment.visitor.name},</p>
          <p>Your appointment request for ${new Date(appointment.appointmentDate).toLocaleDateString()} at ${appointment.appointmentTime} has been rejected.</p>
          ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
          <p>Please contact ${appointment.host.name} for more information.</p>
        `;
        await sendEmail(appointment.visitor.email, 'Appointment Rejected', rejectionEmail);
      }
    } catch (e) {
      console.warn('Failed to send rejection email:', e?.message || e);
    }

    return res.status(200).json(appointment);
  } catch (err) {
    console.error('rejectAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      { status: 'cancelled' },
      { new: true }
    ).populate('visitor').populate('host', 'name email');

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    // Send cancellation notification (best-effort)
    try {
      const cancellationEmail = `
        <h2>Appointment Cancelled</h2>
        <p>The appointment scheduled for ${new Date(appointment.appointmentDate).toLocaleDateString()} at ${appointment.appointmentTime} has been cancelled.</p>
      `;
      await sendEmail(appointment.visitor.email, 'Appointment Cancelled', cancellationEmail);
      await sendEmail(appointment.host.email, 'Appointment Cancelled', cancellationEmail);
    } catch (e) {
      console.warn('Failed to send cancellation emails:', e?.message || e);
    }

    return res.status(200).json(appointment);
  } catch (err) {
    console.error('cancelAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Update appointment
const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If updating date/time, validate them
    if (updateData.appointmentDate || updateData.appointmentTime) {
      const dateObj = buildAppointmentDate(updateData.appointmentDate || undefined, updateData.appointmentTime || undefined);
      if (!dateObj) return res.status(400).json({ error: 'Invalid appointment date/time' });
      if (dateObj < new Date()) return res.status(400).json({ error: 'Appointment date cannot be in the past' });
      updateData.appointmentDate = dateObj;
      if (!updateData.appointmentTime) updateData.appointmentTime = dateObj.toTimeString().slice(0,5);
    }

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('visitor').populate('host', 'name email phone');

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    return res.status(200).json(appointment);
  } catch (err) {
    console.error('updateAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Get appointment statistics
const getAppointmentStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = {
      total: await Appointment.countDocuments(),
      pending: await Appointment.countDocuments({ status: 'pending' }),
      approved: await Appointment.countDocuments({ status: 'approved' }),
      rejected: await Appointment.countDocuments({ status: 'rejected' }),
      todayAppointments: await Appointment.countDocuments({
        appointmentDate: { $gte: today, $lt: tomorrow },
        status: 'approved'
      })
    };

    return res.status(200).json(stats);
  } catch (err) {
    console.error('getAppointmentStats error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createAppointment,
  createAppointmentPublic,
  getAllAppointments,
  getAppointment,
  getAppointmentsByVisitor,
  getMyAppointments,
  approveAppointment,
  rejectAppointment,
  cancelAppointment,
  updateAppointment,
  getAppointmentStats
};
