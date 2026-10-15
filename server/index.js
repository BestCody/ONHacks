import 'dotenv/config';
import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
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
const googleStateCookieName = isProduction ? '__Host-onhacks_google_state' : 'onhacks_google_state';
const googleReturnCookieName = isProduction ? '__Host-onhacks_google_return' : 'onhacks_google_return';
const sessionDurationSeconds = 60 * 60 * 24 * 30;
const googleStateDurationSeconds = 10 * 60;
const verificationDurationSeconds = 60 * 60 * 24;
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
const googleOAuthRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || '';
const googleOAuthOrigin = googleOAuthRedirectUri ? new URL(googleOAuthRedirectUri).origin : '';
const siteOrigin = process.env.SITE_ORIGIN?.trim() || googleOAuthOrigin;
const googleOAuthClient = googleClientId && googleClientSecret && googleOAuthRedirectUri
  ? new OAuth2Client({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectUri: googleOAuthRedirectUri,
    })
  : null;
const resendApiKey = process.env.RESEND_API_KEY?.trim() || '';
const emailFrom = process.env.EMAIL_FROM?.trim() || '';
const emailEnabled = Boolean(resendApiKey && emailFrom);
const passwordHashOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
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
  keyGenerator: (request) => request.user.email,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many application submissions for this email. Please try again later.'),
});

const verificationIpRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse('Too many verification requests. Please try again later.'),
});

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const localDevelopmentOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]);

const authTables = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_subject TEXT,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx
    ON email_verification_tokens(user_id);
`;

const authMigration = `
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
  CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_idx
    ON users(google_subject)
    WHERE google_subject IS NOT NULL;
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
    heard_about TEXT,
    email TEXT NOT NULL,
    privacy_notice_accepted_at TIMESTAMPTZ,
    participant_terms_accepted_at TIMESTAMPTZ,
    code_of_conduct_accepted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS event_applications_user_id_idx ON event_applications(user_id);
  CREATE INDEX IF NOT EXISTS event_applications_email_idx ON event_applications(email);
`;

const eventApplicationConsentMigration = `
  ALTER TABLE event_applications
    ADD COLUMN IF NOT EXISTS privacy_notice_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS participant_terms_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS code_of_conduct_accepted_at TIMESTAMPTZ;
`;

const eventApplicationHeardAboutMigration = `
  ALTER TABLE event_applications ALTER COLUMN heard_about DROP NOT NULL;
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

function appendCookie(response, name, value, maxAge) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Priority=High',
    `Max-Age=${maxAge}`,
  ];

  if (isProduction) {
    attributes.push('Secure');
  }

  response.append('Set-Cookie', attributes.join('; '));
}

function setSessionCookie(response, token) {
  appendCookie(response, sessionCookieName, token, sessionDurationSeconds);
}

function clearSessionCookie(response) {
  appendCookie(response, sessionCookieName, '', 0);
}

function setGoogleStateCookies(response, state, returnTo) {
  appendCookie(response, googleStateCookieName, state, googleStateDurationSeconds);
  appendCookie(response, googleReturnCookieName, returnTo, googleStateDurationSeconds);
}

function clearGoogleStateCookies(response) {
  appendCookie(response, googleStateCookieName, '', 0);
  appendCookie(response, googleReturnCookieName, '', 0);
}

