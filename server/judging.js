import { createHash, randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { clientIpKey } from './clientIp.js';
import { pitchTimeFor } from './eventOperations.js';

const judgeCookie = process.env.NODE_ENV === 'production' ? '__Host-onhacks_judge' : 'onhacks_judge';
const judgeSessionSeconds = 16 * 60 * 60;
const maxCommentLength = 2000;

// Judges share one password and identify themselves by name, so each judge keeps one rating
// and comment per project. Ratings are keyed by the project's Devpost URL, which stays the
// same when organizers re-import the CSV.
export const judgingSchema = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS judge_sessions (
    token_hash TEXT PRIMARY KEY,
    judge_name TEXT NOT NULL,
    password_fingerprint TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS judge_sessions_expires_at_idx ON judge_sessions(expires_at);
  CREATE TABLE IF NOT EXISTS judge_scores (
    project_url TEXT NOT NULL,
    judge_key TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    score SMALLINT CHECK (score BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_url, judge_key)
  );
`;

function judgeName(value) {
  const name = typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  return name.length >= 2 && name.length <= 60 && !/[\u0000-\u001f]/.test(name) ? name : null;
}

const judgeKey = (name) => name.toLocaleLowerCase('en-CA');

function publicDetails(details) {
  const value = details && typeof details === 'object' ? details : {};
  return {
    about: value.about || '',
    builtWith: Array.isArray(value.builtWith) ? value.builtWith : [],
    video: value.video || null,
    links: Array.isArray(value.links) ? value.links : [],
    prizes: Array.isArray(value.prizes) ? value.prizes : [],
    members: Array.isArray(value.members) ? value.members : [],
  };
}

export function mountJudging(app, {
  pool, parseCookies, appendCookie, verifyPassword, hashSessionToken, requireOrganizer,
}) {
  // The judge password lives only as a scrypt hash in the database (set with
  // `npm run judges:set-password`), never in the public repository. Changing it signs
  // every judge out, because sessions remember which hash they were created under.
  let cachedHash = { value: '', readAt: 0 };
  async function judgePassword() {
    if (!cachedHash.value || Date.now() - cachedHash.readAt > 30_000) {
      const result = await pool.query("SELECT value FROM app_settings WHERE key = 'judge_password_hash'");
      cachedHash = { value: result.rows[0]?.value || '', readAt: Date.now() };
    }
    const hash = cachedHash.value;
    return hash ? { hash, fingerprint: createHash('sha256').update(hash).digest('hex') } : null;
  }
  const judgeLoginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: clientIpKey,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' }),
  });

  async function requireJudge(request, response, next) {
    try {
      const password = pool && await judgePassword();
      if (!password) return response.status(503).json({ error: 'Judging is not set up yet.' });
      const token = parseCookies(request.headers.cookie)[judgeCookie];
      if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        return response.status(401).json({ error: 'Sign in to judge.' });
      }
      const result = await pool.query(
        `SELECT judge_name FROM judge_sessions
         WHERE token_hash = $1 AND password_fingerprint = $2 AND expires_at > NOW()`,
        [hashSessionToken(token), password.fingerprint],
      );
      if (!result.rowCount) return response.status(401).json({ error: 'Your session ended. Sign in again.' });
      request.judge = { name: result.rows[0].judge_name, key: judgeKey(result.rows[0].judge_name) };
      return next();
    } catch (error) {
      return next(error);
    }
  }

  app.post('/api/judges/signin', judgeLoginLimit, async (request, response, next) => {
    try {
      const stored = pool && await judgePassword();
      if (!stored) return response.status(503).json({ error: 'Judging is not set up yet.' });
      const name = judgeName(request.body?.name);
      if (!name) return response.status(400).json({ error: 'Enter your full name (2 to 60 characters).' });
      const password = request.body?.password;
      if (typeof password !== 'string' || password.length < 1 || password.length > 128
        || !(await verifyPassword(password, stored.hash))) {
        return response.status(401).json({ error: 'Incorrect judge password.' });
      }
      const token = randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO judge_sessions (token_hash, judge_name, password_fingerprint, expires_at)
         VALUES ($1, $2, $3, NOW() + $4 * INTERVAL '1 second')`,
        [hashSessionToken(token), name, stored.fingerprint, judgeSessionSeconds],
      );
      appendCookie(response, judgeCookie, token, judgeSessionSeconds);
      return response.json({ name });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/judges/signout', async (request, response, next) => {
    try {
      const token = parseCookies(request.headers.cookie)[judgeCookie];
      if (pool && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
        await pool.query('DELETE FROM judge_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
      }
      appendCookie(response, judgeCookie, '', 0);
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/judges/session', requireJudge, (request, response) => response.json({ name: request.judge.name }));

  // Every project imported from the Devpost CSV, with this judge's own rating and comment.
  app.get('/api/judges/projects', requireJudge, async (request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT p.id, p.title, p.project_url, p.details, p.room_number, p.slot_index, j.start_time,
                s.score, s.comment, s.updated_at
         FROM devpost_projects p
         LEFT JOIN judging_settings j ON j.id = 1
         LEFT JOIN judge_scores s ON s.project_url = p.project_url AND s.judge_key = $1
         ORDER BY p.room_number NULLS LAST, p.slot_index NULLS LAST, lower(p.title), p.id`,
        [request.judge.key],
      );
      return response.json({
        judge: request.judge.name,
        projects: result.rows.map((row) => ({
          id: Number(row.id),
          title: row.title,
          url: row.project_url,
          room: row.room_number,
          pitchTime: pitchTimeFor(row.start_time, row.slot_index),
          ...publicDetails(row.details),
          review: { score: row.score, comment: row.comment || '', updatedAt: row.updated_at },
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/judges/projects/:projectId/review', requireJudge, async (request, response, next) => {
    const projectId = Number(request.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return response.status(404).json({ error: 'Project not found.' });
    }
    const rawScore = request.body?.score;
    const score = rawScore === null || rawScore === undefined ? null : Number(rawScore);
    if (score !== null && !(Number.isInteger(score) && score >= 1 && score <= 5)) {
      return response.status(400).json({ error: 'Choose a rating from 1 to 5.' });
    }
    const comment = typeof request.body?.comment === 'string' ? request.body.comment.trim() : '';
    if (comment.length > maxCommentLength) {
      return response.status(400).json({ error: `Keep comments to ${maxCommentLength} characters.` });
    }
    try {
      const project = await pool.query('SELECT project_url FROM devpost_projects WHERE id = $1', [projectId]);
      if (!project.rowCount) return response.status(404).json({ error: 'Project not found. Refresh the list.' });
      const projectUrl = project.rows[0].project_url;
      if (score === null && !comment) {
        await pool.query('DELETE FROM judge_scores WHERE project_url = $1 AND judge_key = $2', [projectUrl, request.judge.key]);
        return response.json({ review: { score: null, comment: '', updatedAt: null } });
      }
      const saved = await pool.query(
        `INSERT INTO judge_scores (project_url, judge_key, judge_name, score, comment, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (project_url, judge_key) DO UPDATE
           SET judge_name = EXCLUDED.judge_name, score = EXCLUDED.score,
               comment = EXCLUDED.comment, updated_at = NOW()
         RETURNING score, comment, updated_at`,
        [projectUrl, request.judge.key, request.judge.name, score, comment],
      );
      const row = saved.rows[0];
      return response.json({ review: { score: row.score, comment: row.comment, updatedAt: row.updated_at } });
    } catch (error) {
      return next(error);
    }
  });

  // Organizers see every judge's rating and comment, ranked by average rating.
  app.get('/api/organizer/judging-results', requireOrganizer, async (_request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT p.id, p.title, p.project_url, p.room_number, p.slot_index, j.start_time,
               AVG(s.score)::float AS average,
               COUNT(s.score)::integer AS rating_count,
               COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
                 'judge', s.judge_name, 'score', s.score, 'comment', s.comment
               ) ORDER BY lower(s.judge_name)) FILTER (WHERE s.judge_key IS NOT NULL), '[]'::json) AS reviews
        FROM devpost_projects p
        LEFT JOIN judging_settings j ON j.id = 1
        LEFT JOIN judge_scores s ON s.project_url = p.project_url
        GROUP BY p.id, j.start_time
        ORDER BY average DESC NULLS LAST, rating_count DESC, lower(p.title), p.id
      `);
      return response.json({
        results: result.rows.map((row) => ({
          id: Number(row.id),
          title: row.title,
          url: row.project_url,
          room: row.room_number,
          pitchTime: pitchTimeFor(row.start_time, row.slot_index),
          average: row.average === null ? null : Math.round(row.average * 100) / 100,
          ratingCount: row.rating_count,
          reviews: row.reviews,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });
}
