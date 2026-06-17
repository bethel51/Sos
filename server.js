require('dotenv').config();
const validateEnv = require('./backend/config/envValidator');
const logger = require('./backend/config/logger');

// Run startup environment validations
try {
  validateEnv();
} catch (err) {
  // Use console here as logger may not be fully initialized or setup depending on execution context, but logger is safest
  logger.error(`Startup halted due to env validation error: ${err.message}`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const initializeDatabase = require('./backend/db/init');
const { initSocket } = require('./backend/config/socket');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy (required for Render, Railway, Heroku, etc.)
// This allows express-rate-limit to correctly identify client IPs
app.set('trust proxy', 1);

// Create HTTP Server for WebSockets binding
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

// Enforce HTTPS in production
if (process.env.NODE_ENV?.toLowerCase() === 'production') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    res.redirect(`https://${req.headers.host}${req.url}`);
  });
}

// Request logging via Morgan streamed into Winston
const morganStream = {
  write: (message) => logger.http(message.trim())
};
app.use(morgan(
  process.env.NODE_ENV?.toLowerCase() === 'production' ? 'combined' : 'dev',
  { stream: morganStream }
));

// Apply HTTP security headers
app.use(helmet({
  contentSecurityPolicy: false
}));

// Dynamic CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('127.0.0.1');
  },
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // Limit each IP to 30 login/signup requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('127.0.0.1');
  },
  message: { error: 'Too many authentication attempts, please try again later.' }
});

// Mount rate limiters on API routes
app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.use(express.json({ limit: '10mb' }));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Initialize SQLite database schema & import seed data
initializeDatabase()
  .then(() => {
    logger.info('Database initialized successfully.');
  })
  .catch((err) => {
    logger.error(`Database initialization failed: ${err.message}`, { error: err });
  });

// Health check endpoint
const mongoose = require('mongoose');
app.get('/api/health', async (req, res) => {
  try {
    // Check if mongoose is connected
    const isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) {
      throw new Error('MongoDB is not connected');
    }
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      database: 'healthy',
      env: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    logger.error('Health check database query failed:', err);
    res.status(500).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      database: 'unhealthy',
      error: err.message
    });
  }
});

// Mount modular routes
app.use('/api/auth', require('./backend/routes/authRoutes'));
app.use('/api/contacts', require('./backend/routes/contactsRoutes'));
app.use('/api/sos', require('./backend/routes/sosRoutes'));
app.use('/api/history', require('./backend/routes/historyRoutes'));
app.use('/api/admin', require('./backend/routes/adminRoutes'));
app.use('/api/zones', require('./backend/routes/safeZonesRoutes'));
app.use('/api/settings', require('./backend/routes/settingsRoutes'));

// Catch-all static routing setup (for production builds)
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.url}: ${err.message}`, { error: err, stack: err.stack });
  const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production';
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal Server Error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Start HTTP Server
if (process.env.NODE_ENV?.toLowerCase() !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
  });
}

module.exports = server;
