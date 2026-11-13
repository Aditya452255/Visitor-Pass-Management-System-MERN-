const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

// Custom format for local development
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message} ${metaString}`;
  })
);

// CloudWatch-friendly JSON format for production
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'visitor-pass-api' },
  transports: [
    new winston.transports.Console()
  ]
});

// Middleware for logging incoming HTTP requests
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: duration,
      userAgent: req.get('user-agent'),
      ip: req.ip || req.connection?.remoteAddress
    };

    if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`, logData);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`, logData);
    } else {
      logger.info(`HTTP ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`, logData);
    }
  });
  next();
};

module.exports = { logger, requestLogger };

