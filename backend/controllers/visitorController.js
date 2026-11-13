const prisma = require('../config/prisma');
const storageService = require('../services/storageService');
const { logger } = require('../utils/logger');

// Format visitor with both _id and id
const formatVisitor = (v) => {
  if (!v) return null;
  return {
    ...v,
    _id: v.id
  };
};

// Register a new visitor (Admin / Security)
const registerVisitor = async (req, res) => {
  try {
    const { name, email, phone, company, idType, idNumber, address, purpose, vehicleNumber } = req.body;

    const userId = req.user?.id || req.user?._id;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User context or email is required to link visitor' });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();

    // Check if visitor already exists for this user or email
    if (userId) {
      const existingByUser = await prisma.visitor.findUnique({
        where: { userId }
      });
      if (existingByUser) return res.status(200).json(formatVisitor(existingByUser));
    }

    if (normalizedEmail) {
      const existingByEmail = await prisma.visitor.findFirst({
        where: { email: normalizedEmail }
      });
      if (existingByEmail) return res.status(200).json(formatVisitor(existingByEmail));
    }

    // Photo check
    const photoUrl = req.file?.url || req.file?.secure_url || req.file?.path;
    if (!photoUrl) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    const validIdTypes = ['passport', 'driving_license', 'national_id', 'other'];
    const chosenIdType = validIdTypes.includes(idType) ? idType : 'other';

    const visitor = await prisma.visitor.create({
      data: {
        userId: userId || undefined,
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        company: company ? company.trim() : null,
        idType: chosenIdType,
        idNumber: idNumber ? idNumber.trim() : 'N/A',
        address: address ? address.trim() : null,
        purpose: purpose ? purpose.trim() : 'General Visit',
        vehicleNumber: vehicleNumber ? vehicleNumber.trim() : null,
        photo: photoUrl,
        visitCount: 1,
        lastVisit: new Date()
      }
    });

    return res.status(201).json(formatVisitor(visitor));
  } catch (error) {
    logger.error('Error registering visitor:', error);
    return res.status(400).json({ error: error.message });
  }
};

// Public pre-registration
const registerVisitorPublic = async (req, res) => {
  try {
    const { name, email, phone, company, idType, idNumber, address, purpose, vehicleNumber } = req.body;

    const photoUrl = req.file?.url || req.file?.secure_url || req.file?.path;
    if (!photoUrl) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const userDoc = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!userDoc) {
      return res.status(400).json({ error: 'User account not found for this email. Please sign up first.' });
    }

    let visitor = await prisma.visitor.findFirst({
      where: {
        OR: [
          { userId: userDoc.id },
          { email: normalizedEmail }
        ]
      }
    });

    const validIdTypes = ['passport', 'driving_license', 'national_id', 'other'];
    const chosenIdType = validIdTypes.includes(idType) ? idType : 'other';

    if (visitor) {
      visitor = await prisma.visitor.update({
        where: { id: visitor.id },
        data: {
          name: name ? name.trim() : visitor.name,
          phone: phone ? phone.trim() : visitor.phone,
          company: company ? company.trim() : visitor.company,
          idType: chosenIdType,
          idNumber: idNumber ? idNumber.trim() : visitor.idNumber,
          address: address ? address.trim() : visitor.address,
          purpose: purpose ? purpose.trim() : visitor.purpose,
          vehicleNumber: vehicleNumber ? vehicleNumber.trim() : visitor.vehicleNumber,
          visitCount: visitor.visitCount + 1,
          lastVisit: new Date(),
          photo: photoUrl || visitor.photo,
          userId: userDoc.id
        }
      });
    } else {
      visitor = await prisma.visitor.create({
        data: {
          userId: userDoc.id,
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim(),
          company: company ? company.trim() : null,
          idType: chosenIdType,
          idNumber: idNumber ? idNumber.trim() : 'N/A',
          address: address ? address.trim() : null,
          purpose: purpose ? purpose.trim() : 'Pre-registered Visit',
          vehicleNumber: vehicleNumber ? vehicleNumber.trim() : null,
          photo: photoUrl,
          visitCount: 1,
          lastVisit: new Date()
        }
      });
    }

    return res.status(201).json(formatVisitor(visitor));
  } catch (error) {
    logger.error('Error in public registration:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/visitors (searchable, paginated)
const getAllVisitors = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [visitors, count] = await Promise.all([
      prisma.visitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.visitor.count({ where })
    ]);

    return res.status(200).json({
      visitors: visitors.map(formatVisitor),
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      totalVisitors: count
    });
  } catch (error) {
    logger.error('Get all visitors error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/visitors/:id
const getVisitor = async (req, res) => {
  try {
    const { id } = req.params;
    const visitor = await prisma.visitor.findUnique({
      where: { id }
    });

    if (!visitor) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    return res.status(200).json(formatVisitor(visitor));
  } catch (error) {
    logger.error('Get visitor error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// PATCH /api/visitors/:id
const updateVisitor = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const existingVisitor = await prisma.visitor.findUnique({
      where: { id }
    });

    if (!existingVisitor) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    // Handle replacement photo
    const photoUrl = req.file?.url || req.file?.secure_url || req.file?.path;
    if (photoUrl) {
      if (existingVisitor.photo) {
        await storageService.deleteFile(existingVisitor.photo);
      }
      updateData.photo = photoUrl;
    }

    // Clean up fields that shouldn't be directly overwritten
    delete updateData.id;
    delete updateData._id;
    delete updateData.createdAt;

    const updatedVisitor = await prisma.visitor.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json(formatVisitor(updatedVisitor));
  } catch (error) {
    logger.error('Update visitor error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// PATCH /api/visitors/:id/blacklist
const toggleBlacklist = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlacklisted, blacklistReason } = req.body;

    const visitor = await prisma.visitor.update({
      where: { id },
      data: {
        isBlacklisted: Boolean(isBlacklisted),
        blacklistReason: isBlacklisted ? blacklistReason : null
      }
    });

    return res.status(200).json(formatVisitor(visitor));
  } catch (error) {
    logger.error('Toggle blacklist error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// DELETE /api/visitors/:id
const deleteVisitor = async (req, res) => {
  try {
    const { id } = req.params;

    const visitor = await prisma.visitor.findUnique({
      where: { id }
    });

    if (!visitor) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    // Delete photo safely via storage service
    if (visitor.photo) {
      await storageService.deleteFile(visitor.photo);
    }

    await prisma.visitor.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Visitor deleted successfully' });
  } catch (error) {
    logger.error('Delete visitor error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/visitors/stats
const getVisitorStats = async (req, res) => {
  try {
    const [totalVisitors, blacklistedVisitors, frequentVisitors] = await Promise.all([
      prisma.visitor.count(),
      prisma.visitor.count({ where: { isBlacklisted: true } }),
      prisma.visitor.findMany({
        orderBy: { visitCount: 'desc' },
        take: 10
      })
    ]);

    return res.status(200).json({
      totalVisitors,
      blacklistedVisitors,
      frequentVisitors: frequentVisitors.map(formatVisitor)
    });
  } catch (error) {
    logger.error('Get visitor stats error:', error);
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  registerVisitor,
  registerVisitorPublic,
  getAllVisitors,
  getVisitor,
  updateVisitor,
  toggleBlacklist,
  deleteVisitor,
  getVisitorStats
};
