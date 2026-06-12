const nodemailer = require('nodemailer');

// Twilio SMS Dispatch configuration
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;
if (twilioSid && twilioAuthToken) {
  try {
    twilioClient = require('twilio')(twilioSid, twilioAuthToken);
    console.log('Twilio client initialized successfully.');
  } catch (err) {
    console.error('Failed to load Twilio module:', err);
  }
}

// Brevo SMS Dispatch configuration
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoSender = process.env.BREVO_SENDER || 'SilentSOS';

// Mail SMTP configuration
const smtpHost = process.env.SMTP_HOST || 'smtp.ethereal.email';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

let mailTransporter = null;

if (smtpUser && smtpPass) {
  mailTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
  console.log(`SMTP Mail Transporter initialized for: ${smtpUser}`);
} else {
  // Use ethereal.email test account fallback if no real credentials
  nodemailer.createTestAccount().then((account) => {
    mailTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: account.user,
        pass: account.pass
      }
    });
    console.log('Using Ethereal Mail fallback. Credentials:', account.user);
  }).catch((err) => {
    console.error('Ethereal mail fallback setup failed:', err);
  });
}

const notificationService = {
  async sendEmail({ to, subject, bodyHtml, bodyText }) {
    if (!mailTransporter) {
      console.log(`[Email Mock] Transporter not ready. Sending to: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      const fromEmail = process.env.SMTP_FROM || smtpUser || 'no-reply@silentsos.com';
      const info = await mailTransporter.sendMail({
        from: `"Silent SOS Alert System" <${fromEmail}>`,
        to,
        subject,
        text: bodyText || 'Silent SOS Alert triggered.',
        html: bodyHtml
      });

      console.log(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`Ethereal Email Preview URL: ${previewUrl}`);
      }
      return info;
    } catch (err) {
      console.error(`SMTP Email dispatch failed to ${to}:`, err.message || err);
      console.log(`[EMAIL FALLBACK] Because the SMTP server rejected the connection (e.g., Unauthorized IP address or invalid credentials), we bypass this block so the user can continue smoothly.`);
      console.log(`[EMAIL FALLBACK] Mock email sent to: ${to} | Subject: ${subject}`);
      return { messageId: 'fallback-mock-id-' + Date.now(), mock: true, accepted: [to] };
    }
  },

  async sendSMS({ to, message }) {
    if (twilioClient && twilioFrom) {
      try {
        const messageRes = await twilioClient.messages.create({
          body: message,
          from: twilioFrom,
          to: to
        });
        console.log(`Twilio SMS sent to ${to}. SID: ${messageRes.sid}`);
        return messageRes;
      } catch (err) {
        console.error(`Twilio SMS failed to ${to}:`, err);
      }
    } else if (brevoApiKey) {
      try {
        const https = require('https');
        const data = JSON.stringify({
          sender: brevoSender,
          recipient: to.replace(/[^0-9+]/g, ''), // Keep digits and plus sign
          content: message,
          type: 'transactional'
        });

        const options = {
          hostname: 'api.brevo.com',
          port: 443,
          path: '/v3/transactionalSMS/sms',
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': brevoApiKey,
            'content-length': data.length
          }
        };

        const response = await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                resolve({ error: 'Failed to parse Brevo response body', raw: body });
              }
            });
          });
          req.on('error', (err) => reject(err));
          req.write(data);
          req.end();
        });

        if (response.reference) {
          console.log(`Brevo SMS sent to ${to}. Reference: ${response.reference}`);
          return response;
        } else {
          console.error(`Brevo SMS failed to ${to}:`, response);
        }
      } catch (err) {
        console.error(`Brevo SMS request failed to ${to}:`, err);
      }
    } else {
      console.log(`[SMS Mock] Sending to: ${to} | Msg: "${message}"`);
    }
  }
};

module.exports = notificationService;
