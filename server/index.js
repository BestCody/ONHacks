import 'dotenv/config';
import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pg from 'pg';
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const scrypt = (password, salt, keyLength, options) => new Promise((resolve, reject) => {
  scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(derivedKey);
  });
});

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 10000);
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDirectory, '..');
const distDirectory = path.join(projectRoot, 'dist');
const databaseUrl = process.env.DATABASE_URL;
const sessionCookieName = isProduction ? '__Host-onhacks_session' : 'onhacks_session';
const sessionDurationSeconds = 60 * 60 * 24 * 30;
const passwordHashOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: isProduction
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : null;

const rateLimitResponse = (message) => (_request, response) => {
  response.status(429).json({ error: message });
};

const normalizeEmailKey = (request) => {
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  return email || `ip:${ipKeyGenerator(request.ip)}`;
};

const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many requests. Please try again shortly.'),
});

const signInIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many sign-in attempts from this network. Please try again shortly.'),
});

const signInEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: normalizeEmailKey,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many failed sign-in attempts for this account. Please try again in a few minutes.'),
});

const signUpIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many account creation attempts from this network. Please try again shortly.'),
});

const signUpEmailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: normalizeEmailKey,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many account creation attempts for this email. Please try again later.'),
});

const applicationIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many application submissions from this network. Please try again shortly.'),
});

const applicationEmailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: normalizeEmailKey,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many application submissions for this email. Please try again later.'),
});

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const localDevelopmentOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]);

const allowedTracks = new Set([
  'AI / ML',
  'Web3 / Blockchain',
  'Developer Tools',
  'Security & Privacy',
]);

const applicationTable = `
  CREATE TABLE IF NOT EXISTS applications (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    team_name TEXT,
    track TEXT NOT NULL,
    project_idea TEXT NOT NULL,
    github_link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const authTables = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
`;

const eventApplicationTable = `
  CREATE TABLE IF NOT EXISTS event_applications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    team TEXT NOT NULL,
    github TEXT NOT NULL,
    high_school BOOLEAN NOT NULL,
    supplies BOOLEAN NOT NULL,
    heard_about TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS event_applications_user_id_idx ON event_applications(user_id);
  CREATE INDEX IF NOT EXISTS event_applications_email_idx ON event_applications(email);
`;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function publicUser(row) {
  return {
    id: Number(row.id),
    name: row.full_name,
    email: row.email,
    createdAt: row.created_at,
  };
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return cookies;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = '';
      }
    }
    return cookies;
  }, {});
}

