const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const prisma = require('../config/prisma');
const { logger } = require('../utils/logger');

// Helper to format user response with both id and _id for backward compatibility
const formatUser = (user) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return {
    ...safeUser,
    _id: user.id,
    role: (user.role || '').toString().toLowerCase()
  };
};

// Create JWT Token
const createToken = (id) => {
  return jwt.sign({ _id: id, id }, process.env.JWT_SECRET, { expiresIn: '3d' });
};

// POST /api/auth/login
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toString().trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(400).json({ error: 'Incorrect email' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'User account is deactivated' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const token = createToken(user.id);

    return res.status(200).json({
      _id: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user.role || '').toString().toLowerCase(),
      department: user.department,
      token
    });
  } catch (error) {
    logger.error(`Login error for ${email}:`, error);
    return res.status(400).json({ error: error.message });
  }
};

// POST /api/auth/signup
const signupUser = async (req, res) => {
  const { name, email, password, phone, role, department } = req.body;

  try {
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'All fields must be filled' });
    }

    const normalizedEmail = email.toString().trim().toLowerCase();
    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (!validator.isStrongPassword(password, { minLength: 6, minLowercase: 1, minNumbers: 1 })) {
      return res.status(400).json({ error: 'Password must be at least 6 characters and contain letters and numbers' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Signup defaults to visitor unless created by admin endpoint
    const userRole = (role || 'visitor').toString().toLowerCase();
    const validRoles = ['admin', 'security', 'employee', 'visitor'];
    const finalRole = validRoles.includes(userRole) ? userRole : 'visitor';

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone.trim(),
        role: finalRole,
        department: department || (finalRole === 'visitor' ? 'External' : undefined)
      }
    });

    const token = createToken(user.id);

    return res.status(201).json({
      _id: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: finalRole,
      department: user.department,
      token
    });
  } catch (error) {
    logger.error('Signup error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/auth/profile
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(formatUser(user));
  } catch (error) {
    logger.error('Get profile error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone, department, email } = req.body;

    const current = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};
    if (typeof name !== 'undefined' && name.trim()) updateData.name = name.trim();
    if (typeof phone !== 'undefined' && phone.trim()) updateData.phone = phone.trim();
    if (typeof department !== 'undefined') updateData.department = department.trim();

    if (typeof email !== 'undefined' && email && email.toLowerCase() !== current.email) {
      const normalizedEmail = email.toString().trim().toLowerCase();
      if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existing && existing.id !== current.id) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      updateData.email = normalizedEmail;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData
    });

    // If visitor role, keep Visitor table in sync
    const role = (updatedUser.role || '').toString().toLowerCase();
    if (role === 'visitor') {
      try {
        const v = await prisma.visitor.findFirst({
          where: {
            OR: [
              { userId: updatedUser.id },
              { email: current.email }
            ]
          }
        });

        if (v) {
          await prisma.visitor.update({
            where: { id: v.id },
            data: {
              userId: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email,
              phone: updatedUser.phone
            }
          });
        }
      } catch (syncErr) {
        logger.warn('Visitor sync during profile update failed:', syncErr.message);
      }
    }

    return res.status(200).json(formatUser(updatedUser));
  } catch (error) {
    logger.error('Update profile error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/auth/users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(users.map(formatUser));
  } catch (error) {
    logger.error('Get all users error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// GET /api/auth/hosts (public)
const getHosts = async (req, res) => {
  try {
    const hosts = await prisma.user.findMany({
      where: {
        role: 'employee',
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        role: true
      },
      orderBy: { name: 'asc' }
    });

    const formatted = hosts.map(h => ({
      ...h,
      _id: h.id,
      role: (h.role || '').toString().toLowerCase()
    }));

    return res.status(200).json({ users: formatted });
  } catch (error) {
    logger.error('Get hosts error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// PUT /api/auth/users/:id/role (admin only)
const updateUserRole = async (req, res) => {
  try {
    const userId = req.params.id || req.body.userId;
    const { role, isActive } = req.body;

    const updateData = {};
    if (role) {
      const validRoles = ['admin', 'security', 'employee', 'visitor'];
      const r = role.toString().toLowerCase();
      if (!validRoles.includes(r)) {
        return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(', ')}` });
      }
      updateData.role = r;
    }

    if (typeof isActive !== 'undefined') {
      updateData.isActive = Boolean(isActive);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return res.status(200).json(formatUser(updatedUser));
  } catch (error) {
    logger.error('Update user role error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// DELETE /api/auth/users/:id (admin only)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error:', error);
    return res.status(400).json({ error: error.message });
  }
};

// POST /api/auth/create-user (admin only)
const createUser = async (req, res) => {
  const { name, email, password, phone, role, department } = req.body;

  try {
    const roleLower = (role || '').toString().toLowerCase();
    if (roleLower !== 'employee' && roleLower !== 'security') {
      return res.status(400).json({ error: 'Only employee and security roles can be created through this endpoint' });
    }

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'All fields must be filled' });
    }

    const normalizedEmail = email.toString().trim().toLowerCase();
    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone.trim(),
        role: roleLower,
        department: department || undefined
      }
    });

    return res.status(201).json({
      _id: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user.role || '').toString().toLowerCase(),
      department: user.department,
      message: 'User created successfully'
    });
  } catch (error) {
    logger.error('Create user error:', error);
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  loginUser,
  signupUser,
  getProfile,
  updateProfile,
  getAllUsers,
  getHosts,
  updateUserRole,
  deleteUser,
  createUser
};
