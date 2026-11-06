const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Theater = require('../../src/models/Theater');
const Room = require('../../src/models/Room');
const EventType = require('../../src/models/EventType');
const Booking = require('../../src/models/Booking');
const RoomSlotReservation = require('../../src/models/RoomSlotReservation');
const { connectDB, disconnectDB, clearDB } = require('../fixtures/db');
const { cleanupExpiredBookings } = require('../../src/services/bookingExpiryService');
const { normalizeBookingDate, getActiveBookingsFilter } = require('../../src/utils/dateUtils');
const tokenService = require('../../src/services/tokenService');
const futureBookingDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
    date: futureBookingDate,
    bookingDate: futureBookingDate,
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

  it('creates an atomic hold at slot selection and uses it for booking creation', async () => {
    const holdId = new mongoose.Types.ObjectId().toString();
    const customerAgent = request.agent(app);
    const holdRes = await customerAgent
      .post('/api/v1/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        timeSlotId: room.slots[0]._id,
        duration: 1,
        holdId,
      })
      .expect(201);

    const bookingRes = await customerAgent
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
        slotHoldId: holdRes.body.data.holdId,
        timeSlotId: room.slots[0]._id,
      })
      .expect(201);

    expect(bookingRes.body.data._id).toBe(holdId);
    expect(bookingRes.body.data.timeSlotId).toBe(room.slots[0]._id.toString());
    expect(bookingRes.body.data.duration).toBe(1);
  });

  it('creates an anonymous hold before guest details and binds it when booking is submitted', async () => {
    const holdId = new mongoose.Types.ObjectId().toString();
    const guestAgent = request.agent(app);
    const holdRes = await guestAgent
      .post('/api/v1/bookings/hold')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        timeSlotId: room.slots[0]._id,
        duration: 1,
        holdId,
      })
      .expect(201);

    expect(holdRes.body.data.holdId).toBe(holdId);
    let reservationDay = await RoomSlotReservation.findOne({ room: room._id });
    expect(reservationDay.reservations[0].customer).toBeUndefined();

    const bookingRes = await guestAgent
      .post('/api/v1/bookings')
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
        slotHoldId: holdId,
        timeSlotId: room.slots[0]._id,
      })
      .expect(201);

    expect(bookingRes.body.data._id).toBe(holdId);
    reservationDay = await RoomSlotReservation.findOne({ room: room._id });
    expect(reservationDay.reservations[0].customer.toString()).toBe(
      bookingRes.body.data.user.toString()
    );
    expect(bookingRes.body.data.user.toString()).not.toBe(customerUser._id.toString());
  });

  it('binds a hold and payment status to the creating browser session', async () => {
    const holdId = new mongoose.Types.ObjectId().toString();
    const draftId = require('crypto').randomBytes(16).toString('hex');
    const guestAgentA = request.agent(app);
    const guestAgentB = request.agent(app);

    await guestAgentA
      .post('/api/v1/bookings/hold')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        timeSlotId: room.slots[0]._id,
        duration: 1,
        holdId,
      })
      .expect(201);

    const draftPayload = {
      selection: {
        theaterId: theater._id.toString(),
        roomId: room._id.toString(),
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        timeSlotId: room.slots[0]._id.toString(),
        duration: 1,
      },
      currentStep: 2,
      customerDetails: validBookingPayload.customerDetails,
      selectedEventType: eventType._id.toString(),
      selectedCake: null,
      selectedAddons: {},
      termsAccepted: false,
    };

    await guestAgentA.put(`/api/v1/bookings/drafts/${draftId}`).send(draftPayload).expect(200);
    const restoredDraft = await guestAgentA.get(`/api/v1/bookings/drafts/${draftId}`).expect(200);
    expect(restoredDraft.body.data.customerDetails.email).toBe(validBookingPayload.customerDetails.email);
    await guestAgentB.get(`/api/v1/bookings/drafts/${draftId}`).expect(409);
    await guestAgentB.put(`/api/v1/bookings/drafts/${draftId}`).send(draftPayload).expect(409);

    const bookingPayload = {
      ...validBookingPayload,
      theaterId: theater._id,
      roomId: room._id,
      eventTypeId: eventType._id,
      slotHoldId: holdId,
      timeSlotId: room.slots[0]._id,
    };

    await guestAgentB.post('/api/v1/bookings').send(bookingPayload).expect(409);

    const booking = await guestAgentA.post('/api/v1/bookings').send(bookingPayload).expect(201);
    expect(booking.body.data.bookingSessionId).toBeUndefined();
    const restoredBooking = await guestAgentA.get('/api/v1/bookings/current-session').expect(200);
    expect(restoredBooking.body.data._id).toBe(booking.body.data._id);
    const customerBSession = await guestAgentB.get('/api/v1/bookings/current-session').expect(200);
    expect(customerBSession.body.data).toBeNull();
    await guestAgentA.get(`/api/v1/payment/status/${booking.body.data._id}`).expect(200);
    await guestAgentB.get(`/api/v1/payment/status/${booking.body.data._id}`).expect(403);
  });

  it('returns 404 for a room that is not present in the selected theater', async () => {
    await request(app)
      .post('/api/v1/bookings/hold')
      .send({
        theaterId: theater._id,
        roomId: new mongoose.Types.ObjectId(),
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        duration: 1,
      })
      .expect(404);
  });

  it('returns 404 for a slot ID that is not part of the selected room', async () => {
    await request(app)
      .post('/api/v1/bookings/hold')
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        timeSlotId: new mongoose.Types.ObjectId(),
        duration: 1,
      })
      .expect(404);
  });

  it('releases an expired abandoned hold and allows the slot to be reserved again', async () => {
    const holdId = new mongoose.Types.ObjectId().toString();
    await request(app)
      .post('/api/v1/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        theaterId: theater._id,
        roomId: room._id,
        date: futureBookingDate,
        timeSlot: validBookingPayload.timeSlot,
        timeSlotId: room.slots[0]._id,
        duration: 1,
        holdId,
      })
      .expect(201);

    const day = await RoomSlotReservation.findOne({ room: room._id });
    day.reservations[0].expiresAt = new Date(Date.now() - 1000);
    await day.save();

    const availability = await request(app)
      .get('/api/v1/bookings/check-availability')
      .query({ roomId: room._id.toString(), date: futureBookingDate })
      .expect(200);
    const slot = availability.body.data.slots.find((item) => item.time === validBookingPayload.timeSlot);
    expect(slot.available).toBe(true);

    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer2Token}`)
      .send({
        ...validBookingPayload,
        theaterId: theater._id,
        roomId: room._id,
        eventTypeId: eventType._id,
        customerDetails: {
          ...validBookingPayload.customerDetails,
          name: 'Customer B',
          email: 'customerb@example.com',
          phone: '9876543211',
        },
      })
      .expect(201);
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
        date: futureBookingDate,
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

  it('allows only one customer to win concurrent hold creation for the same slot', async () => {
    const createForCustomer = (token, customerDetails) =>
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBookingPayload,
          theaterId: theater._id,
          roomId: room._id,
          eventTypeId: eventType._id,
          customerDetails,
        });

    const responses = await Promise.all([
      createForCustomer(customerToken, validBookingPayload.customerDetails),
      createForCustomer(customer2Token, {
        name: 'Customer B',
        email: 'customerb@example.com',
        phone: '9876543211',
        members: 2,
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await Booking.countDocuments({
      room: room._id,
      date: normalizeBookingDate(futureBookingDate),
      timeSlot: validBookingPayload.timeSlot,
      status: { $in: ['pending', 'pending_payment', 'pending_verification'] },
    })).toBe(1);
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
        paymentAmount: createRes.body.data.pricing.total,
        upiTransactionId: '123456789012',
      })
      .expect(200);

    expect(upiRes.body.data.status).toBe('pending_verification');
    expect(upiRes.body.data.paymentStatus).toBe('pending_verification');

    const pendingStatusRes = await request(app)
      .get(`/api/v1/payment/status/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(pendingStatusRes.body.data.paymentSummary.verifiedAmountPaid).toBe(0);
    expect(pendingStatusRes.body.data.paymentSummary.pendingVerificationAmount).toBe(
      createRes.body.data.pricing.total
    );
    expect(pendingStatusRes.body.data.paymentStatus).toBe('pending_verification');

    // Admin verifies advance payment
    const adminVerifyRes = await request(app)
      .put(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'verifyPayment',
        paymentRecordId: upiRes.body.data.paymentRecords[0]._id,
      })
      .expect(200);

    expect(adminVerifyRes.body.data.status).toBe('confirmed');
    expect(adminVerifyRes.body.data.payment.status).toBe('fully_paid');
    expect(adminVerifyRes.body.data.paymentSummary.verifiedAmountPaid).toBe(createRes.body.data.pricing.total);

    const verifiedStatusRes = await request(app)
      .get(`/api/v1/payment/status/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(verifiedStatusRes.body.data.paymentSummary.verifiedAmountPaid).toBe(
      createRes.body.data.pricing.total
    );
    expect(verifiedStatusRes.body.data.paymentSummary.remainingBalance).toBe(0);

    // Check availability now shows Sold Out
    const availRes = await request(app)
      .get('/api/v1/bookings/check-availability')
      .query({
        roomId: room._id.toString(),
        date: futureBookingDate,
      })
      .expect(200);

    const soldOutSlot = availRes.body.data.slots.find((s) => s.time === '10:30 AM - 11:30 AM');
    expect(soldOutSlot.available).toBe(false);
    expect(soldOutSlot.slotState).toBe('sold_out');
    expect(soldOutSlot.reason).toBe('Sold Out');
  });

  it('returns a clear client error for an invalid payment status booking ID', async () => {
    const res = await request(app)
      .get('/api/v1/payment/status/not-an-object-id')
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/valid booking ID/i);
  });

  it('accepts multiple partial payments, verifies each once, and blocks overpayment after full payment', async () => {
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
    const total = createRes.body.data.pricing.total;
    const advanceRequired = createRes.body.data.pricing.advanceAmount;
    const firstAmount = Math.min(250, total - 2);
    const secondAmount = firstAmount;
    const finalAmount = total - firstAmount - secondAmount;

    const submit = (paymentAmount, transactionReference) =>
      request(app)
        .post('/api/v1/payment/submit-upi')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId, paymentAmount, transactionReference });
    const verify = (paymentRecordId) =>
      request(app)
        .put(`/api/v1/admin/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'verifyPayment', paymentRecordId });

    const first = await submit(firstAmount, 'UTR-PARTIAL-0001').expect(200);
    expect(first.body.data.paymentSummary.verifiedAmountPaid).toBe(0);
    expect(first.body.data.paymentSummary.pendingVerificationAmount).toBe(firstAmount);
    expect(first.body.data.paymentSummary.totalCustomerSubmittedAmount).toBe(firstAmount);
    expect(first.body.data.paymentRecords[0].customerId).toBe(createRes.body.data.user);
    expect(first.body.data.paymentSummary.remainingBalance).toBe(total);
    await submit(firstAmount, 'UTR-PARTIAL-0001').expect(409);

    await submit(total + 1, 'UTR-OVERPAY-0001').expect(400);
    await submit(secondAmount, 'UTR-PARTIAL-0002').expect(200);

    const firstRecordId = first.body.data.paymentRecords[0]._id;
    const verifiedFirst = await verify(firstRecordId).expect(200);
    expect(verifiedFirst.body.data.paymentSummary.verifiedAmountPaid).toBe(firstAmount);
    expect(verifiedFirst.body.data.paymentSummary.remainingBalance).toBe(total - firstAmount);
    expect(verifiedFirst.body.data.status).toBe(
      firstAmount >= advanceRequired ? 'confirmed' : 'pending_verification'
    );
    const refreshedAdminDetail = await request(app)
      .get(`/api/v1/admin/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(refreshedAdminDetail.body.data.paymentSummary.verifiedAmountPaid).toBe(firstAmount);
    expect(refreshedAdminDetail.body.data.paymentSummary.remainingBalance).toBe(total - firstAmount);
    const refreshedCustomerDetail = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(refreshedCustomerDetail.body.data.paymentSummary.remainingBalance).toBe(total - firstAmount);
    const persistedVerifiedBooking = await Booking.findById(bookingId);
    expect(persistedVerifiedBooking.payment.amountPaid).toBe(firstAmount);
    expect(persistedVerifiedBooking.pricing.balanceAmount).toBe(total - firstAmount);
    await verify(firstRecordId).expect(409);

    const bookingAfterSecond = await Booking.findById(bookingId);
    const secondRecord = bookingAfterSecond.paymentRecords.find(
      (record) => record.transactionReference === 'UTR-PARTIAL-0002'
    );
    const verifiedSecond = await verify(secondRecord._id).expect(200);
    expect(verifiedSecond.body.data.paymentSummary.verifiedAmountPaid).toBe(firstAmount + secondAmount);
    expect(verifiedSecond.body.data.paymentSummary.paymentStatus).toBe('partially_paid');
    expect(verifiedSecond.body.data.status).toBe(
      firstAmount + secondAmount >= advanceRequired ? 'confirmed' : 'pending_payment'
    );

    const rejectedSubmission = await submit(1, 'UTR-PARTIAL-REJECT-0001').expect(200);
    const rejectedRecord = rejectedSubmission.body.data.paymentRecords.find(
      (record) => record.transactionReference === 'UTR-PARTIAL-REJECT-0001'
    );
    const rejectedPartial = await request(app)
      .put(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'rejectPayment',
        paymentRecordId: rejectedRecord._id,
        rejectionReason: 'Reference not found in bank statement',
      })
      .expect(200);
    expect(rejectedPartial.body.data.paymentSummary.verifiedAmountPaid).toBe(firstAmount + secondAmount);
    expect(rejectedPartial.body.data.paymentSummary.remainingBalance).toBe(total - firstAmount - secondAmount);
    expect(rejectedPartial.body.data.paymentSummary.paymentStatus).toBe('payment_rejected');
    const persistedRejectedBooking = await Booking.findById(bookingId);
    expect(persistedRejectedBooking.payment.amountPaid).toBe(firstAmount + secondAmount);
    expect(persistedRejectedBooking.pricing.balanceAmount).toBe(total - firstAmount - secondAmount);

    const finalPayment = await submit(finalAmount, 'UTR-PARTIAL-0003').expect(200);
    const finalRecord = finalPayment.body.data.paymentRecords.find(
      (record) => record.transactionReference === 'UTR-PARTIAL-0003'
    );
    const fullyPaid = await verify(finalRecord._id).expect(200);
    expect(fullyPaid.body.data.paymentSummary.paymentStatus).toBe('fully_paid');
    expect(fullyPaid.body.data.paymentSummary.remainingBalance).toBe(0);
    await submit(1, 'UTR-AFTER-FULL-0001').expect(409);
  });

  it('does not reduce the balance when an individual payment is rejected', async () => {
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
    const total = createRes.body.data.pricing.total;
    const amount = Math.min(200, total);

    const submitted = await request(app)
      .post('/api/v1/payment/submit-upi')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId, paymentAmount: amount, transactionReference: 'UTR-REJECT-0001' })
      .expect(200);
    const record = submitted.body.data.paymentRecords[0];

    const rejected = await request(app)
      .put(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'rejectPayment',
        paymentRecordId: record._id,
        rejectionReason: 'Reference not found in bank statement',
      })
      .expect(200);

    expect(rejected.body.data.paymentSummary.verifiedAmountPaid).toBe(0);
    expect(rejected.body.data.paymentSummary.pendingVerificationAmount).toBe(0);
    expect(rejected.body.data.paymentSummary.remainingBalance).toBe(total);
    expect(rejected.body.data.paymentSummary.paymentStatus).toBe('payment_rejected');
  });

  it('prevents concurrent verification from exceeding the booking total', async () => {
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
    const total = createRes.body.data.pricing.total;
    const submissions = await Promise.all(
      ['UTR-CONCURRENT-0001', 'UTR-CONCURRENT-0002'].map((transactionReference) =>
        request(app)
          .post('/api/v1/payment/submit-upi')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ bookingId, paymentAmount: total, transactionReference })
      )
    );
    submissions.forEach((response) => expect(response.status).toBe(200));
    const [bookingBeforeVerification] = await Promise.all([Booking.findById(bookingId)]);
    const verificationResults = await Promise.all(
      bookingBeforeVerification.paymentRecords.map((record) =>
        request(app)
          .put(`/api/v1/admin/bookings/${bookingId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ action: 'verifyPayment', paymentRecordId: record._id.toString() })
      )
    );

    expect(verificationResults.map((response) => response.status).sort()).toEqual([200, 409]);
    const finalBooking = await Booking.findById(bookingId);
    expect(finalBooking.payment.amountPaid).toBe(total);
    expect(finalBooking.paymentRecords.filter((record) => record.paymentStatus === 'verified')).toHaveLength(1);
  });

  it('preserves the original 10-minute expiry after payment submission and releases an expired hold', async () => {
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
    const originalExpiry = new Date(createRes.body.data.holdExpiresAt);

    await request(app)
      .post('/api/v1/payment/submit-upi')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId, paymentAmount: 1, upiTransactionId: '123456789012' })
      .expect(200);

    let booking = await Booking.findById(bookingId);
    expect(booking.holdExpiresAt.getTime()).toBe(originalExpiry.getTime());

    const pastDate = new Date(Date.now() - 60 * 1000);
    await Booking.findByIdAndUpdate(bookingId, {
      holdExpiresAt: pastDate,
      expiresAt: pastDate,
    });

    const statusRes = await request(app)
      .get(`/api/v1/payment/status/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(statusRes.body.data.isExpired).toBe(true);
    booking = await Booking.findById(bookingId);
    expect(booking.status).toBe('cancelled');

    await request(app)
      .post('/api/v1/payment/submit-upi')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ bookingId, paymentAmount: 1, upiTransactionId: '123456789012' })
      .expect(409);
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
        date: futureBookingDate,
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
      date: normalizeBookingDate(futureBookingDate),
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
        paymentAmount: 1,
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
      date: normalizeBookingDate(futureBookingDate),
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