function statesMatch(expectedState, receivedState) {
  if (!expectedState || !receivedState) return false;

  const expected = Buffer.from(expectedState);
  const received = Buffer.from(receivedState);
  return expected.length === received.length && timingSafeEqual(expected, received);
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

function safeReturnTo(value) {
  const candidate = clean(value);
  if (/^\/(?![\/\\])[^\\\u0000-\u001f]*$/.test(candidate)) {
    return new URL(candidate, 'http://localhost').pathname;
  }
  return '/dashboard';
}

async function findOrCreateGoogleUser(profile) {
  const bySubject = await pool.query(
    `SELECT id, full_name, email, created_at
     FROM users
     WHERE google_subject = $1 AND email_verified_at IS NOT NULL`,
    [profile.googleSubject],
  );

  if (bySubject.rows[0]) return bySubject.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, google_subject, email_verified_at)
       VALUES ($1, $2, NULL, $3, NOW())
       ON CONFLICT (email) DO UPDATE
         SET full_name = CASE
               WHEN users.email_verified_at IS NULL THEN EXCLUDED.full_name
               ELSE users.full_name
             END,
             google_subject = EXCLUDED.google_subject,
             email_verified_at = NOW(),
             password_hash = CASE
               WHEN users.email_verified_at IS NULL THEN NULL
               ELSE users.password_hash
             END
         WHERE users.google_subject IS NULL
            OR users.google_subject = EXCLUDED.google_subject
       RETURNING id, full_name, email, created_at`,
      [profile.name, profile.email, profile.googleSubject],
    );

    if (!result.rows[0]) {
      throw new Error('This email is already linked to another Google account.');
    }

    // A verified Google identity may reclaim an unverified email, but no prior
    // password or session can remain valid after that account is linked.
    await client.query('DELETE FROM sessions WHERE user_id = $1', [result.rows[0].id]);
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [result.rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getGoogleProfile(code) {
  const { tokens } = await googleOAuthClient.getToken(code);
  if (!tokens.id_token) {
    throw new Error('Google did not return an ID token.');
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: googleClientId,
  });
  const payload = ticket.getPayload();
  const email = clean(payload?.email).toLowerCase();

  if (!payload?.sub || !email || payload.email_verified !== true) {
    throw new Error('Google account email could not be verified.');
  }

  return {
    googleSubject: payload.sub,
    email,
    name: clean(payload.name) || email.split('@')[0],
  };
}

async function findAuthenticatedUser(request) {
  if (!pool) return null;

  const token = sessionTokenFromRequest(request);
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.created_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
       AND u.email_verified_at IS NOT NULL`,
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

async function sendVerificationEmail(user) {
  if (!emailEnabled || !siteOrigin) {
    throw new Error('Email verification is not configured.');
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + verificationDurationSeconds * 1000);
  await pool.query(
    `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           created_at = NOW()`,
    [tokenHash, user.id, expiresAt],
  );

  const verificationUrl = new URL('/verify-email', siteOrigin);
  verificationUrl.hash = new URLSearchParams({ token }).toString();
  const safeName = user.full_name.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: user.email,
        subject: 'Verify your ONHacks email',
        text: [
          `Hi ${user.full_name},`,
          '',
          'Confirm your email to finish creating your ONHacks account. Open the link below and enter the password you chose:',
          verificationUrl.toString(),
          '',
          'This link expires in 24 hours. If you did not create this account, you can ignore this message.',
          '',
          'The ONHacks team',
        ].join('\n'),
        html: `<p>Hi ${safeName},</p><p>Confirm your email to finish creating your ONHacks account. Open the link below and enter the password you chose:</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this message.</p><p>The ONHacks team</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Verification email API returned HTTP ${response.status}.`);
    }
  } catch (error) {
    await pool.query('DELETE FROM email_verification_tokens WHERE token_hash = $1', [tokenHash]);
    throw error;
  }
}

