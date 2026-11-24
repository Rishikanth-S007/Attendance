const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/environment');
const connectDatabase = require('./config/database');
const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/errorMiddleware');
const { ensureDefaultShift } = require('./services/calendarService');

const app = express();
app.set('trust proxy', env.trustProxy);

// --- Security middleware ---
app.use(helmet());
app.use(cors({ origin: env.allowedOrigins.includes('*') ? true : env.allowedOrigins, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// Rate limiting: a general ceiling, plus tighter limits where abuse is costly.
const limiter = (windowMs, max) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false });
app.use(limiter(15 * 60 * 1000, 600));
app.use('/api/auth/login', limiter(15 * 60 * 1000, 10)); // slows password guessing
app.use('/api/auth/setup-first-admin', limiter(60 * 60 * 1000, 10));
const faceLimiter = limiter(60 * 1000, env.faceRateLimitPerMinute); // each request runs the face model
['/api/attendance/check-in', '/api/attendance/check-out', '/api/attendance/verify', '/api/leaves/app'].forEach((p) => app.use(p, faceLimiter));

// --- Routes ---
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'attendance-backend' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/config', require('./routes/configRoutes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorMiddleware);

async function start() {
  await connectDatabase();
  await ensureDefaultShift();
  app.listen(env.port, '0.0.0.0', () => {
    logger.info(`Backend listening on http://0.0.0.0:${env.port}`);
    logger.info(`AI face service expected at ${env.faceServiceUrl}`);
    if (!env.requireDeviceKey) logger.warn('REQUIRE_DEVICE_KEY is off: check-in endpoints accept any caller');
  });
}

// Importing the app (tests) must not open a port or connect to a database.
if (require.main === module) start();

module.exports = app;
