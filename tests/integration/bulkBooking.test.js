const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Theater = require('../../src/models/Theater');
const Room = require('../../src/models/Room');
const EventType = require('../../src/models/EventType');
const Booking = require('../../src/models/Booking');
const { connectDB, disconnectDB, clearDB } = require('../fixtures/db');
const tokenService = require('../../src/services/tokenService');

describe('Bulk Booking & Guest Authentication Integration Tests', () => {
  let customerUser;
  let customerToken;
  let theater;
  let room1;
  let room2;
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
      name: 'Bulk Customer',
      email: 'bulk@example.com',
      phone: '9876543210',
      password: 'Password@123',
      role: 'customer',
      isVerified: true,
    });
    customerToken = tokenService.generateTokens(customerUser._id).accessToken;

    eventType = await EventType.create({
      name: 'Birthday',
      slug: 'birthday',
      isActive: true,
    });

    theater = await Theater.create({
      name: 'Rio Party House Indiranagar',
      slug: 'rio-party-house-indiranagar',
      city: new mongoose.Types.ObjectId(),
      location: new mongoose.Types.ObjectId(),
      address: '100 Feet Road, Indiranagar',
      isActive: true,
    });

    room1 = await Room.create({
      theater: theater._id,
      name: 'Galaxy Suite',
      price: 2500,
      price1Hour: 1500,
      price2Hours: 2500,
      price3Hours: 3500,
      maximumMembers: 12,
      isActive: true,
      slots: [
        { startTime: '10:00 AM', endTime: '12:00 PM', isActive: true },
        { startTime: '01:00 PM', endTime: '03:00 PM', isActive: true },
      ],
    });

    room2 = await Room.create({
      theater: theater._id,
      name: 'Royal Theater',
      price: 3200,
      price1Hour: 1800,
      price2Hours: 3200,
      price3Hours: 4500,
      maximumMembers: 15,
      isActive: true,
      slots: [
        { startTime: '10:00 AM', endTime: '12:00 PM', isActive: true },
        { startTime: '04:00 PM', endTime: '06:00 PM', isActive: true },
      ],
    });
  });

  it('allows a guest customer without token to create a single booking (resolving 401)', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id.toString(),
        roomId: room1._id.toString(),
        date: '2026-11-20',
        timeSlot: '10:00 AM - 12:00 PM',
        duration: 2,
        eventTypeId: eventType._id.toString(),
        customerDetails: {
          name: 'Guest Tester',
          phone: '9888877777',
          email: 'guesttester@example.com',
          members: 4,
          kids: 0,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookingId).toBeDefined();
    expect(res.body.data.customerDetails.email).toBe('guesttester@example.com');
  });

  it('allows a customer to book multiple rooms and slots in a single bulk request', async () => {
    const res = await request(app)
      .post('/api/v1/bookings/bulk')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        customerDetails: {
          name: 'Bulk Customer',
          phone: '9876543210',
          email: 'bulk@example.com',
          members: 8,
          kids: 1,
        },
        bookings: [
          {
            theaterId: theater._id.toString(),
            roomId: room1._id.toString(),
            date: '2026-11-25',
            timeSlot: '10:00 AM - 12:00 PM',
            duration: 2,
            eventTypeId: eventType._id.toString(),
          },
          {
            theaterId: theater._id.toString(),
            roomId: room2._id.toString(),
            date: '2026-11-25',
            timeSlot: '10:00 AM - 12:00 PM',
            duration: 2,
            eventTypeId: eventType._id.toString(),
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isBulkBooking).toBe(true);
    expect(res.body.data.bulkBookingId).toMatch(/^CS-BULK-/);
    expect(res.body.data.bookingCount).toBe(2);
    expect(res.body.data.combinedPricing.advanceAmount).toBe(1500); // 750 * 2
    expect(res.body.data.bookings).toHaveLength(2);

    // Verify bookings share the same bulkBookingId in database
    const savedBookings = await Booking.find({ bulkBookingId: res.body.data.bulkBookingId });
    expect(savedBookings).toHaveLength(2);
    expect(savedBookings[0].holdExpiresAt).toBeDefined();
  });

  it('rejects conflicting duplicate entries within the same bulk request', async () => {
    const res = await request(app)
      .post('/api/v1/bookings/bulk')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        customerDetails: {
          name: 'Bulk Customer',
          phone: '9876543210',
          email: 'bulk@example.com',
          members: 4,
        },
        bookings: [
          {
            theaterId: theater._id.toString(),
            roomId: room1._id.toString(),
            date: '2026-11-25',
            timeSlot: '10:00 AM - 12:00 PM',
            duration: 2,
            eventTypeId: eventType._id.toString(),
          },
          {
            theaterId: theater._id.toString(),
            roomId: room1._id.toString(), // Same room, same date, same slot!
            date: '2026-11-25',
            timeSlot: '10:00 AM - 12:00 PM',
            duration: 2,
            eventTypeId: eventType._id.toString(),
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Duplicate or overlapping slots selected in your bulk request');
  });

  it('submitting UPI payment for a bulk booking updates all entries in the bulk group', async () => {
    const bulkRes = await request(app)
      .post('/api/v1/bookings/bulk')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        customerDetails: {
          name: 'Bulk Customer',
          phone: '9876543210',
          email: 'bulk@example.com',
          members: 4,
        },
        bookings: [
          {
            theaterId: theater._id.toString(),
            roomId: room1._id.toString(),
            date: '2026-11-26',
            timeSlot: '10:00 AM - 12:00 PM',
            duration: 2,
            eventTypeId: eventType._id.toString(),
          },
          {
            theaterId: theater._id.toString(),
            roomId: room1._id.toString(),
            date: '2026-11-26',
            timeSlot: '01:00 PM - 03:00 PM',
            duration: 2,
            eventTypeId: eventType._id.toString(),
          },
        ],
      });

    const primaryId = bulkRes.body.data.primaryBooking._id;
    const bulkId = bulkRes.body.data.bulkBookingId;

    const payRes = await request(app)
      .post('/api/v1/payment/submit-upi')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId: primaryId,
        upiTransactionId: 'UTR998877665544',
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);

    // Both child bookings should now be in pending_verification status with UPI ref
    const allGroupBookings = await Booking.find({ bulkBookingId: bulkId });
    expect(allGroupBookings).toHaveLength(2);
    expect(allGroupBookings[0].status).toBe('pending_verification');
    expect(allGroupBookings[1].status).toBe('pending_verification');
    expect(allGroupBookings[0].payment.upiTransactionId).toBe('UTR998877665544');
    expect(allGroupBookings[1].payment.upiTransactionId).toBe('UTR998877665544');
  });
});
