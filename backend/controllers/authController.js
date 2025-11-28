const User = require('../models/User');
const jwt = require('jsonwebtoken');

//create jwt token
const createToken = (_id) => {
    return jwt.sign({_id}, process.env.JWT_SECRET, { expiresIn: '3d' });
}


//login user
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for email: ${email}`); // Log login attempt

    try {
        if (!email || !password) {
            console.log('Login failed: Email or password missing.');
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const user = await User.login(email, password);
        const token = createToken(user._id);

        console.log(`Login successful for user: ${user.email}, role: ${user.role}`);
        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: (user.role || '').toString().toLowerCase(),
            department: user.department,
            token
        });
    } catch (error) {
        console.error(`Login error for ${email}:`, error.message); // Log the specific error
        res.status(400).json({ error: error.message });
    }
}

//signup user
const signupUser = async (req, res) => {
    const { name, email, password, phone, role, department } = req.body;

    try {
        const user = await User.signup(name, email, password, phone, role, department);
        const token = createToken(user._id);

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: (user.role || '').toString().toLowerCase(),
            department: user.department,
            token
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

//get current user
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }   
}


//update user profile
const updateProfile = async (req, res) => {
    try {
        const { name, phone, department } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { name, phone, department },
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// Get all users (admin only)

const getAllUsers = async (req, res) => {
  try {
    // ✅ fixed: moved .sort() inside query, not on array
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Public: Get host users (employees + admins) for appointment selection
const getHosts = async (req, res) => {
    try {
        const hosts = await User.find({ role: { $in: ['employee', 'admin'] }, isActive: true })
            .select('name email department');
        res.status(200).json({ users: hosts });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

//update user role or active status (admin only)

const updateUserRole = async (req, res) => {
    try {
        const { userId, role, isActive } = req.body;

        const updateData = {};
        if (role) updateData.role = role;
        if(typeof isActive !== 'undefined') updateData.isActive = isActive;

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        ).select('-password');

        res.status(200).json(user);

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


// delete user (admin only)
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        await User.findByIdAndDelete(id);
        res.status(200).json({ message: 'User deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    loginUser,
    signupUser,
    getProfile,
    updateProfile,
    getAllUsers,
    getHosts,
    updateUserRole,
    deleteUser
}

