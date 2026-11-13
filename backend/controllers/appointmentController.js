const prisma = require('../config/prisma');
const { generateQRCode } = require('../utils/qrGenerator');
const { sendAppointmentConfirmation, sendEmail } = require('../utils/emailService');
const { sendAppointmentSMS } = require('../utils/smsService');
const { logger } = require('../utils/logger');

// Format appointment object for frontend backward compatibility
const formatAppointment = (a) => {
  if (!a) return null;
  return {
    ...a,
    _id: a.id,
    visitor: a.visitor ? { ...a.visitor, _id: a.visitor.id } : null,
    host: a.host ? { ...a.host, _id: a.host.id, role: (a.host.role || '').toString().toLowerCase() } : null,
    approvedBy: a.approvedBy ? { ...a.approvedBy, _id: a.approvedBy.id } : null,
    createdBy: a.createdBy ? { ...a.createdBy, _id: a.createdBy.id } : null
  };
};

// Date builder helper
const buildAppointmentDate = (dateInput, timeInput) => {
  if (!dateInput) return null;

  if (timeInput && /^\d{2}:\d{2}$/.test(timeInput)) {
    const [y, m, d] = String(dateInput).split('-').map((n) => parseInt(n, 10));
    const [hh, mm] = String(timeInput).split(':').map((n) => parseInt(n, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) && Number.isFinite(hh) && Number.isFinite(mm)) {
      const combined = new Date(y, m - 1, d, hh, mm, 0, 0);
      if (!Number.isNaN(combined.getTime())) return combined;
    }
  }

  if (typeof dateInput === 'string' && /(T|\s)\d{1,2}:\d{2}/.test(dateInput)) {
    const direct = new Date(dateInput);
    if (!Number.isNaN(direct.getTime())) return direct;
  }

  const [y, m, d] = String(dateInput).split('-').map((n) => parseInt(n, 10));
  if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
    const onlyDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (!Number.isNaN(onlyDate.getTime())) return onlyDate;
  }

  return null;
};

