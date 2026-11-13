const prisma = require('../config/prisma');
const { generateQRCode } = require('../utils/qrGenerator');
const { generatePassPDF } = require('../utils/pdfGenerator');
const { sendPassDetails } = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');
const { logger } = require('../utils/logger');

// Format pass with _id and id for compatibility
const formatPass = (p) => {
  if (!p) return null;
  return {
    ...p,
    _id: p.id,
    visitor: p.visitor ? { ...p.visitor, _id: p.visitor.id } : null,
    host: p.host ? { ...p.host, _id: p.host.id } : null,
    issuedBy: p.issuedBy ? { ...p.issuedBy, _id: p.issuedBy.id } : null,
    appointment: p.appointment ? { ...p.appointment, _id: p.appointment.id } : null
  };
};

// Generate unique pass number
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

// GET /api/passes/my/active or /api/passes/my
const getMyActivePass = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const visitor = await prisma.visitor.findUnique({
      where: { userId }
    });

    if (!visitor) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No visitor profile found for this user'
      });
    }

    const pass = await prisma.pass.findFirst({
      where: {
        visitorId: visitor.id,
        status: 'active'
      },
      orderBy: { createdAt: 'desc' },
      include: {
        visitor: { select: { id: true, name: true, email: true, phone: true } },
        host: { select: { id: true, name: true, department: true } }
      }
    });

    if (!pass) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No active pass found'
      });
    }

    return res.status(200).json({
      success: true,
      data: formatPass(pass)
    });
  } catch (err) {
    logger.error('getMyActivePass error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/passes (Admin / Security)
const issuePass = async (req, res) => {
  try {
    const {
      visitorId,
      appointmentId,
      hostId,
      validFrom,
      validUntil,
      accessAreas,
      specialInstructions
    } = req.body;

    let appointment = null;
    if (appointmentId) {
      appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { visitor: true, host: true }
      });
      if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    }

    let resolvedVisitorId = appointment?.visitorId || visitorId;
    if (!resolvedVisitorId) {
      const visitorForUser = await prisma.visitor.findUnique({ where: { userId: req.user.id } });
      if (visitorForUser) resolvedVisitorId = visitorForUser.id;
      else return res.status(400).json({ error: 'Visitor is required to issue a pass' });
    }

    const resolvedHostId = hostId || appointment?.hostId;
    if (!resolvedHostId) {
      return res.status(400).json({ error: 'Host is required to issue a pass' });
    }

    const visitor = await prisma.visitor.findUnique({ where: { id: resolvedVisitorId } });
    if (visitor && visitor.isBlacklisted) {
      return res.status(403).json({ error: 'Cannot issue pass to blacklisted visitor' });
    }

    const passNumber = await generatePassNumber();
    const validFromDate = validFrom ? new Date(validFrom) : new Date();
    const validUntilDate = validUntil ? new Date(validUntil) : new Date(Date.now() + 8 * 3600000);

    // Generate PII-free QR code
    const qrCodeDataURL = await generateQRCode({
      passNumber,
      appointmentId: appointmentId || appointment?.id
    });

    // Handle access areas array
    let areas = [];
    if (Array.isArray(accessAreas)) areas = accessAreas;
    else if (typeof accessAreas === 'string') areas = accessAreas.split(',').map(s => s.trim()).filter(Boolean);

    let pass = await prisma.pass.create({
      data: {
        passNumber,
        visitorId: resolvedVisitorId,
        appointmentId: appointmentId || appointment?.id || undefined,
        issuedById: req.user?.id,
        hostId: resolvedHostId,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        qrCode: qrCodeDataURL,
        accessAreas: areas,
        specialInstructions: specialInstructions || '',
        status: 'active'
      },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true, department: true } },
        issuedBy: { select: { id: true, name: true } },
        appointment: true
      }
    });

    // Generate PDF badge
    try {
      const pdfUrl = await generatePassPDF(pass, qrCodeDataURL);
      pass = await prisma.pass.update({
        where: { id: pass.id },
        data: { pdfPath: pdfUrl },
        include: {
          visitor: true,
          host: { select: { id: true, name: true, email: true, phone: true, department: true } },
          issuedBy: { select: { id: true, name: true } },
          appointment: true
        }
      });

      // Send pass details via email
      if (visitor?.email) {
        sendPassDetails(pass, visitor, pdfUrl).catch(e => logger.warn('Failed to send pass email:', e.message));
      }
    } catch (pdfErr) {
      logger.warn('PDF badge generation error:', pdfErr.message);
    }

    // Send SMS alert
    if (visitor?.phone) {
      const smsMsg = `Your visitor pass ${pass.passNumber} is issued and valid from ${new Date(pass.validFrom).toLocaleTimeString()} to ${new Date(pass.validUntil).toLocaleTimeString()}.`;
      sendSMS(visitor.phone, smsMsg).catch(e => logger.warn('Failed to send pass SMS:', e.message));
    }

    return res.status(201).json(formatPass(pass));
  } catch (error) {
    logger.error('Error issuing pass:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/passes
const getAllPasses = async (req, res) => {
  try {
    const { status, visitorId, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);

    const where = {};
    if (status) where.status = status;
    if (visitorId) where.visitorId = visitorId;

    const [passes, count] = await Promise.all([
      prisma.pass.findMany({
        where,
        include: {
          visitor: true,
          host: { select: { id: true, name: true, department: true } },
          issuedBy: { select: { id: true, name: true } },
          appointment: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.pass.count({ where })
    ]);

    return res.status(200).json({
      passes: passes.map(formatPass),
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      totalPasses: count
    });
  } catch (error) {
    logger.error('getAllPasses error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/passes/:id
const getPass = async (req, res) => {
  try {
    const { id } = req.params;
    const pass = await prisma.pass.findUnique({
      where: { id },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true, department: true } },
        issuedBy: { select: { id: true, name: true } },
        appointment: true
      }
    });

    if (!pass) return res.status(404).json({ error: 'Pass not found' });

    return res.status(200).json(formatPass(pass));
  } catch (error) {
    logger.error('getPass error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// Helper to coerce pass value
const coerceToStringId = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object') {
    if (value.appointmentId) return String(value.appointmentId).trim();
    if (value.passNumber) return String(value.passNumber).trim();
    if (value.token) return String(value.token).trim();
    if (value.id) return String(value.id).trim();
    if (value._id) return String(value._id).trim();
  }
  return '';
};

// POST /api/passes/verify and GET /api/passes/verify/:passNumber
const verifyPass = async (req, res) => {
  try {
    const paramPassNumber = req.params.passNumber;
    const rawBodyValue = req.body?.value ?? req.body?.passNumber ?? req.body?.appointmentId ?? req.body?.token;
    const rawInput = paramPassNumber || rawBodyValue;

    let searchValue = coerceToStringId(rawInput);
    if (typeof rawInput === 'string' && rawInput.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawInput);
        searchValue = coerceToStringId(parsed);
      } catch (e) {
        // use raw string
      }
    }

    if (!searchValue || searchValue === '[object Object]') {
      return res.status(400).json({ valid: false, error: 'Invalid value to verify' });
    }

    // Try finding by passNumber, id, qrToken, or appointmentId
    let pass = await prisma.pass.findFirst({
      where: {
        OR: [
          { passNumber: searchValue },
          { id: searchValue },
          { qrToken: searchValue },
          { appointmentId: searchValue }
        ]
      },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, department: true } },
        appointment: true
      }
    });

    // If not found yet, check if this is an approved appointment that needs auto-issue
    if (!pass) {
      const appointment = await prisma.appointment.findUnique({
        where: { id: searchValue },
        include: { visitor: true, host: true }
      });

      if (appointment && appointment.status === 'approved') {
        const passNumber = await generatePassNumber();
        const base = new Date(appointment.appointmentDate);
        const durationMinutes = Number(appointment.duration) || 60;
        const validFrom = new Date(base.getTime() - 30 * 60000);
        const validUntil = new Date(base.getTime() + (durationMinutes + 30) * 60000);

        pass = await prisma.pass.create({
          data: {
            passNumber,
            visitorId: appointment.visitorId,
            appointmentId: appointment.id,
            hostId: appointment.hostId,
            validFrom,
            validUntil,
            status: 'active'
          },
          include: {
            visitor: true,
            host: { select: { id: true, name: true, department: true } },
            appointment: true
          }
        });
      }
    }

    if (!pass) {
      return res.status(404).json({ valid: false, error: 'Pass not found' });
    }

    if (pass.status !== 'active') {
      return res.status(400).json({ valid: false, error: `Pass is ${pass.status}` });
    }

    const now = new Date();
    if (now < pass.validFrom || now > pass.validUntil) {
      return res.status(400).json({ valid: false, error: 'Pass is not valid at this time' });
    }

    if (pass.visitor?.isBlacklisted) {
      return res.status(403).json({ valid: false, error: 'Visitor is blacklisted' });
    }

    const chosenPhoto = pass.appointment?.visitorPhoto || pass.visitor?.photo || null;

    return res.status(200).json({
      valid: true,
      pass: formatPass(pass),
      visitorPhoto: chosenPhoto
    });
  } catch (error) {
    logger.error('[VerifyPass] Error:', error);
    return res.status(400).json({ valid: false, error: error.message });
  }
};

// PATCH /api/passes/:id/revoke (admin only)
const revokePass = async (req, res) => {
  try {
    const { id } = req.params;

    const pass = await prisma.pass.update({
      where: { id },
      data: { status: 'revoked' },
      include: { visitor: true }
    });

    return res.status(200).json(formatPass(pass));
  } catch (error) {
    logger.error('revokePass error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// PATCH /api/passes/update-expired
const updateExpiredPasses = async (req, res) => {
  try {
    const now = new Date();
    const result = await prisma.pass.updateMany({
      where: {
        validUntil: { lt: now },
        status: 'active'
      },
      data: { status: 'expired' }
    });

    return res.status(200).json({
      message: 'Expired passes updated',
      modifiedCount: result.count
    });
  } catch (error) {
    logger.error('updateExpiredPasses error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/passes/stats
const getPassStats = async (req, res) => {
  try {
    const [total, active, expired, revoked] = await Promise.all([
      prisma.pass.count(),
      prisma.pass.count({ where: { status: 'active' } }),
      prisma.pass.count({ where: { status: 'expired' } }),
      prisma.pass.count({ where: { status: 'revoked' } })
    ]);

    return res.status(200).json({ total, active, expired, revoked });
  } catch (error) {
    logger.error('getPassStats error:', error);
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  issuePass,
  getAllPasses,
  getPass,
  verifyPass,
  revokePass,
  updateExpiredPasses,
  getPassStats,
  getMyActivePass
};
