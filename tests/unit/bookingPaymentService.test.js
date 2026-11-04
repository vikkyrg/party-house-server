const { getPaymentSummary } = require('../../src/services/bookingPaymentService');

const createBooking = (paymentRecords = []) => ({
  pricing: { total: 2147, advanceAmount: 750 },
  payment: { amountPaid: 0, legacyVerifiedAmount: 0, status: 'pending' },
  paymentRecords,
});

const createPayment = (paymentAmount, paymentStatus) => ({
  paymentAmount,
  paymentStatus,
});

describe('booking payment summary', () => {
  it('uses verified payment records only to reduce the remaining balance', () => {
    const unpaid = getPaymentSummary(createBooking());
    expect(unpaid.remainingBalance).toBe(2147);
    expect(unpaid.paymentStatus).toBe('unpaid');

    const pending = getPaymentSummary(
      createBooking([createPayment(750, 'pending_verification')])
    );
    expect(pending.totalCustomerSubmittedAmount).toBe(750);
    expect(pending.verifiedAmountPaid).toBe(0);
    expect(pending.pendingVerificationAmount).toBe(750);
    expect(pending.remainingBalance).toBe(2147);
    expect(pending.paymentStatus).toBe('pending_verification');

    const verifiedAdvance = getPaymentSummary(
      createBooking([createPayment(750, 'verified')])
    );
    expect(verifiedAdvance.verifiedAmountPaid).toBe(750);
    expect(verifiedAdvance.pendingVerificationAmount).toBe(0);
    expect(verifiedAdvance.remainingBalance).toBe(1397);
    expect(verifiedAdvance.paymentStatus).toBe('partially_paid');
  });

  it('excludes pending and rejected amounts while summing multiple verified payments', () => {
    const afterTwoVerified = getPaymentSummary(
      createBooking([
        createPayment(750, 'verified'),
        createPayment(500, 'verified'),
      ])
    );
    expect(afterTwoVerified.verifiedAmountPaid).toBe(1250);
    expect(afterTwoVerified.remainingBalance).toBe(897);

    const withPending = getPaymentSummary(
      createBooking([
        createPayment(750, 'verified'),
        createPayment(500, 'verified'),
        createPayment(200, 'pending_verification'),
      ])
    );
    expect(withPending.verifiedAmountPaid).toBe(1250);
    expect(withPending.pendingVerificationAmount).toBe(200);
    expect(withPending.remainingBalance).toBe(897);

    const afterThirdVerified = getPaymentSummary(
      createBooking([
        createPayment(750, 'verified'),
        createPayment(500, 'verified'),
        createPayment(200, 'verified'),
        createPayment(100, 'rejected'),
      ])
    );
    expect(afterThirdVerified.verifiedAmountPaid).toBe(1450);
    expect(afterThirdVerified.pendingVerificationAmount).toBe(0);
    expect(afterThirdVerified.remainingBalance).toBe(697);

    const fullyPaid = getPaymentSummary(
      createBooking([
        createPayment(750, 'verified'),
        createPayment(500, 'verified'),
        createPayment(897, 'verified'),
      ])
    );
    expect(fullyPaid.verifiedAmountPaid).toBe(2147);
    expect(fullyPaid.remainingBalance).toBe(0);
    expect(fullyPaid.paymentStatus).toBe('fully_paid');
  });
});
