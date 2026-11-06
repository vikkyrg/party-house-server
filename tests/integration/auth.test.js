const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { connectDB, disconnectDB, clearDB } = require('../fixtures/db');

beforeAll(async () => {
  await connectDB();
});

afterEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('POST /api/v1/auth/register', () => {
  it('should register a new user successfully', async () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '8147897771',
      password: 'Test@1234',
    };

    const res = await request(app).post('/api/v1/auth/register').send(userData).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(userData.email);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('should fail with existing email', async () => {
    await User.create({
      name: 'Existing User',
      email: 'existing@example.com',
      phone: '9876543211',
      password: 'Test@1234',
    });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test User 2',
        email: 'existing@example.com',
        phone: '9876543212',
        password: 'Test@1234',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('should login successfully with valid credentials', async () => {
    await User.create({
      name: 'Login User',
      email: 'login@example.com',
      phone: '9876543213',
      password: 'Test@1234',
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: 'Test@1234' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.success).toBe(true);
  });
});
