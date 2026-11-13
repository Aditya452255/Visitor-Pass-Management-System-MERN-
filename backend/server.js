require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { logger, requestLogger } = require('./utils/logger');
const prisma = require('./config/prisma');

// Routes
const authRoutes = require('./routes/authRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const passRoutes = require('./routes/passRoutes');
const checkLogRoutes = require('./routes/checkLogRoutes');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());
// Allow cross-origin resources (images/PDFs served from /uploads)
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [process.env.FRONTEND_URL]
  .filter(Boolean)
  .concat(['http://localhost:3000', 'http://localhost:3001']);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // server-to-server / curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger ────────────────────────────────────────────────────────────
app.use(requestLogger);

// ── Static uploads (local dev only; in production files live in S3) ───────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/passes', passRoutes);
app.use('/api/checklogs', checkLogRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Visitor Pass Management API ✅' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ── Server startup ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected via Prisma');

    app.listen(PORT, () => {
      logger.info(`✅ Server running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV });
    });

    // ── Auto-checkout background job (in-process) ─────────────────────────────
    // Skipped in test mode; for production scale use the Lambda-compatible
    // handler at backend/jobs/autoCheckout.js triggered by EventBridge.
    if (process.env.NODE_ENV !== 'test') {
      const { processAutoCheckout } = require('./jobs/autoCheckout');
      const intervalMs = Number(process.env.AUTO_CHECKOUT_INTERVAL_MIN || 5) * 60_000;
      setInterval(() => {
        processAutoCheckout().catch((e) =>
          logger.warn('Auto-checkout job error', { message: e.message })
        );
      }, intervalMs);
      logger.info(`Auto-checkout job scheduled every ${process.env.AUTO_CHECKOUT_INTERVAL_MIN || 5} min`);
    }
  } catch (err) {
    logger.error('❌ Server startup failed', { message: err.message, stack: err.stack });
    process.exit(1);
  }
}

startServer();

module.exports = app; // exported for testing
