const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const ContactMessage = require('../../src/models/ContactMessage');
const tokenService = require('../../src/services/tokenService');
const { connectDB, disconnectDB, clearDB } = require('../fixtures/db');

let adminUser;
let adminToken;
let customerUser;
let customerToken;

beforeAll(async () => {
  await connectDB();
});

beforeEach(async () => {
  await clearDB();

  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@test.com',
    phone: '9876543210',
    password: 'Password@123',
    role: 'admin',
    isVerified: true,
  });
  adminToken = tokenService.generateTokens(adminUser._id).accessToken;

  customerUser = await User.create({
    name: 'Customer User',
    email: 'customer@test.com',
    phone: '9876543211',
    password: 'Password@123',
    role: 'customer',
    isVerified: true,
  });
  customerToken = tokenService.generateTokens(customerUser._id).accessToken;

});

afterAll(async () => {
  await disconnectDB();
});

describe('Contact Messages API', () => {
  describe('Public Submission', () => {
    it('should submit a contact message successfully via /api/v1/contact', async () => {
      const payload = {
        name: 'Jane Doe',
        email: 'janedoe@example.com',
        phone: '9123456789',
        subject: 'Private Booking',
        message: 'I would like to book a room for 15 guests next Saturday.',
      };

      const res = await request(app)
        .post('/api/v1/contact')
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.status).toBe('new');

      const saved = await ContactMessage.findById(res.body.data._id);
      expect(saved).not.toBeNull();
      expect(saved.email).toBe(payload.email);
    });

    it('should submit a contact message successfully via /api/contact alias', async () => {
      const payload = {
        name: 'John Smith',
        email: 'john@example.com',
        phone: '9876543210',
        subject: 'General Support',
        message: 'How do I cancel my booking?',
      };

      const res = await request(app)
        .post('/api/contact')
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.subject).toBe(payload.subject);
    });

    it('should reject invalid submission (missing required fields)', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({ name: 'Incomplete' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'Jane Doe',
          email: 'invalid-email',
          phone: '9123456789',
          subject: 'Private Booking',
          message: 'Hello there',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Admin Endpoints Protection & Authorization', () => {
    it('should forbid unauthenticated access to GET /api/v1/admin/contact-messages', async () => {
      await request(app)
        .get('/api/v1/admin/contact-messages')
        .expect(401);
    });

    it('should forbid customer access to GET /api/v1/admin/contact-messages', async () => {
      await request(app)
        .get('/api/v1/admin/contact-messages')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });

  describe('Admin Operations', () => {
    let msg1, msg2;

    beforeEach(async () => {
      msg1 = await ContactMessage.create({
        name: 'Alice',
        email: 'alice@example.com',
        phone: '9000000001',
        subject: 'Venue Inquiry',
        message: 'Tell me about the venue.',
        status: 'new',
        createdAt: new Date('2026-01-01'),
      });

      msg2 = await ContactMessage.create({
        name: 'Bob',
        email: 'bob@example.com',
        phone: '9000000002',
        subject: 'Birthday Party',
        message: 'Looking for cake options.',
        status: 'read',
        createdAt: new Date('2026-01-02'),
      });
    });

    it('should retrieve list of messages sorted newest first', async () => {
      const res = await request(app)
        .get('/api/v1/admin/contact-messages')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].name).toBe('Bob'); // Newest first
      expect(res.body.data[1].name).toBe('Alice');
      expect(res.body.unreadCount).toBe(1);
    });

    it('should search messages by name, email, or subject', async () => {
      const res = await request(app)
        .get('/api/v1/admin/contact-messages?search=Birthday')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Bob');
    });

    it('should get single message details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/contact-messages/${msg1._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Alice');
      expect(res.body.data.message).toBe('Tell me about the venue.');
    });

    it('should update message status to read/new', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/contact-messages/${msg1._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'read' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('read');

      const updated = await ContactMessage.findById(msg1._id);
      expect(updated.status).toBe('read');
    });

    it('should reject invalid status value', async () => {
      await request(app)
        .patch(`/api/v1/admin/contact-messages/${msg1._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'archived' })
        .expect(400);
    });

    it('should delete a contact message', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/contact-messages/${msg1._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const deleted = await ContactMessage.findById(msg1._id);
      expect(deleted).toBeNull();
    });

    it('should retrieve unread count accurately via /unread-count', async () => {
      const res = await request(app)
        .get('/api/v1/admin/contact-messages/unread-count')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBe(1);
    });

    it('should mark all unread messages as read via /mark-all-read', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/contact-messages/mark-all-read')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.modifiedCount).toBe(1);

      // Verify unread count is now 0
      const countRes = await request(app)
        .get('/api/v1/admin/contact-messages/unread-count')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it('should return unreadContactMessages in dashboard stats', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadContactMessages).toBe(1);
    });
  });
});

