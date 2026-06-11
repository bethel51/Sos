const logger = require('./logger');

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';

  const requiredKeys = ['JWT_SECRET', 'ADMIN_TOKEN', 'MONGODB_URI'];
  const defaultValues = {
    JWT_SECRET: 'silentsos_jwt_secret_key',
    ADMIN_TOKEN: 'admin_secret_token',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/leadcity-sos'
  };

  const missing = [];
  const insecure = [];

  for (const key of requiredKeys) {
    const val = process.env[key];
    if (!val) {
      missing.push(key);
    } else if (val === defaultValues[key]) {
      insecure.push(key);
    }
  }

  if (isProduction) {
    if (missing.length > 0 || insecure.length > 0) {
      logger.error('CRITICAL ENVIRONMENT CONFIGURATION ERROR');
      if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
      }
      if (insecure.length > 0) {
        logger.error(`Insecure default keys in use for: ${insecure.join(', ')}. Please change these in production.`);
      }
      throw new Error('Process terminated due to insecure environment variables in production mode.');
    }
  } else {
    // Development/Test mode warnings
    if (missing.length > 0) {
      logger.warn(`Missing env keys (using fallback): ${missing.join(', ')}`);
    }
    if (insecure.length > 0) {
      logger.warn(`Using default developer keys for: ${insecure.join(', ')}`);
    }
  }

  // Warnings for SMS integrations (Twilio & Brevo)
  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER;
  const hasBrevo = process.env.BREVO_API_KEY;

  if (!hasTwilio && !hasBrevo) {
    logger.warn('SMS notifications are running in MOCK mode (both Twilio and Brevo credentials missing)');
  } else if (hasTwilio) {
    logger.info('SMS dispatcher: Twilio configured');
  } else {
    logger.info('SMS dispatcher: Brevo configured');
  }

  // Warnings for SMTP integrations
  const smtpKeys = ['SMTP_USER', 'SMTP_PASS'];
  const missingSmtp = smtpKeys.filter(key => !process.env[key]);
  if (missingSmtp.length > 0) {
    if (missingSmtp.length === smtpKeys.length) {
      logger.warn('Email SMTP notifications are running in MOCK mode (Ethereal Email fallback)');
    } else {
      logger.warn(`Email SMTP notifications misconfigured. Missing keys: ${missingSmtp.join(', ')}`);
    }
  }
}

module.exports = validateEnv;
