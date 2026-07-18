require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const { connectDB } = require('./src/db');
const submitRouter = require('./src/routes/submit');
const trackRouter = require('./src/routes/track');
const adminAuthRouter = require('./src/routes/adminAuth');
const adminRouter = require('./src/routes/admin');

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function main() {
  await connectDB();

  const app = express();

  // Render/Railway/Fly put the app behind more than one proxy hop, so
  // trusting only "1" hop lands on an internal/private hop's address
  // instead of the real client IP. Trust the whole chain and take the
  // left-most (original client) address from X-Forwarded-For.
  app.set('trust proxy', true);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(
    helmet({
      // Dashboard uses inline <script> for small bits of glue code and a
      // CDN-hosted Chart.js; relax CSP just enough for that instead of
      // disabling it entirely.
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));

  // Every request gets one line in stdout when it finishes — this is what
  // shows up in Render's Logs tab in real time. Kept intentionally plain
  // (method, path, status, timing, ip) rather than pulling in a logging
  // dependency for something this small.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      console.log(`[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms) ip=${req.ip}`);
    });
    next();
  });

  // CORS: only the public submit/track endpoints need to be reachable cross-origin
  // from the survey's domain. The admin area is same-origin browser use only.
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  app.use(
    '/api',
    cors({
      origin: allowedOrigin || false,
      methods: ['POST'],
    })
  );

  app.use(
    session({
      name: 'signal_intake_sid',
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: require('mongoose').connection.getClient(),
        collectionName: 'sessions',
        ttl: 4 * 60 * 60, // 4 hours, matches cookie maxAge below
      }),
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 4 * 60 * 60 * 1000, // 4 hour idle expiry
      },
    })
  );

  app.use('/public', express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    res.type('text').send('Signal Intake backend is running.');
  });

  app.use('/api', submitRouter);
  app.use('/api', trackRouter);
  app.use('/admin', adminAuthRouter);
  app.use('/admin', adminRouter);

  app.use((req, res) => {
    res.status(404).type('text').send('Not found.');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

main().catch((err) => {
  console.error('[startup] fatal error:', err);
  process.exit(1);
});
