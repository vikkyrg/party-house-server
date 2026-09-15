# CS Cinemas API

Production-ready backend API for CS Cinemas private theater booking platform.

## Features

- JWT authentication with refresh tokens, OTP verification, and account lockout
- Role-based access control (customer, admin, super-admin)
- Theater, city, location, event type, and add-on management
- Booking lifecycle with availability checks and Razorpay payments
- Reviews, banners, testimonials, and FAQ content management
- Admin dashboard, revenue reports, audit logs, and CSV export
- Security middleware (Helmet, CORS, rate limiting, XSS, NoSQL injection protection)
- Email notifications (Nodemailer) and SMS (Twilio)
- Cloudinary file uploads
- Winston + Morgan logging
- Jest + Supertest test suite

## Tech Stack

- Node.js 18+
- Express 4
- MongoDB + Mongoose 8
- Joi validation
- Razorpay, Cloudinary, Nodemailer, Twilio

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start MongoDB locally, then run
npm run dev
```

Server runs at `http://localhost:5000`

Health check: `GET /health`

## API Base URL

```
http://localhost:5000/api/v1
```

## Key Endpoints

| Module | Endpoints |
|--------|-----------|
| Auth | `/auth/register`, `/auth/login`, `/auth/verify-otp`, `/auth/me` |
| Theaters | `/theaters`, `/theaters/:id/availability` |
| Bookings | `/bookings`, `/bookings/check-availability` |
| Payment | `/payment/create-order`, `/payment/verify` |
| Admin | `/admin/dashboard/stats`, `/admin/bookings` |

See `postman_collection.json` for the full API collection.

## Environment Variables

```env
# Server
NODE_ENV=development
PORT=5000
API_VERSION=v1

# Database
MONGODB_URI=mongodb://localhost:27017/cs_cinemas
MONGODB_URI_TEST=mongodb://localhost:27017/cs_cinemas_test

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` - Min 32 characters each
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` - Payment gateway
- `CLOUDINARY_*` - Image uploads
- `SMTP_*` - Email delivery
- `TWILIO_*` - SMS (set `SMS_ENABLED=true` in production)
```

## Scripts

```bash
npm start          # Production server
npm run dev        # Development with nodemon
npm test           # Run tests
npm run lint       # ESLint
npm run format     # Prettier
```

## Testing

Tests use an in-memory MongoDB instance:

```bash
npm test
```

## Security

- Passwords hashed with bcrypt (12 rounds)
- HTTP-only cookies for tokens
- Rate limiting: 100 req/hr (API), 5 req/min (auth)
- Account lockout after 5 failed login attempts
- Input validation with Joi
- Token blacklist on logout (in-memory)

## Project Structure

```
src/
├── config/       # Database, Cloudinary, Razorpay, email, SMS
├── models/       # Mongoose schemas
├── controllers/  # Route handlers
├── routes/       # API routes
├── middleware/   # Auth, validation, upload, errors
├── services/     # Email, SMS, tokens, files, audit
├── validators/   # Joi schemas
├── utils/        # Helpers, logger, API features
└── templates/    # Email Handlebars templates
```

## Deployment

1. Set all production environment variables
2. Enable HTTPS and update `CORS_ORIGIN`
3. Use PM2 or similar process manager:

```bash
npm ci --only=production
pm2 start server.js --name bingetown-api
```

## License

MIT
