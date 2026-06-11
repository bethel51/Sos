const request = require('supertest');
const app = require('../../server');
const initializeDatabase = require('../db/init');
const mongoose = require('mongoose');

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await initializeDatabase();
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Silent SOS API Integration Tests', () => {
  let userToken = '';
  let userId = '';
  let contactId = '';
  let incidentId = '';
  let zoneId = '';

  const testUser = {
    name: 'Test User',
    email: `test_${Date.now()}@example.com`,
    phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
    password: 'Password123!',
    pin: '1234'
  };

  describe('Authentication Endpoints', () => {
    it('should successfully sign up a new user via OTP', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send(testUser);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('devOtp');
      
      const otpCode = res.body.devOtp;

      const verifyRes = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          email: testUser.email,
          code: otpCode
        });

      expect(verifyRes.status).toBe(201);
      expect(verifyRes.body).toHaveProperty('token');
      expect(verifyRes.body.user).toHaveProperty('id');
      expect(verifyRes.body.user.email).toBe(testUser.email);
      
      userToken = verifyRes.body.token;
      userId = verifyRes.body.user.id;
    });

    it('should fail signup with duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should successfully log in the user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should get current user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testUser.email);
    });
  });

  describe('Contacts Endpoints', () => {
    it('should add a new emergency contact', async () => {
      const res = await request(app)
        .post('/api/contacts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Contact One',
          phone: '+1 (555) 019-9999',
          email: 'contact1@example.com',
          relationship: 'Friend'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Contact One');
      
      contactId = res.body.id;
    });

    it('should fetch all contacts', async () => {
      const res = await request(app)
        .get('/api/contacts')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should not allow deleting the last remaining contact', async () => {
      const res = await request(app)
        .delete(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Safe Zones Endpoints', () => {
    it('should add a new safe zone', async () => {
      const res = await request(app)
        .post('/api/zones')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Home Base',
          lat: 40.7128,
          lng: -74.0060,
          radius: 120
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Home Base');
      expect(res.body.radius).toBe(120);
      
      zoneId = res.body.id;
    });

    it('should fetch safe zones', async () => {
      const res = await request(app)
        .get('/api/zones')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBe('Home Base');
    });

    it('should delete a safe zone', async () => {
      const res = await request(app)
        .delete(`/api/zones/${zoneId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Settings Endpoints', () => {
    it('should fetch default settings', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.shakeEnabled).toBe(true);
      expect(res.body.powerTapThreshold).toBe(5);
    });

    it('should update user trigger settings', async () => {
      const res = await request(app)
        .post('/api/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          shakeEnabled: false,
          powerTapThreshold: 3,
          selectedTemplate: 'Help! This is an active alarm.'
        });

      expect(res.status).toBe(200);
      expect(res.body.shakeEnabled).toBe(false);
      expect(res.body.powerTapThreshold).toBe(3);
      expect(res.body.selectedTemplate).toBe('Help! This is an active alarm.');
    });
  });

  describe('SOS Incident Endpoints', () => {
    it('should trigger a new active SOS incident', async () => {
      const res = await request(app)
        .post('/api/sos/active')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'Kinetic Shake Trigger',
          location: { lat: 42.3601, lng: -71.0589 }
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('Kinetic Shake Trigger');
      
      incidentId = res.body.id;
    });

    it('should check for active incident globally', async () => {
      const res = await request(app)
        .get('/api/sos/active');

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      expect(res.body.incident.id).toBe(incidentId);
    });

    it('should update active incident location path', async () => {
      const res = await request(app)
        .post('/api/sos/location')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          lat: 42.3605,
          lng: -71.0595
        });

      expect(res.status).toBe(200);
      expect(res.body.locationPath.length).toBe(2);
    });

    it('should upload evidence photos and audio status', async () => {
      const res = await request(app)
        .post('/api/sos/evidence')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          photo: 'data:image/png;base64,mockphotodata',
          audio: 'mock_audio_url_xyz'
        });

      expect(res.status).toBe(200);
      expect(res.body.photos[0].src).toContain('/uploads/');
      expect(res.body.audioRecordingUrl).toBe('mock_audio_url_xyz');
    });

    it('should deactivate the SOS incident', async () => {
      const res = await request(app)
        .post('/api/sos/deactivate')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.incident.endTime).toBeDefined();
    });

    it('should return user history without the active tag', async () => {
      const res = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Admin Endpoints', () => {
    it('should fail admin action with incorrect token', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer wrong_token');

      expect(res.status).toBe(403);
    });

    const adminToken = process.env.ADMIN_TOKEN || 'admin_secret_token';

    it('should fetch stats with correct admin token', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('activeEmergencies');
    });

    it('should list all registered users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should suspend and check user suspension state', async () => {
      // Suspend
      let res = await request(app)
        .post(`/api/admin/users/${userId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ suspend: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('suspended');

      // Attempt to access user profile (should fail because session was cleared on suspension)
      res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(401);
    });
  });
});