function sessionTokenFromRequest(request) {
  return parseCookies(request.headers.cookie)[sessionCookieName] || '';
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(response, token) {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Priority=High',
    `Max-Age=${sessionDurationSeconds}`,
  ];

  if (isProduction) {
    attributes.push('Secure');
  }

  response.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(response) {
  const attributes = [
    `${sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Priority=High',
    'Max-Age=0',
  ];

  if (isProduction) {
    attributes.push('Secure');
  }

  response.setHeader('Set-Cookie', attributes.join('; '));
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64, passwordHashOptions);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, storedKeyHex] = String(storedHash || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !storedKeyHex) return false;

  let storedKey;
  try {
    storedKey = Buffer.from(storedKeyHex, 'hex');
  } catch {
    return false;
  }

  if (storedKey.length === 0) return false;

  const derivedKey = await scrypt(password, salt, storedKey.length, passwordHashOptions);
  return derivedKey.length === storedKey.length && timingSafeEqual(derivedKey, storedKey);
}

function validateAuthInput(body = {}, { requireName = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const name = clean(input.name);
  const email = clean(input.email).toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';
  const errors = {};

  if (requireName && (name.length < 2 || name.length > 120)) {
    errors.name = 'Enter your name (2 to 120 characters).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (password.length < 8 || password.length > 128) {
    errors.password = 'Use a password between 8 and 128 characters.';
  }

  return { name, email, password, errors };
}

async function findAuthenticatedUser(request) {
  if (!pool) return null;

  const token = sessionTokenFromRequest(request);
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.created_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)],
  );

  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

async function createSession(userId, response) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);

  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hashSessionToken(token), userId, expiresAt],
  );

  setSessionCookie(response, token);
}

async function requireAuth(request, response, next) {
  try {
    const user = await findAuthenticatedUser(request);
    if (!user) {
      return response.status(401).json({ error: 'Please sign in to continue.' });
    }

    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateApplication(body = {}) {
  const application = {
    fullName: clean(body.full_name),
    email: clean(body.email).toLowerCase(),
    teamName: clean(body.team_name),
    track: clean(body.track),
    projectIdea: clean(body.project_idea),
    githubLink: clean(body.github_link),
  };

  const errors = {};
  if (!application.fullName || application.fullName.length > 120) {
    errors.full_name = 'Enter a name up to 120 characters.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email) || application.email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (application.teamName.length > 120) {
    errors.team_name = 'Team name must be 120 characters or fewer.';
  }
  if (!allowedTracks.has(application.track)) {
    errors.track = 'Choose one of the available tracks.';
  }
  if (!application.projectIdea || application.projectIdea.length > 4000) {
    errors.project_idea = 'Enter a project idea up to 4,000 characters.';
  }
  if (application.githubLink.length > 500) {
    errors.github_link = 'Link must be 500 characters or fewer.';
  }

  return { application, errors };
}

function validateEventApplication(body = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const application = {
    fullName: clean(input.name),
    team: clean(input.team),
    github: clean(input.github),
    highSchool: input.highSchool === true || input.highSchool === 'YES',
    supplies: input.supplies === true || input.supplies === 'YES',
    heardAbout: clean(input.heardAbout),
    email: clean(input.email).toLowerCase(),
  };

  const errors = {};
  if (!application.fullName || application.fullName.length > 120) {
    errors.name = 'Enter a name up to 120 characters.';
  }
  if (!['Yes', 'No'].includes(application.team)) {
    errors.team = 'Choose whether you are with a team.';
  }
  if (!application.github || application.github.length > 500) {
    errors.github = 'Enter your GitHub username or profile link.';
  }
  if (!application.highSchool) {
    errors.highSchool = 'You must confirm that you are in high school.';
  }
  if (!application.supplies) {
    errors.supplies = 'You must confirm that you are bringing your supplies.';
  }
  if (!application.heardAbout || application.heardAbout.length > 500) {
    errors.heardAbout = 'Tell us how you heard about ONHacks.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email) || application.email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }

  return { application, errors };
}

app.set('trust proxy', isProduction ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      frameSrc: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: isProduction ? [] : null,
      workerSrc: ["'self'", 'blob:'],
    },
  },
  hsts: isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: false }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

function isTrustedOrigin(request) {
  const origin = request.get('origin');
  if (!origin) return true;

  if (!isProduction && localDevelopmentOrigins.has(origin)) {
    return true;
  }

  return origin === `${request.protocol}://${request.get('host')}`;
}

function sameOriginGuard(request, response, next) {
  if (!stateChangingMethods.has(request.method)) return next();

  const origin = request.get('origin');
  const fetchSite = request.get('sec-fetch-site');
  if ((origin && !isTrustedOrigin(request)) || (!origin && fetchSite === 'cross-site')) {
    return response.status(403).json({ error: 'Request origin is not allowed.' });
  }

  return next();
}

function noStoreApiResponse(_request, response, next) {
  response.setHeader('Cache-Control', 'no-store');
  return next();
}

app.use('/api', apiRateLimit);
app.use('/api', noStoreApiResponse);
app.use('/api', sameOriginGuard);
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', async (_request, response) => {
  if (!pool) {
    return response.status(503).json({ status: 'error', database: 'not configured' });
  }

  try {
    await pool.query('SELECT 1');
    return response.json({ status: 'ok', database: 'connected' });
  } catch {
    return response.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/api/auth/me', async (request, response, next) => {
  try {
    return response.json({ user: await findAuthenticatedUser(request) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/signup', signUpIpRateLimit, signUpEmailRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({
      error: 'Account creation is temporarily unavailable. Please try again later.',
    });
  }

  const { name, email, password, errors } = validateAuthInput(request.body, {
    requireName: true,
  });
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: 'Please correct the highlighted fields.', errors });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [name, email, passwordHash],
    );

    await createSession(result.rows[0].id, response);
    return response.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return response.status(409).json({
        error: 'An account with that email already exists. Try signing in instead.',
      });
    }
    return next(error);
  }
});

