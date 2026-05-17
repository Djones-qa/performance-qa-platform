/**
 * server.js — Express application entry point
 */

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const patientsRouter = require('./routes/patients');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ───────────────────────────────────────────────────────

// Helmet sets secure HTTP headers (XSS protection, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:']
    }
  }
}));

// Rate limiting — prevent brute-force and DoS on intake endpoint
// Risk: unthrottled intake endpoint allows automated PHI harvesting
const intakeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later.' }
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

// ── General Middleware ────────────────────────────────────────────────────────

app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' })); // Limit body size — prevent payload attacks
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/patients', intakeLimiter, patientsRouter);

// Health check — used by load balancers and k6 smoke tests
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global error handler — never leak stack traces to client
// Risk: stack traces expose internal paths and library versions
app.use((err, req, res, next) => {
  // Handle payload too large (body-parser limit exceeded)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      status: 'error',
      message: 'Request payload too large'
    });
  }
  console.error('[ERROR]', err.message);
  res.status(500).json({
    status: 'error',
    message: 'An internal server error occurred'
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Healthcare Intake API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