// Generate random unique pass number
const generatePassNumber = async () => {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt++) {
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const candidate = `VP${dateStr}${random}`;
    const exists = await prisma.pass.findUnique({ where: { passNumber: candidate } });
    if (!exists) return candidate;
  }
  return `VP${dateStr}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
};

// POST /api/appointments
const createAppointment = async (req, res) => {
  try {
    const { visitorId, hostId, appointmentDate, appointmentTime, duration, purpose, location, notes } = req.body;

    const photoUrl = req.file?.url || req.file?.secure_url || req.file?.path;
    if (!photoUrl) {
      return res.status(400).json({ error: 'Visitor photo is required' });
    }

    if (!hostId || !purpose || !location) {
      return res.status(400).json({ error: 'hostId, purpose and location are required' });
    }

    let resolvedVisitorId = visitorId;

    // If logged-in visitor, resolve or auto-create their Visitor profile
    if (req.user && req.user.role === 'visitor') {
      let visitor = await prisma.visitor.findUnique({
        where: { userId: req.user.id }
      });

      if (!visitor) {
        visitor = await prisma.visitor.create({
          data: {
            userId: req.user.id,
            name: req.user.name || 'Visitor',
            email: req.user.email,
            phone: req.user.phone || 'N/A',
            company: '',
            idType: 'other',
            idNumber: `AUTO-${Date.now()}`,
            photo: photoUrl || '/uploads/placeholder.jpg',
            purpose: purpose || 'Visitor appointment',
            visitCount: 0,
            lastVisit: new Date()
          }
        });
      }

      if (visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot create appointment for blacklisted visitor' });
      }
      resolvedVisitorId = visitor.id;
    } else if (resolvedVisitorId) {
      const visitor = await prisma.visitor.findUnique({ where: { id: resolvedVisitorId } });
      if (visitor && visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot create appointment for blacklisted visitor' });
      }
    }

    const host = await prisma.user.findUnique({ where: { id: hostId } });
    if (!host) return res.status(404).json({ error: 'Host not found' });
    if ((host.role || '').toString().toLowerCase() !== 'employee') {
      return res.status(400).json({ error: 'Appointments can only be scheduled with employee hosts' });
    }
    if (!host.isActive) {
      return res.status(400).json({ error: 'Selected host is not active' });
    }

    const appointmentDateObj = buildAppointmentDate(appointmentDate, appointmentTime);
    if (!appointmentDateObj) {
      return res.status(400).json({ error: 'Invalid appointment date/time format' });
    }
    if (appointmentDateObj <= new Date()) {
      return res.status(400).json({ error: 'Appointment date/time cannot be in the past' });
    }

    const normalizedTime = appointmentTime && /^\d{2}:\d{2}$/.test(appointmentTime)
      ? appointmentTime
      : appointmentDateObj.toTimeString().slice(0, 5);

    const newAppointment = await prisma.appointment.create({
      data: {
        visitorId: resolvedVisitorId || undefined,
        hostId: host.id,
        appointmentDate: appointmentDateObj,
        appointmentTime: normalizedTime,
        duration: Number(duration) || 60,
        purpose,
        location,
        notes,
        visitorPhoto: photoUrl,
        status: 'pending',
        createdById: req.user?.id
      },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true, department: true, role: true } }
      }
    });

    // Notify host via email (best-effort)
    try {
      const visitorName = newAppointment.visitor?.name || req.body.visitorName || 'Guest';
      const hostHtml = `
        <h2>New Appointment Request</h2>
        <p>Dear ${host.name},</p>
        <p>You have a new appointment request:</p>
        <ul>
          <li><strong>Visitor:</strong> ${visitorName}</li>
          <li><strong>Date:</strong> ${appointmentDateObj.toLocaleDateString()}</li>
          <li><strong>Time:</strong> ${normalizedTime}</li>
          <li><strong>Purpose:</strong> ${purpose}</li>
        </ul>
        <p>Please review and approve or reject this appointment in the system.</p>
      `;
      sendEmail(host.email, 'New Appointment Request', hostHtml);
    } catch (mailErr) {
      logger.warn('Failed to send appointment request email to host:', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      appointment: formatAppointment(newAppointment)
    });
  } catch (err) {
    logger.error('Error creating appointment:', err);
    return res.status(500).json({ error: 'Server error while creating appointment', details: err.message });
  }
};

// POST /api/appointments/public
const createAppointmentPublic = async (req, res) => {
  try {
    const { visitorId, hostId, appointmentDate, appointmentTime, duration, purpose, location, notes } = req.body;

    if (!hostId || !purpose || !location) {
      return res.status(400).json({ error: 'hostId, purpose and location are required' });
    }

    let visitor = null;
    if (visitorId) {
      visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
      if (visitor && visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot create appointment for blacklisted visitor' });
      }
    }

    const host = await prisma.user.findUnique({ where: { id: hostId } });
    if (!host) return res.status(404).json({ error: 'Host not found' });
    if ((host.role || '').toString().toLowerCase() !== 'employee') {
      return res.status(400).json({ error: 'Appointments can only be scheduled with employee hosts' });
    }
    if (!host.isActive) {
      return res.status(400).json({ error: 'Selected host is not active' });
    }

    const appointmentDateObj = buildAppointmentDate(appointmentDate, appointmentTime);
    if (!appointmentDateObj) {
      return res.status(400).json({ error: 'Invalid or missing appointmentDate' });
    }
    if (appointmentDateObj <= new Date()) {
      return res.status(400).json({ error: 'Appointment date/time cannot be in the past' });
    }

    const normalizedTime = appointmentTime && /^\d{2}:\d{2}$/.test(appointmentTime)
      ? appointmentTime
      : appointmentDateObj.toTimeString().slice(0, 5);

    const photoUrl = req.file?.url || req.file?.secure_url || req.file?.path || null;

    const newAppointment = await prisma.appointment.create({
      data: {
        visitorId: visitor ? visitor.id : undefined,
        hostId: host.id,
        appointmentDate: appointmentDateObj,
        appointmentTime: normalizedTime,
        duration: Number(duration) || 60,
        purpose,
        location,
        notes,
        visitorPhoto: photoUrl,
        status: 'pending'
      },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true, department: true, role: true } }
      }
    });

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
        <p>Please review and approve or reject this appointment.</p>
      `;
      sendEmail(host.email, 'New Appointment Request', hostEmailHtml);
    } catch (mailErr) {
      logger.warn('Failed to send public appointment email to host:', mailErr.message);
    }

    return res.status(201).json({ success: true, appointment: formatAppointment(newAppointment) });
  } catch (err) {
    logger.error('Error creating public appointment:', err);
    return res.status(500).json({ error: 'Server error while creating appointment', details: err.message });
  }
};