async function sendVerificationEmailIfNeeded(user) {
  const recent = await pool.query(
    `SELECT 1 FROM email_verification_tokens
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'
       AND expires_at > NOW()`,
    [user.id],
  );
  if (recent.rows[0]) return;
  await sendVerificationEmail(user);
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

function validateEventApplication(body = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const application = {
    fullName: clean(input.name),
    team: clean(input.team),
    github: clean(input.github),
    highSchool: input.highSchool === true || input.highSchool === 'YES',
    supplies: input.supplies === true || input.supplies === 'YES',
    heardAbout: clean(input.heardAbout) || null,
    email: clean(input.email).toLowerCase(),
    privacyNoticeAccepted: input.privacyNoticeAccepted === true,
    participantTermsAccepted: input.participantTermsAccepted === true,
    codeOfConductAccepted: input.codeOfConductAccepted === true,
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
  if (application.heardAbout && application.heardAbout.length > 500) {
    errors.heardAbout = 'Keep your answer to 500 characters or fewer.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email) || application.email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (!application.privacyNoticeAccepted) {
    errors.privacyNoticeAccepted = 'Review and accept the Privacy Notice.';
  }
  if (!application.participantTermsAccepted) {
    errors.participantTermsAccepted = 'Review and accept the Participant Terms.';
  }
  if (!application.codeOfConductAccepted) {
    errors.codeOfConductAccepted = 'Review and accept the Code of Conduct.';
  }

  return { application, errors };
}

async function sendApplicationReceipt(application) {
  if (!emailEnabled) return;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: application.email,
        subject: 'ONHacks application received',
        text: [
          `Hi ${application.fullName},`,
          '',
          'We received your ONHacks application. The organizers will review it and contact you with next steps.',
          '',
          'This email confirms receipt only and does not guarantee acceptance.',
          '',
          '— The ONHacks team',
        ].join('\n'),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Email API returned HTTP ${response.status}.`);
    }
  } catch (error) {
    console.error('Application receipt delivery failed:', error);
  }
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
    return response.json({
      user: await findAuthenticatedUser(request),
      providers: { google: Boolean(googleOAuthClient && pool) },
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/google/start', (request, response) => {
  if (!googleOAuthClient || !pool) {
    return response.redirect('/signin?error=google_unavailable');
  }

  const returnTo = safeReturnTo(request.query.returnTo);
  if (`${request.protocol}://${request.get('host')}` !== googleOAuthOrigin) {
    const canonicalUrl = new URL('/api/auth/google/start', googleOAuthOrigin);
    if (returnTo !== '/dashboard') canonicalUrl.searchParams.set('returnTo', returnTo);
    return response.redirect(canonicalUrl.toString());
  }

  const state = randomBytes(32).toString('hex');
  setGoogleStateCookies(response, state, returnTo);

  const authorizeUrl = googleOAuthClient.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });

  return response.redirect(authorizeUrl);
});

app.get('/api/auth/google/callback', async (request, response) => {
  const cookies = parseCookies(request.headers.cookie);
  const returnTo = safeReturnTo(cookies[googleReturnCookieName]);
  const expectedState = cookies[googleStateCookieName];
  clearGoogleStateCookies(response);

  if (
    !googleOAuthClient
    || request.query.error
    || typeof request.query.state !== 'string'
    || !statesMatch(expectedState, request.query.state)
  ) {
    return response.redirect('/signin?error=google_auth_failed');
  }

  if (typeof request.query.code !== 'string' || !request.query.code) {
    return response.redirect('/signin?error=google_auth_failed');
  }

  try {
    const profile = await getGoogleProfile(request.query.code);
    const userRecord = await findOrCreateGoogleUser(profile);
    await createSession(userRecord.id, response);
    return response.redirect(returnTo);
  } catch (error) {
    console.error('Google authentication failed:', error);
    return response.redirect('/signin?error=google_auth_failed');
  }
});

app.post('/api/auth/signup', signUpIpRateLimit, signUpEmailRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({
      error: 'Account creation is temporarily unavailable. Please try again later.',
    });
  }

  if (!emailEnabled || !siteOrigin) {
    return response.status(503).json({ error: 'Account verification is temporarily unavailable. Please try again later.' });
  }

  const { name, email, password, errors } = validateAuthInput(request.body, {
    requireName: true,
  });
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: 'Please correct the highlighted fields.', errors });
  }

  let userRecord;
  const client = await pool.connect();
  try {
    const passwordHash = await hashPassword(password);
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             password_hash = EXCLUDED.password_hash
         WHERE users.email_verified_at IS NULL AND users.google_subject IS NULL
       RETURNING id, full_name, email, created_at`,
      [name, email, passwordHash],
    );
    userRecord = result.rows[0];
    if (!userRecord) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error: 'An account with that email already exists. Try signing in instead.' });
    }
    // A fresh attempt may reclaim an unverified address, but old links and
    // sessions must not gain access once the new owner verifies it.
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userRecord.id]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userRecord.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }

  try {
    await sendVerificationEmail(userRecord);
    return response.status(202).json({ verificationRequired: true, email });
  } catch (error) {
    console.error('Verification email delivery failed:', error);
    return response.status(503).json({ error: 'Your account was created, but we could not send the verification email. Sign in to try again.' });
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
      `SELECT id, full_name, email, password_hash, email_verified_at, created_at
       FROM users
       WHERE email = $1`,
      [email],
    );
    const userRecord = result.rows[0];

    if (!userRecord || !(await verifyPassword(password, userRecord.password_hash))) {
      return response.status(401).json({ error: 'Email or password is incorrect.' });
    }

    if (!userRecord.email_verified_at) {
      try {
        await sendVerificationEmailIfNeeded(userRecord);
      } catch (error) {
        console.error('Verification email delivery failed:', error);
        return response.status(503).json({ error: 'We could not send your verification email right now. Please try again later.' });
      }
      return response.status(403).json({
        error: 'Please verify your email before signing in. Check your inbox for the verification link.',
        code: 'email_verification_required',
      });
    }

    await createSession(userRecord.id, response);
    return response.json({ user: publicUser(userRecord) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/verify-email', verificationIpRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({ error: 'Verification is temporarily unavailable.' });
  }

  const token = clean(request.body?.token);
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!/^[a-f0-9]{64}$/.test(token) || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Invalid or expired verification link or password.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.created_at
       FROM email_verification_tokens t
       INNER JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.expires_at > NOW()
         AND u.email_verified_at IS NULL
       FOR UPDATE OF t, u`,
      [hashSessionToken(token)],
    );
    const userRecord = result.rows[0];
    if (!userRecord || !(await verifyPassword(password, userRecord.password_hash))) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error: 'Invalid or expired verification link or password.' });
    }

    await client.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [userRecord.id]);
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userRecord.id]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userRecord.id]);
    await client.query('COMMIT');
    await createSession(userRecord.id, response);
    return response.json({ user: publicUser(userRecord) });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
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

