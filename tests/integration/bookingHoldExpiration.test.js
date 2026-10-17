const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Theater = require('../../src/models/Theater');
const Room = require('../../src/models/Room');
const EventType = require('../../src/models/EventType');
const Booking = require('../../src/models/Booking');
const { connectDB, disconnectDB, clearDB } = require('../fixtures/db');
const { cleanupExpiredBookings } = require('../../src/services/bookingExpiryService');
const { normalizeBookingDate, getActiveBookingsFilter } = require('../../src/utils/dateUtils');
const tokenService = require('../../src/services/tokenService');

describe('10-Minute Temporary Booking Hold and Expiration Integration Tests', () => {
  let customerUser;
  let customerToken;
  let customer2User;
  let customer2Token;
  let adminUser;
  let adminToken;
  let theater;
  let room;
  let eventType;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();

    customerUser = await User.create({
      name: 'Customer A',
      email: 'customera@example.com',
      phone: '9876543210',
      password: 'Password@123',
      role: 'customer',
      isVerified: true,
    });
    customerToken = tokenService.generateTokens(customerUser._id).accessToken;

    customer2User = await User.create({
      name: 'Customer B',
      email: 'customerb@example.com',
      phone: '9876543211',
      password: 'Password@123',
      role: 'customer',
      isVerified: true,
    });
    customer2Token = tokenService.generateTokens(customer2User._id).accessToken;

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      phone: '9876543212',
      password: 'Password@123',
      role: 'admin',
      isVerified: true,
    });
    adminToken = tokenService.generateTokens(adminUser._id).accessToken;

    eventType = await EventType.create({
      name: 'Birthday',
      slug: 'birthday',
      isActive: true,
    });

    const Location = require('../../src/models/Location');
    const location = await Location.create({
      name: 'Indiranagar',
      cityName: 'Bangalore',
      isActive: true,
    });

    theater = await Theater.create({
      name: 'Rio Party House',
      slug: 'rio-party-house',
      description: 'Private theater for celebrations',
      address: 'Indiranagar, Bangalore',
      city: new mongoose.Types.ObjectId(),
      cityName: 'Bangalore',
      location: location._id,
      isActive: true,
    });

    room = await Room.create({
      name: 'Sigma',
      theater: theater._id,
      capacity: 8,
      maximumMembers: 8,
      price1Hour: 799,
      price2Hours: 1499,
      price3Hours: 2199,
      isActive: true,
      slots: [
        { startTime: '10:30 AM', endTime: '11:30 AM', isActive: true },
        { startTime: '10:30 AM', endTime: '12:30 PM', isActive: true },
        { startTime: '12:30 PM', endTime: '02:30 PM', isActive: true },
        { startTime: '03:00 PM', endTime: '05:00 PM', isActive: true },
      ],
    });
  });

  const validBookingPayload = {
    date: '2026-10-23',
    bookingDate: '2026-10-23',
    timeSlot: '10:30 AM - 11:30 AM',
    duration: 1,
    customerDetails: {
      name: 'Customer A',
      email: 'customera@example.com',
      phone: '9876543210',
      members: 2,
      kids: 0,
    },
  };

  it('1. Customer A selects a slot and creates an unpaid booking with a 10-minute hold', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    const booking = res.body.data;
    expect(booking.status).toBe('pending_payment');
    expect(booking.payment.status).toBe('pending');
    expect(booking.holdExpiresAt).toBeDefined();
    expect(booking.expiresAt).toBeDefined();

    const holdMs = new Date(booking.holdExpiresAt).getTime() - new Date(booking.createdAt).getTime();
    expect(holdMs).toBeGreaterThanOrEqual(9.9 * 60 * 1000);
    expect(holdMs).toBeLessThanOrEqual(10.1 * 60 * 1000);
  });

  it('2. The slot appears as Temporarily Reserved, not Sold Out, while hold is active', async () => {
    // Create hold for Customer A
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    // Check availability
    const res = await request(app)
      .get('/api/v1/bookings/check-availability')
      .query({
        roomId: room._id.toString(),
        date: '2026-10-23',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    const heldSlot = res.body.data.slots.find((s) => s.time === '10:30 AM - 11:30 AM');
    expect(heldSlot.available).toBe(false);
    expect(heldSlot.slotState).toBe('held');
    expect(heldSlot.isTemporarilyHeld).toBe(true);
    expect(heldSlot.reason).toMatch(/Temporarily reserved/i);
    expect(heldSlot.reason).not.toBe('Sold Out');
  });

  it('3. Customer B attempts to book the same slot and is prevented with 409 conflict', async () => {
    // Customer A reserves
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    // Customer B attempts overlapping reservation
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer2Token}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
        customerDetails: {
          name: 'Customer B',
          email: 'customerb@example.com',
          phone: '9876543211',
          members: 2,
        },
      })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/booked|slot/i);
  });

  it('4. Customer A successfully submits payment details and booking confirms after verification', async () => {
    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    const bookingId = createRes.body.data._id;

    // Customer A submits UPI ref
    const upiRes = await request(app)
      .post('/api/v1/payment/submit-upi')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        upiTransactionId: '123456789012',
      })
      .expect(200);

    expect(upiRes.body.data.status).toBe('pending_verification');
    expect(upiRes.body.data.paymentStatus).toBe('submitted');

    // Admin verifies advance payment
    const adminVerifyRes = await request(app)
      .put(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'verify',
      })
      .expect(200);

    expect(adminVerifyRes.body.data.status).toBe('confirmed');
    expect(adminVerifyRes.body.data.payment.status).toBe('paid');

    // Check availability now shows Sold Out
    const availRes = await request(app)
      .get('/api/v1/bookings/check-availability')
      .query({
        roomId: room._id.toString(),
        date: '2026-10-23',
      })
      .expect(200);

    const soldOutSlot = availRes.body.data.slots.find((s) => s.time === '10:30 AM - 11:30 AM');
    expect(soldOutSlot.available).toBe(false);
    expect(soldOutSlot.slotState).toBe('sold_out');
    expect(soldOutSlot.reason).toBe('Sold Out');
  });

  it('5. An unpaid booking expires after 10 minutes and cleanup job releases the slot', async () => {
    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    const bookingId = createRes.body.data._id;

    // Simulate expiration: set holdExpiresAt & expiresAt to 1 minute in the past
    const pastDate = new Date(Date.now() - 60 * 1000);
    await Booking.findByIdAndUpdate(bookingId, {
      holdExpiresAt: pastDate,
      expiresAt: pastDate,
    });

    // Check availability query ignores the expired hold immediately
    const availResImmediate = await request(app)
      .get('/api/v1/bookings/check-availability')
      .query({
        roomId: room._id.toString(),
        date: '2026-10-23',
      })
      .expect(200);

    const slotImmediate = availResImmediate.body.data.slots.find((s) => s.time === '10:30 AM - 11:30 AM');
    expect(slotImmediate.available).toBe(true);
    expect(slotImmediate.slotState).toBe('available');

    // Run cleanup job
    const expiredCount = await cleanupExpiredBookings();
    expect(expiredCount).toBe(1);

    const dbBooking = await Booking.findById(bookingId);
    expect(dbBooking.status).toBe('cancelled');
    expect(dbBooking.cancellationReason).toMatch(/expired/i);

    // Customer B can now book this slot
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer2Token}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
        customerDetails: {
          name: 'Customer B',
          email: 'customerb@example.com',
          phone: '9876543211',
          members: 2,
        },
      })
      .expect(201);
  });

  it('6. Expired hold is excluded from active pending bookings in admin panel', async () => {
    // 1 active hold
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    // 1 expired hold
    const expiredBooking = await Booking.create({
      bookingId: 'CS-TEST-EXPIRED',
      user: customer2User._id,
      theater: theater._id,
      room: room._id,
      date: normalizeBookingDate('2026-10-24'),
      duration: 1,
      timeSlot: '12:30 PM - 02:30 PM',
      eventType: eventType._id,
      customerDetails: {
        name: 'Expired Customer',
        phone: '9999999999',
        email: 'expired@example.com',
        members: 2,
      },
      pricing: { theaterPrice: 1000, subtotal: 1000, total: 1000, balanceAmount: 250 },
      payment: { status: 'pending' },
      status: 'pending_payment',
      holdExpiresAt: new Date(Date.now() - 5 * 60 * 1000),
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const adminBookingsRes = await request(app)
      .get('/api/v1/admin/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const bookingIds = adminBookingsRes.body.data.bookings.map((b) => b.bookingId);
    expect(bookingIds).not.toContain(expiredBooking.bookingId);

    const adminStatsRes = await request(app)
      .get('/api/v1/admin/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminStatsRes.body.data.pendingBookings).toBe(1);
  });

  it('7. Customer cannot submit payment for an expired booking', async () => {
    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
      })
      .expect(201);

    const bookingId = createRes.body.data._id;

    // Simulate expiration
    await Booking.findByIdAndUpdate(bookingId, {
      holdExpiresAt: new Date(Date.now() - 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const submitRes = await request(app)
      .post('/api/v1/payment/submit-upi')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        upiTransactionId: '123456789012',
      })
      .expect(409);

    expect(submitRes.body.message).toMatch(/expired|hold window/i);
  });

  it('8. Paid/confirmed booking is never expired by the cleanup job', async () => {
    const paidBooking = await Booking.create({
      bookingId: 'CS-PAID-001',
      user: customerUser._id,
      theater: theater._id,
      room: room._id,
      date: normalizeBookingDate('2026-10-23'),
      duration: 1,
      timeSlot: '03:00 PM - 05:00 PM',
      eventType: eventType._id,
      customerDetails: {
        name: 'Paid Customer',
        phone: '9876543210',
        email: 'paid@example.com',
        members: 2,
      },
      pricing: { theaterPrice: 1000, subtotal: 1000, total: 1000, balanceAmount: 250 },
      payment: { status: 'paid', amountPaid: 750 },
      status: 'confirmed',
      holdExpiresAt: new Date(Date.now() - 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const expiredCount = await cleanupExpiredBookings();
    expect(expiredCount).toBe(0);

    const afterBooking = await Booking.findById(paidBooking._id);
    expect(afterBooking.status).toBe('confirmed');
    expect(afterBooking.payment.status).toBe('paid');
  });
});
