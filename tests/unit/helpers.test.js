const { generateOTP, createSlug } = require('../../src/utils/helpers');

describe('helpers', () => {
  it('should generate OTP of specified length', () => {
    const otp = generateOTP(6);
    expect(otp).toHaveLength(6);
    expect(/^\d+$/.test(otp)).toBe(true);
  });

  it('should create slug from text', () => {
    expect(createSlug('Hello World')).toBe('hello-world');
  });
});
