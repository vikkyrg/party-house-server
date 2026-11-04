const roundMoney = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

const getPaymentSummary = (booking) => {
  const total = roundMoney(booking.pricing?.total || 0);
  const records = booking.paymentRecords || [];
  const verifiedRecords = records.filter((record) => record.paymentStatus === 'verified');
  const pendingRecords = records.filter((record) => record.paymentStatus === 'pending_verification');
  const latestRecord = records[records.length - 1];
  const legacyVerifiedAmount = Number(booking.payment?.legacyVerifiedAmount || 0);
  const verifiedAmountPaid = roundMoney(
    verifiedRecords.reduce((sum, record) => sum + Number(record.paymentAmount || 0), legacyVerifiedAmount) ||
      (records.length === 0 && ['paid', 'partial', 'partially_paid', 'fully_paid'].includes(booking.payment?.status)
        ? booking.payment.amountPaid || 0
        : 0)
  );
  const pendingVerificationAmount = roundMoney(
    pendingRecords.reduce((sum, record) => sum + Number(record.paymentAmount || 0), 0) +
      (records.length === 0 && ['submitted', 'pending_verification'].includes(booking.payment?.status)
        ? Number(booking.payment?.amountPaid || booking.pricing?.advanceAmount || 0)
        : 0)
  );
  const totalCustomerSubmittedAmount = roundMoney(
    records.reduce((sum, record) => sum + Number(record.paymentAmount || 0), 0) +
      (records.length === 0 && booking.payment?.upiTransactionId
        ? Number(booking.payment?.amountPaid || booking.pricing?.advanceAmount || 0)
        : 0)
  );
  const remainingBalance = roundMoney(Math.max(0, total - verifiedAmountPaid));

  let paymentStatus = 'unpaid';
  if (remainingBalance === 0 && total > 0) paymentStatus = 'fully_paid';
  else if (pendingVerificationAmount > 0) paymentStatus = 'pending_verification';
  else if (latestRecord?.paymentStatus === 'rejected') paymentStatus = 'payment_rejected';
  else if (verifiedAmountPaid > 0) paymentStatus = 'partially_paid';
  else if (records.length === 0 && booking.payment?.status === 'rejected') paymentStatus = 'payment_rejected';
  else if (['paid', 'fully_paid'].includes(booking.payment?.status)) paymentStatus = 'fully_paid';

  return {
    totalBookingAmount: total,
    advanceAmountRequired: roundMoney(booking.pricing?.advanceAmount || 0),
    totalCustomerSubmittedAmount,
    verifiedAmountPaid,
    pendingVerificationAmount,
    remainingBalance,
    paymentStatus,
  };
};

const verifiedAmountExpression = () => ({
  $add: [
    { $ifNull: ['$payment.legacyVerifiedAmount', 0] },
    {
      $sum: {
        $map: {
          input: { $ifNull: ['$paymentRecords', []] },
          as: 'record',
          in: {
            $cond: [
              { $eq: ['$$record.paymentStatus', 'verified'] },
              '$$record.paymentAmount',
              0,
            ],
          },
        },
      },
    },
    {
      $cond: [
        {
          $and: [
            { $eq: [{ $size: { $ifNull: ['$paymentRecords', []] } }, 0] },
            { $in: ['$payment.status', ['paid', 'partial', 'partially_paid', 'fully_paid']] },
          ],
        },
        { $ifNull: ['$payment.amountPaid', 0] },
        0,
      ],
    },
  ],
});

const countPaymentStatusExpression = (paymentStatus) => ({
  $size: {
    $filter: {
      input: { $ifNull: ['$paymentRecords', []] },
      as: 'record',
      cond: { $eq: ['$$record.paymentStatus', paymentStatus] },
    },
  },
});

const paymentStatusExpression = () => {
  const verified = verifiedAmountExpression();
  const total = { $ifNull: ['$pricing.total', 0] };
  const latestRecordRejected = {
    $let: {
      vars: {
        latestRecord: {
          $arrayElemAt: [{ $ifNull: ['$paymentRecords', []] }, -1],
        },
      },
      in: { $eq: ['$$latestRecord.paymentStatus', 'rejected'] },
    },
  };
  const legacyPaymentRejected = {
    $and: [
      { $eq: [{ $size: { $ifNull: ['$paymentRecords', []] } }, 0] },
      { $eq: ['$payment.status', 'rejected'] },
    ],
  };

  return {
    $switch: {
      branches: [
        { case: { $gte: [verified, total] }, then: 'fully_paid' },
        { case: { $gt: [countPaymentStatusExpression('pending_verification'), 0] }, then: 'pending_verification' },
        { case: { $or: [latestRecordRejected, legacyPaymentRejected] }, then: 'payment_rejected' },
        { case: { $gt: [verified, 0] }, then: 'partially_paid' },
      ],
      default: 'unpaid',
    },
  };
};

const paymentRecordsSummaryUpdate = () => {
  const verified = verifiedAmountExpression();

  return {
    'payment.amountPaid': verified,
    'payment.status': paymentStatusExpression(),
    'payment.paidAt': {
      $cond: [
        { $eq: [paymentStatusExpression(), 'fully_paid'] },
        { $ifNull: ['$payment.paidAt', '$$NOW'] },
        '$payment.paidAt',
      ],
    },
    'pricing.balanceAmount': {
      $max: [0, { $subtract: [{ $ifNull: ['$pricing.total', 0] }, verified] }],
    },
  };
};

module.exports = {
  roundMoney,
  getPaymentSummary,
  verifiedAmountExpression,
  countPaymentStatusExpression,
  paymentStatusExpression,
  paymentRecordsSummaryUpdate,
};