// GET /api/appointments
const getAllAppointments = async (req, res) => {
  try {
    let { status, date, hostId, page = 1, limit = 10 } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.max(parseInt(limit, 10) || 10, 1);

    const where = {};
    if (status) where.status = status;

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      where.appointmentDate = { gte: startDate, lt: endDate };
    }

    if (req.user && req.user.role === 'employee') {
      where.hostId = req.user.id;
    } else if (hostId) {
      where.hostId = hostId;
    }

    const [appointments, count] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          visitor: true,
          host: { select: { id: true, name: true, email: true, phone: true, department: true, role: true } },
          approvedBy: { select: { id: true, name: true } }
        },
        orderBy: [
          { appointmentDate: 'desc' },
          { appointmentTime: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.appointment.count({ where })
    ]);

    return res.status(200).json({
      appointments: appointments.map(formatAppointment),
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalAppointments: count
    });
  } catch (err) {
    logger.error('getAllAppointments error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/appointments/:id
const getAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true, department: true, role: true } },
        approvedBy: { select: { id: true, name: true } }
      }
    });

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (req.user && req.user.role === 'employee') {
      if (appointment.hostId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: not your appointment' });
      }
    }

    return res.status(200).json(formatAppointment(appointment));
  } catch (err) {
    logger.error('getAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/appointments/my (authenticated visitor)
const getMyAppointments = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role !== 'visitor') {
      return res.status(403).json({ error: 'Only visitors can access this endpoint' });
    }

    const visitorDoc = await prisma.visitor.findUnique({
      where: { userId: req.user.id }
    });

    if (!visitorDoc) {
      return res.status(200).json({ appointments: [] });
    }

    const appointments = await prisma.appointment.findMany({
      where: { visitorId: visitorDoc.id },
      include: {
        visitor: { select: { id: true, name: true, email: true, phone: true } },
        host: { select: { id: true, name: true, email: true, department: true } },
        approvedBy: { select: { id: true, name: true } }
      },
      orderBy: [
        { appointmentDate: 'desc' },
        { appointmentTime: 'desc' }
      ]
    });

    return res.status(200).json({ appointments: appointments.map(formatAppointment) });
  } catch (err) {
    logger.error('getMyAppointments error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/appointments/visitor/:visitorId
const getAppointmentsByVisitor = async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!visitorId) return res.status(400).json({ error: 'visitorId is required' });

    const appointments = await prisma.appointment.findMany({
      where: { visitorId },
      include: {
        visitor: { select: { id: true, name: true, email: true, phone: true } },
        host: { select: { id: true, name: true, email: true, department: true } },
        approvedBy: { select: { id: true, name: true } }
      },
      orderBy: [
        { appointmentDate: 'desc' },
        { appointmentTime: 'desc' }
      ]
    });

    return res.status(200).json({ appointments: appointments.map(formatAppointment) });
  } catch (err) {
    logger.error('getAppointmentsByVisitor error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// PATCH /api/appointments/:id/approve
const approveAppointment = async (req, res) => {
  const { id } = req.params;

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { visitor: true, host: true }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (req.user && req.user.role === 'employee' && appointment.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: only the assigned host can approve' });
    }

    let emailSent = false;
    let smsSent = false;

    // 1. Auto-issue an active pass linked to this appointment if none exists
    let pass = await prisma.pass.findFirst({
      where: { appointmentId: appointment.id, status: 'active' }
    });

    if (!pass) {
      const passNumber = await generatePassNumber();
      const base = new Date(appointment.appointmentDate);
      const durationMinutes = Number(appointment.duration) || 60;
      const validFrom = new Date(base.getTime() - 30 * 60000);
      const validUntil = new Date(base.getTime() + (durationMinutes + 30) * 60000);

      // Generate PII-free QR code
      const qrCodeDataURL = await generateQRCode({
        passNumber,
        appointmentId: appointment.id
      });

      pass = await prisma.pass.create({
        data: {
          passNumber,
          visitorId: appointment.visitorId,
          appointmentId: appointment.id,
          issuedById: req.user?.id,
          hostId: appointment.hostId,
          validFrom,
          validUntil,
          qrCode: qrCodeDataURL,
          status: 'active',
          accessAreas: ['Main Entrance', 'Meeting Area']
        }
      });
      logger.info(`✓ Auto-issued pass ${pass.passNumber} for appointment ${appointment.id}`);
    }

    // 2. Update appointment status
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'approved',
        approvedById: req.user?.id,
        approvalDate: new Date()
      },
      include: { visitor: true, host: true }
    });

    // 3. Send email with QR code
    if (updatedAppointment.visitor?.email) {
      try {
        const qrCodeDataURL = pass?.qrCode || await generateQRCode({
          passNumber: pass?.passNumber,
          appointmentId: appointment.id
        });
        await sendAppointmentConfirmation(updatedAppointment, updatedAppointment.visitor, updatedAppointment.host, qrCodeDataURL);
        emailSent = true;
      } catch (e) {
        logger.error(`Failed to send appointment confirmation email for ID ${id}:`, e);
      }
    }

    // 4. Send SMS
    if (updatedAppointment.visitor?.phone) {
      try {
        await sendAppointmentSMS(updatedAppointment.visitor.phone, {
          date: new Date(updatedAppointment.appointmentDate).toLocaleDateString(),
          time: updatedAppointment.appointmentTime,
          location: updatedAppointment.location,
          host: updatedAppointment.host?.name || ''
        });
        smsSent = true;
      } catch (e) {
        logger.warn(`Failed to send appointment SMS for ID ${id}:`, e.message);
      }
    }

    await prisma.appointment.update({
      where: { id },
      data: { notificationsSent: emailSent }
    });

    const responseObj = {
      ...formatAppointment(updatedAppointment),
      _notificationStatus: {
        emailSent,
        smsSent,
        message: emailSent ? 'Appointment approved and email sent with QR code' : 'Appointment approved (email notification skipped/failed)'
      }
    };

    return res.status(200).json(responseObj);
  } catch (err) {
    logger.error(`Critical error during approval for ID ${id}:`, err);
    return res.status(500).json({ error: err.message });
  }
};

