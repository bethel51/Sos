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

// Brevo Email/SMS Dispatch configuration
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoSender = process.env.BREVO_SENDER || 'SilentSOS';


const notificationService = {
  async sendEmail({ to, subject, bodyHtml, bodyText }) {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (brevoApiKey) {
      try {
        const https = require('https');
        const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'ad0edf001@smtp-brevo.com';
        const postData = JSON.stringify({
          sender: {
            name: 'Silent SOS Alert System',
            email: fromEmail
          },
          to: [{ email: to }],
          subject: subject,
          htmlContent: bodyHtml || `<p>${bodyText}</p>`,
          textContent: bodyText || 'Silent SOS Alert triggered.'
        });

        const options = {
          hostname: 'api.brevo.com',
          port: 443,
          path: '/v3/smtp/email',
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': brevoApiKey,
            'content-length': Buffer.byteLength(postData)
          }
        };

        const response = await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
              } catch (e) {
                resolve({ statusCode: res.statusCode, raw: body });
              }
            });
          });
          req.on('error', (err) => reject(err));
          req.write(postData);
          req.end();
        });

        if (response.statusCode === 201 || response.statusCode === 200 || (response.data && response.data.messageId)) {
          console.log(`Email sent successfully via Brevo HTTP API to ${to}. Message ID: ${response.data.messageId}`);
          return response.data;
        } else {
          console.error(`Brevo HTTP API Email failed to ${to}:`, response);
          throw new Error(JSON.stringify(response.data || response.raw));
        }
      } catch (err) {
        console.error(`Brevo HTTP API Email dispatch failed to ${to}:`, err.message || err);
        if (err.message && err.message.includes('authorised_ips')) {
          console.warn('\n====================================\n[WARNING] Brevo API rejected the request due to an unauthorized IP address.\nIf you are running on Render or another cloud provider, you must add the IP address to your authorized list in the Brevo Dashboard under Security -> Authorized IPs:\nhttps://app.brevo.com/security/authorised_ips\n====================================\n');
        }
        throw err;
      }
    } else {
      console.error('BREVO_API_KEY is not configured in environment variables.');
      throw new Error('Email service is not configured (missing BREVO_API_KEY).');
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
