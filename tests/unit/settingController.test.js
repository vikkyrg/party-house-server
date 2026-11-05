jest.mock('../../src/services/settingService', () => ({
  getAdvancePaymentAmount: jest.fn().mockResolvedValue(750),
}));

jest.mock('../../src/models/Setting', () => ({}));

const settingService = require('../../src/services/settingService');
const { getPublicPaymentSettings } = require('../../src/controllers/settingController');

describe('public payment settings', () => {
  const originalUpiId = process.env.UPI_ID;

  afterEach(() => {
    if (originalUpiId === undefined) {
      delete process.env.UPI_ID;
    } else {
      process.env.UPI_ID = originalUpiId;
    }
    jest.clearAllMocks();
  });

  const getResponseData = async () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getPublicPaymentSettings({}, response, jest.fn());
    return response.json.mock.calls[0][0].data;
  };

  it('returns the configured business UPI ID when no environment override is set', async () => {
    delete process.env.UPI_ID;

    await expect(getResponseData()).resolves.toEqual({
      advancePaymentAmount: 750,
      upiId: 'shailajagovindraju-1@okhdfcbank',
    });
    expect(settingService.getAdvancePaymentAmount).toHaveBeenCalledTimes(1);
  });

  it('prefers a non-empty environment override', async () => {
    process.env.UPI_ID = ' shailajagovindraju-1@okhdfcbank ';

    await expect(getResponseData()).resolves.toMatchObject({
      upiId: 'shailajagovindraju-1@okhdfcbank',
    });
  });
});
