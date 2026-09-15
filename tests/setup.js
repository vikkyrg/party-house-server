require('dotenv').config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_min_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_min_32_characters_long';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.SMS_ENABLED = 'false';

jest.setTimeout(30000);