// PATCH /api/appointments/:id/reject
const rejectAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { visitor: true, host: true }
    });

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (req.user && req.user.role === 'employee' && appointment.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: only the assigned host can reject' });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedById: req.user?.id,
        approvalDate: new Date(),
        rejectionReason: rejectionReason || 'No reason provided'
      },
      include: { visitor: true, host: true }
    });

    if (updated.visitor?.email) {
      try {
        const rejectionEmail = `
          <h2>Appointment Rejected</h2>
          <p>Dear ${updated.visitor.name},</p>
          <p>Your appointment request for ${new Date(updated.appointmentDate).toLocaleDateString()} at ${updated.appointmentTime} has been rejected.</p>
          ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
          <p>Please contact ${updated.host.name} for more information.</p>
        `;
        sendEmail(updated.visitor.email, 'Appointment Rejected', rejectionEmail);
      } catch (e) {
        logger.warn('Failed to send rejection email:', e.message);
      }
    }

    return res.status(200).json(formatAppointment(updated));
  } catch (err) {
    logger.error('rejectAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// PATCH /api/appointments/:id/cancel
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { visitor: true, host: true }
    });

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (req.user && req.user.role === 'employee' && appointment.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: only the assigned host can cancel' });
    }

    if (req.user && req.user.role === 'visitor') {
      const visitorDoc = await prisma.visitor.findUnique({ where: { userId: req.user.id } });
      if (!visitorDoc || appointment.visitorId !== visitorDoc.id) {
        return res.status(403).json({ error: 'Forbidden: only the appointment owner can cancel' });
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'cancelled' },
      include: { visitor: true, host: true }
    });

    try {
      const cancellationEmail = `
        <h2>Appointment Cancelled</h2>
        <p>The appointment scheduled for ${new Date(appointment.appointmentDate).toLocaleDateString()} at ${appointment.appointmentTime} has been cancelled.</p>
      `;
      if (appointment.visitor?.email) sendEmail(appointment.visitor.email, 'Appointment Cancelled', cancellationEmail);
      if (appointment.host?.email) sendEmail(appointment.host.email, 'Appointment Cancelled', cancellationEmail);
    } catch (e) {
      logger.warn('Failed to send cancellation emails:', e.message);
    }

    return res.status(200).json(formatAppointment(updated));
  } catch (err) {
    logger.error('cancelAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// PATCH /api/appointments/:id
const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.appointmentDate || updateData.appointmentTime) {
      const dateObj = buildAppointmentDate(updateData.appointmentDate, updateData.appointmentTime);
      if (!dateObj) return res.status(400).json({ error: 'Invalid appointment date/time' });
      if (dateObj < new Date()) return res.status(400).json({ error: 'Appointment date cannot be in the past' });
      updateData.appointmentDate = dateObj;
      if (!updateData.appointmentTime) updateData.appointmentTime = dateObj.toTimeString().slice(0, 5);
    }

    delete updateData.id;
    delete updateData._id;

    const appointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true } }
      }
    });

    return res.status(200).json(formatAppointment(appointment));
  } catch (err) {
    logger.error('updateAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// DELETE /api/appointments/:id
const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { visitor: true, host: true }
    });

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (req.user && req.user.role === 'employee' && appointment.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: only the assigned host can delete' });
    }

    if (req.user && req.user.role === 'visitor') {
      const visitorDoc = await prisma.visitor.findUnique({ where: { userId: req.user.id } });
      if (!visitorDoc || appointment.visitorId !== visitorDoc.id) {
        return res.status(403).json({ error: 'Forbidden: only the appointment owner can delete' });
      }
    }

    await prisma.appointment.delete({ where: { id } });

    try {
      const deletionEmail = `
        <h2>Appointment Deleted</h2>
        <p>The appointment scheduled for ${new Date(appointment.appointmentDate).toLocaleDateString()} at ${appointment.appointmentTime} has been deleted.</p>
      `;
      if (appointment.visitor?.email) sendEmail(appointment.visitor.email, 'Appointment Deleted', deletionEmail);
      if (appointment.host?.email) sendEmail(appointment.host.email, 'Appointment Deleted', deletionEmail);
    } catch (e) {
      logger.warn('Failed to send deletion emails:', e.message);
    }

    return res.status(200).json({ message: 'Appointment deleted successfully' });
  } catch (err) {
    logger.error('deleteAppointment error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/appointments/stats
const getAppointmentStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where = {};
    if (req.user && req.user.role === 'employee') {
      where.hostId = req.user.id;
    }

    const [total, pending, approved, rejected, todayAppointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.count({ where: { ...where, status: 'pending' } }),
      prisma.appointment.count({ where: { ...where, status: 'approved' } }),
      prisma.appointment.count({ where: { ...where, status: 'rejected' } }),
      prisma.appointment.count({
        where: {
          ...where,
          appointmentDate: { gte: today, lt: tomorrow },
          status: 'approved'
        }
      })
    ]);

    return res.status(200).json({
      total,
      pending,
      approved,
      rejected,
      todayAppointments
    });
  } catch (err) {
    logger.error('getAppointmentStats error:', err);
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
  deleteAppointment,
  updateAppointment,
  getAppointmentStats
};
