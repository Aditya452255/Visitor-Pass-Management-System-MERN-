const prisma = require('../config/prisma');
const { sendEmail } = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');
const { logger } = require('../utils/logger');

// Format CheckLog object for frontend compatibility
const formatCheckLog = (log) => {
  if (!log) return null;

  let duration = null;
  if (log.checkOutTime && log.checkInTime) {
    duration = Math.floor((new Date(log.checkOutTime).getTime() - new Date(log.checkInTime).getTime()) / 60000);
  }

  return {
    ...log,
    _id: log.id,
    duration,
    visitor: log.visitor ? { ...log.visitor, _id: log.visitor.id } : null,
    pass: log.pass ? { ...log.pass, _id: log.pass.id } : null,
    checkedInBy: log.checkedInBy ? { ...log.checkedInBy, _id: log.checkedInBy.id } : null,
    checkedOutBy: log.checkedOutBy ? { ...log.checkedOutBy, _id: log.checkedOutBy.id } : null
  };
};

// POST /api/checklogs/checkin (Admin / Security)
const checkIn = async (req, res) => {
  try {
    const { passId, appointmentId, visitorId, temperature, deviceInfo, notes, location } = req.body;

    let resolvedPassId = passId;

    // Resolve pass via appointmentId if passId not given directly
    if (appointmentId && !resolvedPassId) {
      const foundPass = await prisma.pass.findFirst({
        where: { appointmentId, status: 'active' }
      });
      if (foundPass) resolvedPassId = foundPass.id;
    }

    if (!resolvedPassId || !visitorId) {
      return res.status(400).json({ error: 'passId (or appointmentId) and visitorId are required' });
    }

    const pass = await prisma.pass.findUnique({
      where: { id: resolvedPassId },
      include: {
        visitor: true,
        host: { select: { id: true, name: true, email: true, phone: true } }
      }
    });

    if (!pass) return res.status(404).json({ error: 'Pass not found' });
    if (pass.status !== 'active') return res.status(400).json({ error: `Pass is ${pass.status}` });

    // Check if visitor is already checked in with open check-out
    const existingCheckIn = await prisma.checkLog.findFirst({
      where: {
        passId: resolvedPassId,
        checkOutTime: null
      }
    });

    if (existingCheckIn) {
      return res.status(400).json({ error: 'Visitor is already checked in' });
    }

    // Create checklog
    const checkLog = await prisma.checkLog.create({
      data: {
        passId: resolvedPassId,
        visitorId,
        checkInTime: new Date(),
        checkedInById: req.user?.id,
        temperature: temperature ? parseFloat(temperature) : null,
        deviceInfo: deviceInfo || {},
        notes: notes ? notes.trim() : null,
        location: location ? location.trim() : 'Main Gate'
      },
      include: {
        visitor: true,
        pass: { include: { host: { select: { id: true, name: true, email: true, phone: true } } } },
        checkedInBy: { select: { id: true, name: true } }
      }
    });

    // Update visitor visit count and lastVisit
    try {
      await prisma.visitor.update({
        where: { id: visitorId },
        data: {
          visitCount: { increment: 1 },
          lastVisit: new Date()
        }
      });
    } catch (e) {
      logger.warn('Failed to update visitor visit count:', e.message);
    }

    // Send notifications to host and visitor (best-effort)
    const host = checkLog.pass?.host;
    if (host && host.email) {
      const html = `
        <h2>Visitor Checked In</h2>
        <p>Dear ${host.name},</p>
        <p>Your visitor <strong>${checkLog.visitor.name}</strong> has checked in at ${new Date(checkLog.checkInTime).toLocaleString()}.</p>
        <ul>
          <li><strong>Visitor:</strong> ${checkLog.visitor.name} (${checkLog.visitor.email})</li>
          <li><strong>Phone:</strong> ${checkLog.visitor.phone}</li>
          <li><strong>Location:</strong> ${checkLog.location || 'Security Gate'}</li>
        </ul>
      `;
      sendEmail(host.email, 'Visitor Checked In', html).catch(err => logger.warn('Check-in email failed:', err.message));
    }

    if (checkLog.visitor?.phone) {
      const msg = `You have checked in at ${new Date(checkLog.checkInTime).toLocaleTimeString()} at ${checkLog.location || 'Security Gate'}.`;
      sendSMS(checkLog.visitor.phone, msg).catch(err => logger.warn('Check-in visitor SMS failed:', err.message));
    }

    return res.status(201).json(formatCheckLog(checkLog));
  } catch (error) {
    logger.error('Check-in error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /api/checklogs/checkout/:id (Admin / Security)
const checkOut = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const checkLog = await prisma.checkLog.findUnique({ where: { id } });
    if (!checkLog) return res.status(404).json({ error: 'Check-in log not found' });
    if (checkLog.checkOutTime) return res.status(400).json({ error: 'Visitor already checked out' });

    const updatedNotes = notes
      ? (checkLog.notes ? `${checkLog.notes} ${notes}` : notes)
      : checkLog.notes;

    const updated = await prisma.checkLog.update({
      where: { id },
      data: {
        checkOutTime: new Date(),
        checkedOutById: req.user?.id,
        notes: updatedNotes
      },
      include: {
        visitor: true,
        pass: true,
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } }
      }
    });

    return res.status(200).json(formatCheckLog(updated));
  } catch (error) {
    logger.error('Check-out error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/checklogs
const getAllCheckLogs = async (req, res) => {
  try {
    const { date, visitorId, status, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);

    const where = {};
    if (date) {
      const startDate = new Date(date);
      if (!isNaN(startDate.getTime())) {
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        where.checkInTime = { gte: startDate, lt: endDate };
      }
    }

    if (visitorId) where.visitorId = visitorId;

    if (status === 'checked-in') {
      where.checkOutTime = null;
    } else if (status === 'checked-out') {
      where.checkOutTime = { not: null };
    }

    const [checkLogs, count] = await Promise.all([
      prisma.checkLog.findMany({
        where,
        include: {
          visitor: true,
          pass: true,
          checkedInBy: { select: { id: true, name: true } },
          checkedOutBy: { select: { id: true, name: true } }
        },
        orderBy: { checkInTime: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.checkLog.count({ where })
    ]);

    return res.status(200).json({
      checkLogs: checkLogs.map(formatCheckLog),
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      totalCheckLogs: count
    });
  } catch (error) {
    logger.error('GetAllCheckLogs error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/checklogs/:id
const getCheckLog = async (req, res) => {
  try {
    const { id } = req.params;
    const checkLog = await prisma.checkLog.findUnique({
      where: { id },
      include: {
        visitor: true,
        pass: true,
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } }
      }
    });

    if (!checkLog) return res.status(404).json({ error: 'Check log not found' });

    return res.status(200).json(formatCheckLog(checkLog));
  } catch (error) {
    logger.error('GetCheckLog error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/checklogs/current (currently inside)
const getCurrentVisitors = async (req, res) => {
  try {
    const currentVisitors = await prisma.checkLog.findMany({
      where: { checkOutTime: null },
      include: {
        visitor: true,
        pass: true,
        checkedInBy: { select: { id: true, name: true } }
      },
      orderBy: { checkInTime: 'desc' }
    });

    return res.status(200).json(currentVisitors.map(formatCheckLog));
  } catch (error) {
    logger.error('GetCurrentVisitors error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/checklogs/stats
const getCheckLogStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [currentlyInside, todayCheckIns, todayCheckOuts, totalVisits, todayCompletedLogs] = await Promise.all([
      prisma.checkLog.count({ where: { checkOutTime: null } }),
      prisma.checkLog.count({ where: { checkInTime: { gte: today, lt: tomorrow } } }),
      prisma.checkLog.count({ where: { checkOutTime: { gte: today, lt: tomorrow } } }),
      prisma.checkLog.count(),
      prisma.checkLog.findMany({
        where: {
          checkInTime: { gte: today, lt: tomorrow },
          checkOutTime: { not: null }
        },
        select: { checkInTime: true, checkOutTime: true }
      })
    ]);

    let averageVisitDuration = 0;
    if (todayCompletedLogs.length > 0) {
      const totalMinutes = todayCompletedLogs.reduce((sum, log) => {
        const diff = (new Date(log.checkOutTime).getTime() - new Date(log.checkInTime).getTime()) / 60000;
        return sum + diff;
      }, 0);
      averageVisitDuration = Math.round(totalMinutes / todayCompletedLogs.length);
    }

    return res.status(200).json({
      currentlyInside,
      todayCheckIns,
      todayCheckOuts,
      totalVisits,
      averageVisitDuration
    });
  } catch (error) {
    logger.error('GetCheckLogStats error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/checklogs/visitor/:visitorId
const getVisitorHistory = async (req, res) => {
  try {
    const { visitorId } = req.params;
    const history = await prisma.checkLog.findMany({
      where: { visitorId },
      include: {
        pass: true,
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } }
      },
      orderBy: { checkInTime: 'desc' }
    });

    return res.status(200).json(history.map(formatCheckLog));
  } catch (error) {
    logger.error('GetVisitorHistory error:', error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  checkIn,
  checkOut,
  getAllCheckLogs,
  getCheckLog,
  getCurrentVisitors,
  getCheckLogStats,
  getVisitorHistory
};