app.post('/api/auth/signin', signInIpRateLimit, signInEmailRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({
      error: 'Sign in is temporarily unavailable. Please try again later.',
    });
  }

  const { email, password, errors } = validateAuthInput(request.body);
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: 'Please enter a valid email and password.', errors });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userRecord = result.rows[0];

    if (!userRecord || !(await verifyPassword(password, userRecord.password_hash))) {
      return response.status(401).json({ error: 'Email or password is incorrect.' });
    }

    await createSession(userRecord.id, response);
    return response.json({ user: publicUser(userRecord) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/signout', async (request, response, next) => {
  try {
    const token = sessionTokenFromRequest(request);
    if (pool && token) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    }

    clearSessionCookie(response);
    return response.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/event-applications/me', requireAuth, async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, team, github, status, created_at
       FROM event_applications
       WHERE user_id = $1 OR (user_id IS NULL AND email = $2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [request.user.id, request.user.email],
    );

    return response.json({ application: result.rows[0] || null });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/event-applications', applicationIpRateLimit, applicationEmailRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({
      error: 'Applications are temporarily unavailable. Please try again later.',
    });
  }

  const { application, errors } = validateEventApplication(request.body);
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: 'Please correct the highlighted fields.', errors });
  }

  try {
    const user = await findAuthenticatedUser(request);
    const result = await pool.query(
      `INSERT INTO event_applications
        (user_id, full_name, team, github, high_school, supplies, heard_about, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, full_name, team, github, status, created_at`,
      [
        user?.id || null,
        application.fullName,
        application.team,
        application.github,
        application.highSchool,
        application.supplies,
        application.heardAbout,
        application.email,
      ],
    );

    return response.status(201).json({ application: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/applications', applicationIpRateLimit, applicationEmailRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({
      error: 'Registration is temporarily unavailable. Please try again later.',
    });
  }

  const { application, errors } = validateApplication(request.body);
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: 'Please correct the highlighted fields.', errors });
  }

  try {
    const result = await pool.query(
      `INSERT INTO applications
        (full_name, email, team_name, track, project_idea, github_link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        application.fullName,
        application.email,
        application.teamName || null,
        application.track,
        application.projectIdea,
        application.githubLink || null,
      ],
    );

    return response.status(201).json({ application: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(distDirectory));

// React Router owns client-side routes. Render must receive index.html for them.
app.use((request, response, next) => {
  if (request.method !== 'GET' || request.path.startsWith('/api/')) {
    return next();
  }

  return response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((request, response) => {
  if (request.path.startsWith('/api/')) {
    return response.status(404).json({ error: 'API route not found.' });
  }
  return response.status(404).send('Not found');
});

app.use((error, _request, response, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  console.error(error);
  return response.status(500).json({ error: 'Something went wrong.' });
});

async function start() {
  if (isProduction && !pool) {
    throw new Error('DATABASE_URL must be configured in production.');
  }

  if (pool) {
    await pool.query(authTables);
    await pool.query(eventApplicationTable);
    await pool.query(applicationTable);
    await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
  } else {
    console.warn('DATABASE_URL is not set; registration writes are disabled.');
  }

  const server = app.listen(port, () => {
    console.log(`ONHacks listening on port ${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool?.end();
      process.exit(0);
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch((error) => {
  console.error('Unable to start server:', error);
  process.exit(1);
});