app.post('/api/event-applications', requireAuth, applicationIpRateLimit, applicationEmailRateLimit, async (request, response, next) => {
  if (!pool) {
    return response.status(503).json({
      error: 'Applications are temporarily unavailable. Please try again later.',
    });
  }

  const { application, errors } = validateEventApplication({
    ...request.body,
    email: request.user.email,
  });
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: 'Please correct the highlighted fields.', errors });
  }

  let client;
  let savedApplication;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Lock the account so concurrent submissions from separate tabs or servers
    // cannot both pass the existing-application check.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [request.user.id]);
    const existing = await client.query(
      `SELECT id FROM event_applications
       WHERE user_id = $1 OR (user_id IS NULL AND email = $2)
       LIMIT 1`,
      [request.user.id, request.user.email],
    );
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error: 'You have already submitted an application.' });
    }

    const result = await client.query(
      `INSERT INTO event_applications
        (user_id, full_name, team, github, high_school, supplies, heard_about, email,
         privacy_notice_accepted_at, participant_terms_accepted_at, code_of_conduct_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
       RETURNING id, full_name, team, github, status, created_at`,
      [
        request.user.id,
        application.fullName,
        application.team,
        application.github,
        application.highSchool,
        application.supplies,
        application.heardAbout,
        application.email,
      ],
    );
    savedApplication = result.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally {
    client?.release();
  }

  await sendApplicationReceipt(application);
  return response.status(201).json({ application: savedApplication });
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
  if (isProduction && siteOrigin && new URL(siteOrigin).protocol !== 'https:') {
    throw new Error('SITE_ORIGIN must use HTTPS in production.');
  }

  if (pool) {
    await pool.query(authTables);
    await pool.query(authMigration);
    await pool.query(`DELETE FROM sessions WHERE user_id IN (
      SELECT id FROM users WHERE google_subject IS NOT NULL AND email_verified_at IS NULL
    )`);
    await pool.query(`UPDATE users
      SET password_hash = NULL, email_verified_at = NOW()
      WHERE google_subject IS NOT NULL AND email_verified_at IS NULL`);
    await pool.query(eventApplicationTable);
    await pool.query(eventApplicationConsentMigration);
    await pool.query(eventApplicationHeardAboutMigration);
    await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
    await pool.query('DELETE FROM email_verification_tokens WHERE expires_at <= NOW()');
  } else {
    console.warn('DATABASE_URL is not set; registration writes are disabled.');
  }

  if (!googleOAuthClient) {
    console.warn('Google OAuth is not configured; Google sign-in is disabled.');
  }

  if (!emailEnabled) {
    console.warn('Resend email is not configured; email/password signup and application receipts are disabled.');
  } else if (!siteOrigin) {
    console.warn('SITE_ORIGIN is not configured; email/password signup is disabled.');
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
