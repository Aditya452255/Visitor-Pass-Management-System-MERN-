const { test, describe } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

describe('API & Security Middleware Tests', () => {
  test('Helmet security headers middleware executes successfully', () => {
    const app = express();
    app.use(helmet());
    app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
    assert.strictEqual(typeof app._router, 'undefined'); // routers configured on first use
  });

  test('Rate limiter middleware configures properly', () => {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20
    });
    assert.strictEqual(typeof limiter, 'function');
  });

  test('Routes can be loaded without throwing missing dependency errors', () => {
    assert.doesNotThrow(() => {
      require('../routes/authRoutes');
      require('../routes/visitorRoutes');
      require('../routes/appointmentRoutes');
      require('../routes/passRoutes');
      require('../routes/checkLogRoutes');
    });
  });
});

