const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const Booking = require('../../src/models/Booking');
const Theater = require('../../src/models/Theater');
const Room = require('../../src/models/Room');
const EventType = require('../../src/models/EventType');
const { connectDB, disconnectDB, clearDB } = require('../fixtures/db');

describe('Sequential Booking & 3-Bookings-Per-Hour Rate Limiting', () => {
  let theater, room, eventType;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();

    theater = await Theater.create({
      name: 'Rio Party House Central',
      slug: 'rio-party-house-central',
      city: new mongoose.Types.ObjectId(),
      location: new mongoose.Types.ObjectId(),
      address: '123 Main Road, Indiranagar',
      isActive: true,
      price: 1500,
    });

    room = await Room.create({
      theater: theater._id,
      name: 'Sigma Room',
      description: 'Sigma Room for private screenings',
      maximumMembers: 10,
      price1Hour: 1000,
      price2Hours: 1800,
      price3Hours: 2500,
      isActive: true,
      slots: [
        { startTime: '10:00 AM', endTime: '12:00 PM', isActive: true },
        { startTime: '12:30 PM', endTime: '02:30 PM', isActive: true },
        { startTime: '03:00 PM', endTime: '05:00 PM', isActive: true },
        { startTime: '05:30 PM', endTime: '07:30 PM', isActive: true },
        { startTime: '08:00 PM', endTime: '10:00 PM', isActive: true },
      ],
    });

    eventType = await EventType.create({
      name: 'Birthday Party',
      description: 'Birthday celebration setup',
      price: 500,
      isActive: true,
    });
  });

  test('Guest customer can make 3 legitimate sequential completed bookings within the same hour, but the 4th is rejected', async () => {
    const customerDetails = {
      name: 'Sequential Customer',
      phone: '9988776655',
      email: 'seqcustomer@example.com',
      members: 4,
    };

    const slots = [
      '10:00 AM - 12:00 PM',
      '12:30 PM - 02:30 PM',
      '03:00 PM - 05:00 PM',
      '05:30 PM - 07:30 PM',
    ];

    // 1st Booking
    const res1 = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: '2026-11-20',
        timeSlot: slots[0],
        duration: 2,
        eventTypeId: eventType._id,
        customerDetails,
      });

    expect(res1.status).toBe(201);
    expect(res1.body.success).toBe(true);
    const booking1Id = res1.body.data._id;

    // Simulate completion / payment submission for booking 1
    await Booking.findByIdAndUpdate(booking1Id, {
      status: 'confirmed',
      'payment.status': 'paid',
    });

    // 2nd Sequential Booking in same hour
    const res2 = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: '2026-11-20',
        timeSlot: slots[1],
        duration: 2,
        eventTypeId: eventType._id,
        customerDetails,
      });

    expect(res2.status).toBe(201);
    expect(res2.body.success).toBe(true);
    const booking2Id = res2.body.data._id;

    // Complete booking 2
    await Booking.findByIdAndUpdate(booking2Id, {
      status: 'confirmed',
      'payment.status': 'paid',
    });

    // 3rd Sequential Booking in same hour
    const res3 = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: '2026-11-20',
        timeSlot: slots[2],
        duration: 2,
        eventTypeId: eventType._id,
        customerDetails,
      });

    expect(res3.status).toBe(201);
    expect(res3.body.success).toBe(true);
    const booking3Id = res3.body.data._id;

    // Complete booking 3
    await Booking.findByIdAndUpdate(booking3Id, {
      status: 'confirmed',
      'payment.status': 'paid',
    });

    // 4th Sequential Booking within the same hour should be rejected with 429
    const res4 = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: '2026-11-20',
        timeSlot: slots[3],
        duration: 2,
        eventTypeId: eventType._id,
        customerDetails,
      });

    expect(res4.status).toBe(429);
    expect(res4.body.message).toMatch(/You can only create 3 bookings per hour/i);
  });

  test('Abandoned or unpaid bookings do not count against the 3-booking-per-hour limit', async () => {
    const customerDetails = {
      name: 'Unpaid Customer',
      phone: '9876543210',
      email: 'unpaid@example.com',
      members: 2,
    };

    // Customer creates a booking but never pays (status remains 'pending' / payment 'pending')
    const res1 = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: '2026-11-21',
        timeSlot: '10:00 AM - 12:00 PM',
        duration: 2,
        eventTypeId: eventType._id,
        customerDetails,
      });

    expect(res1.status).toBe(201);

    // Now mark it expired/cancelled
    await Booking.findByIdAndUpdate(res1.body.data._id, {
      status: 'cancelled',
      cancellationReason: 'Hold window expired',
    });

    // Customer makes another 3 completed bookings
    for (let i = 1; i <= 3; i++) {
      const slot = room.slots[i];
      const slotStr = `${slot.startTime} - ${slot.endTime}`;
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({
          theaterId: theater._id,
          roomId: room._id,
          date: '2026-11-21',
          timeSlot: slotStr,
          duration: 2,
          eventTypeId: eventType._id,
          customerDetails,
        });

      expect(res.status).toBe(201);
      await Booking.findByIdAndUpdate(res.body.data._id, {
        status: 'confirmed',
        'payment.status': 'paid',
      });
    }

    // Now the 4th completed attempt will hit the 429 limit
    const resFinal = await request(app)
      .post('/api/v1/bookings')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: '2026-11-21',
        timeSlot: '08:00 PM - 10:00 PM',
        duration: 2,
        eventTypeId: eventType._id,
        customerDetails,
      });

    expect(resFinal.status).toBe(429);
  });
});
