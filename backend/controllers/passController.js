const Pass = require('../models/Pass');
const Visitor = require('../models/Visitor');
const Appointment = require('../models/Appointment');
const { generateQRCode } = require('../utils/qrGenerator');
const { generatePassPDF } = require('../utils/pdfGenerator');
const { sendPassDetails } = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');

// Issue a new pass
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

    if (!visitorId || !hostId || !validUntil) {
      return res.status(400).json({ error: 'visitorId, hostId, and validUntil are required' });
    }

    // Try to resolve visitor if an id was provided. Do not block issuance
    // if the visitor record is missing; allow passes to be created from
    // external/temporary visitor info.
    let visitor = null;
    if (visitorId) {
      visitor = await Visitor.findById(visitorId);
      // If visitor exists, check blacklist status
      if (visitor && visitor.isBlacklisted) {
        return res.status(403).json({ error: 'Cannot issue pass to blacklisted visitor' });
      }
    }

    // Create pass
    const pass = new Pass({
      visitor: visitorId,
      appointment: appointmentId,
      issuedBy: req.user._id,
      host: hostId,
      validFrom: validFrom || new Date(),
      validUntil,
      accessAreas,
      specialInstructions,
      status: 'active'
    });

    // Generate pass number (pre-save hook will handle this)
    await pass.save();

    // Generate QR code with pass data
    const qrData = {
      passNumber: pass.passNumber,
      visitorId: visitor ? visitor._id : visitorId || null,
      visitorName: visitor ? visitor.name : 'Visitor',
      validFrom: pass.validFrom,
      validUntil: pass.validUntil
    };

    const qrCodeDataURL = await generateQRCode(qrData);
    pass.qrCode = qrCodeDataURL;

    // Populate pass for PDF generation (sanitize returned fields)
    await pass.populate([
      { path: 'visitor', select: 'name email phone photo' },
      { path: 'host', select: 'name email phone department' }
    ]);

    // Generate PDF badge
    const pdfPath = await generatePassPDF(pass, qrCodeDataURL);
    pass.pdfPath = pdfPath;

    await pass.save();

    // Send pass to visitor via email if we have visitor details
    if (visitor && visitor.email) {
      try {
        await sendPassDetails(pass, visitor, pdfPath);
      } catch (emailErr) {
        console.warn('Failed to send pass email:', emailErr?.message || emailErr);
      }
    }

    // Also send an SMS notification to the visitor (best-effort) if phone available
    try {
      if (visitor && visitor.phone) {
        const smsMsg = `Your visitor pass ${pass.passNumber} is issued and valid from ${new Date(pass.validFrom).toLocaleString()} to ${new Date(pass.validUntil).toLocaleString()}.`;
        await sendSMS(visitor.phone, smsMsg);
      }
    } catch (smsErr) {
      console.warn('Failed to send pass SMS:', smsErr?.message || smsErr);
    }

    res.status(201).json(pass);
  } catch (error) {
    console.error('Error issuing pass:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get all passes
const getAllPasses = async (req, res) => {
  try {
    const { status, visitorId, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }

    if (visitorId) {
      query.visitor = visitorId;
    }

    const passes = await Pass.find(query)
      .populate('visitor')
      .populate('host', 'name department')
      .populate('issuedBy', 'name')
      .populate('appointment')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Pass.countDocuments(query);

    res.status(200).json({
      passes,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalPasses: count
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get single pass
const getPass = async (req, res) => {
  try {
    const { id } = req.params;
    const pass = await Pass.findById(id)
      .populate('visitor')
      .populate('host', 'name email phone department')
      .populate('issuedBy', 'name')
      .populate('appointment');

    if (!pass) {
      return res.status(404).json({ error: 'Pass not found' });
    }

    res.status(200).json(pass);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Verify pass by pass number
const verifyPass = async (req, res) => {
  try {
    const { passNumber } = req.params;
    
    const pass = await Pass.findOne({ passNumber })
      .populate('visitor')
      .populate('host', 'name department');

    if (!pass) {
      return res.status(404).json({ 
        valid: false, 
        error: 'Pass not found' 
      });
    }

    // Check if pass is active
    if (pass.status !== 'active') {
      return res.status(400).json({ 
        valid: false, 
        error: `Pass is ${pass.status}` 
      });
    }

    // Check if pass is within valid time
    const now = new Date();
    if (now < pass.validFrom || now > pass.validUntil) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Pass is not valid at this time' 
      });
    }

    // Check if visitor is blacklisted
    const visitor = await Visitor.findById(pass.visitor);
    if (visitor.isBlacklisted) {
      return res.status(403).json({ 
        valid: false, 
        error: 'Visitor is blacklisted' 
      });
    }

    res.status(200).json({ 
      valid: true, 
      pass 
    });
  } catch (error) {
    res.status(400).json({ 
      valid: false, 
      error: error.message 
    });
  }
};

// Revoke pass
const revokePass = async (req, res) => {
  try {
    const { id } = req.params;

    const pass = await Pass.findByIdAndUpdate(
      id,
      { status: 'revoked' },
      { new: true }
    ).populate('visitor');

    if (!pass) {
      return res.status(404).json({ error: 'Pass not found' });
    }

    res.status(200).json(pass);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update pass status (auto-expire)
const updateExpiredPasses = async (req, res) => {
  try {
    const now = new Date();
    
    const result = await Pass.updateMany(
      { 
        validUntil: { $lt: now },
        status: 'active'
      },
      { status: 'expired' }
    );

    res.status(200).json({ 
      message: 'Expired passes updated',
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get pass statistics
const getPassStats = async (req, res) => {
  try {
    const stats = {
      total: await Pass.countDocuments(),
      active: await Pass.countDocuments({ status: 'active' }),
      expired: await Pass.countDocuments({ status: 'expired' }),
      revoked: await Pass.countDocuments({ status: 'revoked' })
    };

    res.status(200).json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  issuePass,
  getAllPasses,
  getPass,
  verifyPass,
  revokePass,
  updateExpiredPasses,
  getPassStats
};