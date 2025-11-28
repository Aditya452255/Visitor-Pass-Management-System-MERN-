require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Routes
const authRoutes = require('./routes/authRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const passRoutes = require('./routes/passRoutes');
const checkLogRoutes = require('./routes/checkLogRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS config (allow common local dev frontend origins and any configured FRONTEND_URL)
const allowedOrigins = [process.env.FRONTEND_URL].filter(Boolean).concat([
  'http://localhost:3000',
  'http://localhost:3001'
]);

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    // For development convenience, if FRONTEND_URL not set, allow localhost origins
    const isLocalhost = /localhost(:\d+)?$/.test(origin);
    if (isLocalhost) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware for debugging
// Detailed request logging middleware for debugging (headers + body for non-GET)
app.use((req, res, next) => {
  try {
    const safeHeaders = { ...req.headers };
    if (safeHeaders.authorization) safeHeaders.authorization = '[REDACTED]';
    console.log('--- Incoming Request ---');
    console.log('Method:', req.method);
    console.log('URL:', req.originalUrl);
    console.log('Headers:', JSON.stringify(safeHeaders));
    if (req.method !== 'GET') {
      // Body is available because express.json() runs earlier
      console.log('Body:', JSON.stringify(req.body));
    }
    console.log('------------------------');
  } catch (e) {
    console.warn('Request logger error:', e?.message || e);
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/passes', passRoutes);
app.use('/api/checklogs', checkLogRoutes);

// Health check
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Visitor Pass Management API is running ✅' });
});

// Connect DB & Start server
const PORT = process.env.PORT || 5000; // ✅ fallback

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  })
  .catch((err) => console.error('❌ DB Connection Error:', err));

module.exports = app;