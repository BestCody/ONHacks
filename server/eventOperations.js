import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { parse as parseCsv } from 'csv-parse/sync';
import { createHash, randomBytes } from 'node:crypto';
import { EVENT_DETAILS } from '../src/eventDetails.js';
import { formatParticipantName } from '../src/participantName.js';

const organizerCookie = process.env.NODE_ENV === 'production'
  ? '__Host-onhacks_organizer' : 'onhacks_organizer';
const organizerSessionSeconds = 12 * 60 * 60;
const slotMinutes = EVENT_DETAILS.pitchMinutes + EVENT_DETAILS.changeoverMinutes;
const windowMinutes = EVENT_DETAILS.judgingWindowMinutes;
const defaultStart = EVENT_DETAILS.defaultJudgingStart;

export const eventOperationsSchema = `
  ALTER TABLE event_applications
    ADD COLUMN IF NOT EXISTS accepted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS printed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS meal_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS meal_qr_token TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS event_applications_meal_qr_token_idx
    ON event_applications(meal_qr_token) WHERE meal_qr_token IS NOT NULL;

  CREATE TABLE IF NOT EXISTS organizer_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE organizer_sessions ADD COLUMN IF NOT EXISTS password_fingerprint TEXT;
  CREATE INDEX IF NOT EXISTS organizer_sessions_expires_at_idx ON organizer_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS devpost_projects (
    id BIGSERIAL PRIMARY KEY,
    project_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    unmatched_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    room_number INTEGER,
    slot_index INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((room_number IS NULL) = (slot_index IS NULL))
  );
  CREATE TABLE IF NOT EXISTS devpost_project_members (
    project_id BIGINT NOT NULL REFERENCES devpost_projects(id) ON DELETE CASCADE,
    application_id BIGINT NOT NULL REFERENCES event_applications(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, application_id)
  );
  CREATE INDEX IF NOT EXISTS devpost_project_members_application_idx
    ON devpost_project_members(application_id);

  CREATE TABLE IF NOT EXISTS judging_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    room_count INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL
  );
`;

function validStart(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatTime(totalMinutes) {
  const day = Math.floor(totalMinutes / 1440);
  const time = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}${day ? ` (+${day} day)` : ''}`;
}

function startMinutes(start) {
  const [hour, minute] = start.split(':').map(Number);
  return hour * 60 + minute;
}

function projectRowsToPublic(rows, start) {
  const eligibleIds = new Set(eligibleProjects(rows).map((row) => String(row.id)));
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    url: row.project_url,
    memberCount: Number(row.member_count),
    unmatchedEmails: row.unmatched_emails,
    eligible: eligibleIds.has(String(row.id)),
    room: row.room_number,
    pitchTime: row.slot_index === null || !start
      ? null : formatTime(startMinutes(start) + Number(row.slot_index) * slotMinutes),
  }));
}

async function getProjects(db) {
  const result = await db.query(`
    SELECT p.id, p.title, p.project_url, p.unmatched_emails, p.room_number, p.slot_index,
           COUNT(m.application_id)::integer AS member_count,
           ARRAY_AGG(m.application_id) FILTER (WHERE m.application_id IS NOT NULL) AS member_ids
    FROM devpost_projects p
    LEFT JOIN devpost_project_members m ON m.project_id = p.id
    GROUP BY p.id
    ORDER BY p.id
  `);
  return result.rows;
}

function eligibleProjects(rows) {
  const memberUses = new Map();
  for (const row of rows) {
    for (const memberId of row.member_ids || []) {
      const id = String(memberId);
      memberUses.set(id, (memberUses.get(id) || 0) + 1);
    }
  }
  return rows.filter((row) =>
    Number(row.member_count) > 0
    && row.unmatched_emails.length === 0
    && (row.member_ids || []).every((id) => memberUses.get(String(id)) === 1));
}

function makePreview(projects, roomCount, start, excludedCount) {
  const first = startMinutes(start);
  const assignments = projects.map((project, index) => ({
    id: Number(project.id),
    title: project.title,
    room: (index % roomCount) + 1,
    slotIndex: Math.floor(index / roomCount),
    pitchTime: formatTime(first + Math.floor(index / roomCount) * slotMinutes),
  }));
  const slotsPerRoom = Math.ceil(projects.length / roomCount);
  const overtime = slotsPerRoom * slotMinutes > windowMinutes;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({
      projects: projects.map((project) => ({
        id: String(project.id),
        title: project.title,
        url: project.project_url,
        members: (project.member_ids || []).map(String).sort(),
      })),
      roomCount,
      start,
    }))
    .digest('hex');
  return {
    assignments,
    roomCount,
    startTime: start,
    endTime: formatTime(first + windowMinutes),
    projectedFinish: formatTime(first + slotsPerRoom * slotMinutes),
    capacity: roomCount * (windowMinutes / slotMinutes),
    minimumRooms: Math.ceil(projects.length / (windowMinutes / slotMinutes)),
    overtime,
    excludedCount,
    fingerprint,
  };
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDevpostCsv(csv) {
  const rows = parseCsv(csv, {
    columns: true, bom: true, skip_empty_lines: true,
  });
  if (!rows.length || rows.length > 1000) {
    throw new Error('The CSV must contain between 1 and 1,000 project rows.');
  }
  const headers = Object.keys(rows[0]);
  const urlHeader = headers.find((header) => /^(project|submission|devpost)(url|link)$/.test(normalizeHeader(header)))
    || headers.find((header) => normalizeHeader(header) === 'url');
  const titleHeader = headers.find((header) => /^(project|submission)(title|name)$/.test(normalizeHeader(header)))
    || headers.find((header) => normalizeHeader(header) === 'title');
  const statusHeader = headers.find((header) => normalizeHeader(header) === 'projectstatus');
  const emailHeaders = headers.filter((header) => normalizeHeader(header).includes('email'));
  if (!urlHeader || !titleHeader || !statusHeader || !emailHeaders.length) {
    throw new Error('Use a Devpost Projects data CSV with project URL, title, status, and team-member email columns.');
  }

  const projects = new Map();
  let draftsSkipped = 0;
  for (const [index, row] of rows.entries()) {
    const status = String(row[statusHeader] || '').trim().toLowerCase();
    if (status === 'draft') {
      draftsSkipped += 1;
      continue;
    }
    if (status !== 'submitted') {
      throw new Error(`Row ${index + 2} has an unknown project status. Import a Devpost Projects data CSV with submitted projects.`);
    }
    let url;
    try {
      url = new URL(String(row[urlHeader] || '').trim());
    } catch {
      throw new Error(`Row ${index + 2} has an invalid project URL.`);
    }
    if (url.protocol !== 'https:' || !/(^|\.)devpost\.com$/.test(url.hostname)) {
      throw new Error(`Row ${index + 2} needs an HTTPS Devpost project URL.`);
    }
    url.hash = '';
    url.search = '';
    const projectUrl = url.toString().replace(/\/$/, '');
    const title = String(row[titleHeader] || '').trim();
    if (!title || title.length > 200) {
      throw new Error(`Row ${index + 2} needs a project title under 200 characters.`);
    }
    const emails = emailHeaders.flatMap((header) =>
      String(row[header] || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []);
    const existing = projects.get(projectUrl) || { url: projectUrl, title, emails: new Set() };
    for (const email of emails) existing.emails.add(email);
    projects.set(projectUrl, existing);
  }
  if (!projects.size) throw new Error('The CSV has no submitted projects to import.');
  return { projects: [...projects.values()], draftsSkipped };
}

export function mountEventOperations(app, { pool, requireAuth, parseCookies, appendCookie, verifyPassword, hashSessionToken }) {
  const passwordFingerprint = createHash('sha256')
    .update(process.env.ORGANIZER_PASSWORD_HASH || '')
    .digest('hex');
  const organizerLoginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: 'Too many attempts. Try again later.' }),
  });

  async function requireOrganizer(request, response, next) {
    try {
      if (!pool || !process.env.ORGANIZER_PASSWORD_HASH) {
        return response.status(503).json({ error: 'Organizer access is not configured.' });
      }
      const token = parseCookies(request.headers.cookie)[organizerCookie];
      if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        return response.status(401).json({ error: 'Organizer sign-in required.' });
      }
      const result = await pool.query(
        `SELECT 1 FROM organizer_sessions
         WHERE token_hash = $1 AND password_fingerprint = $2 AND expires_at > NOW()`,
        [hashSessionToken(token), passwordFingerprint],
      );
      if (!result.rowCount) return response.status(401).json({ error: 'Organizer session expired.' });
      return next();
    } catch (error) {
      return next(error);
    }
  }

  app.get('/api/organizer/session', requireOrganizer, (_request, response) => response.json({ authenticated: true }));

  app.post('/api/organizer/signin', organizerLoginLimit, async (request, response, next) => {
    try {
      if (!pool || !process.env.ORGANIZER_PASSWORD_HASH) {
        return response.status(503).json({ error: 'Organizer access is not configured.' });
      }
      const password = request.body?.password;
      if (typeof password !== 'string' || password.length < 1 || password.length > 128
        || !(await verifyPassword(password, process.env.ORGANIZER_PASSWORD_HASH))) {
        return response.status(401).json({ error: 'Incorrect organizer password.' });
      }
      const token = randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO organizer_sessions (token_hash, password_fingerprint, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '12 hours')`,
        [hashSessionToken(token), passwordFingerprint],
      );
      appendCookie(response, organizerCookie, token, organizerSessionSeconds);
      return response.json({ authenticated: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/organizer/signout', async (request, response, next) => {
    try {
      const token = parseCookies(request.headers.cookie)[organizerCookie];
      if (pool && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
        await pool.query('DELETE FROM organizer_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
      }
      appendCookie(response, organizerCookie, '', 0);
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/participant/me', requireAuth, async (request, response, next) => {
    try {
      const applicationResult = await pool.query(
        `SELECT id, full_name, meal_count, meal_qr_token FROM event_applications
         WHERE accepted = TRUE AND (user_id = $1 OR (user_id IS NULL AND email = $2))
         ORDER BY created_at DESC LIMIT 1`,
        [request.user.id, request.user.email],
      );
      let application = applicationResult.rows[0];
      if (!application) return response.status(403).json({ error: 'Participant access is not available yet.' });
      if (!application.meal_qr_token) {
        const updated = await pool.query(
          `UPDATE event_applications SET meal_qr_token = COALESCE(meal_qr_token, $2)
           WHERE id = $1 RETURNING meal_qr_token`,
          [application.id, randomBytes(32).toString('hex')],
        );
        application = { ...application, meal_qr_token: updated.rows[0].meal_qr_token };
      }
      const project = await pool.query(
        `SELECT p.title, p.project_url, p.room_number, p.slot_index, j.start_time
         FROM devpost_project_members m
         JOIN devpost_projects p ON p.id = m.project_id
         LEFT JOIN judging_settings j ON j.id = 1
         WHERE m.application_id = $1
         ORDER BY p.room_number NULLS LAST, p.id LIMIT 1`,
        [application.id],
      );
      const assignment = project.rows[0];
      return response.json({
        participant: {
          name: formatParticipantName(application.full_name),
          mealCount: application.meal_count,
          qrValue: `onhacks:meal:${application.meal_qr_token}`,
          project: assignment ? {
            title: assignment.title,
            url: assignment.project_url,
            room: assignment.room_number,
            pitchTime: assignment.slot_index === null || !assignment.start_time ? null
              : formatTime(startMinutes(assignment.start_time) + assignment.slot_index * slotMinutes),
          } : null,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/organizer/meals/scan', requireOrganizer, async (request, response, next) => {
    const qrValue = request.body?.qrValue;
    const match = typeof qrValue === 'string' && /^onhacks:meal:([a-f0-9]{64})$/.exec(qrValue);
    if (!match) return response.status(400).json({ error: 'This is not an ONHacks meal QR code.' });
    try {
      const result = await pool.query(
        `UPDATE event_applications SET meal_count = meal_count + 1
         WHERE meal_qr_token = $1 AND accepted = TRUE
         RETURNING full_name, meal_count`,
        [match[1]],
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Participant QR code not found or not accepted.' });
      return response.json({
        name: formatParticipantName(result.rows[0].full_name),
        previousCount: result.rows[0].meal_count - 1,
        mealCount: result.rows[0].meal_count,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/organizer/overview', requireOrganizer, async (_request, response, next) => {
    try {
      const [counts, settings, rows] = await Promise.all([
        pool.query(`SELECT COUNT(*) FILTER (WHERE accepted)::integer AS accepted_count,
                           COUNT(*) FILTER (WHERE accepted AND NOT printed)::integer AS unprinted_count
                    FROM event_applications`),
        pool.query('SELECT room_count, start_time, assigned_at FROM judging_settings WHERE id = 1'),
        getProjects(pool),
      ]);
      return response.json({
        acceptedCount: counts.rows[0].accepted_count,
        unprintedCount: counts.rows[0].unprinted_count,
        settings: settings.rows[0] || null,
        projects: projectRowsToPublic(rows, settings.rows[0]?.start_time),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/organizer/projects/import', requireOrganizer,
    express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
    async (request, response, next) => {
      if (typeof request.body !== 'string') {
        return response.status(400).json({ error: 'Upload a CSV file.' });
      }
      let parsed;
      try {
        parsed = parseDevpostCsv(request.body);
      } catch (error) {
        return response.status(400).json({ error: error.message });
      }
      const { projects, draftsSkipped } = parsed;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(42732)');
        const locked = await client.query('SELECT 1 FROM judging_settings WHERE id = 1');
        if (locked.rowCount) {
          await client.query('ROLLBACK');
          return response.status(409).json({ error: 'Judging assignments are locked. Devpost imports can no longer change the roster.' });
        }
        const allEmails = [...new Set(projects.flatMap((project) => [...project.emails]))];
        const matches = await client.query(
          `SELECT id, lower(email) AS email FROM event_applications
           WHERE accepted = TRUE AND lower(email) = ANY($1::text[])`,
          [allEmails],
        );
        const applicationByEmail = new Map();
        for (const row of matches.rows) {
          if (applicationByEmail.has(row.email)) applicationByEmail.set(row.email, null);
          else applicationByEmail.set(row.email, row.id);
        }
        let unmatchedCount = 0;
        for (const project of projects) {
          const unmatched = [...project.emails].filter((email) => !applicationByEmail.get(email));
          if (!project.emails.size) unmatched.push('(no team-member emails)');
          unmatchedCount += unmatched.length;
          const saved = await client.query(
            `INSERT INTO devpost_projects (project_url, title, unmatched_emails)
             VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (project_url) DO UPDATE
               SET title = EXCLUDED.title, unmatched_emails = EXCLUDED.unmatched_emails,
                   imported_at = NOW()
             RETURNING id`,
            [project.url, project.title, JSON.stringify(unmatched)],
          );
          const id = saved.rows[0].id;
          await client.query('DELETE FROM devpost_project_members WHERE project_id = $1', [id]);
          const memberIds = [...new Set([...project.emails]
            .map((email) => applicationByEmail.get(email)).filter(Boolean))];
          for (const memberId of memberIds) {
            await client.query(
              'INSERT INTO devpost_project_members (project_id, application_id) VALUES ($1, $2)',
              [id, memberId],
            );
          }
        }
        await client.query(
          'DELETE FROM devpost_projects WHERE NOT (project_url = ANY($1::text[]))',
          [projects.map((project) => project.url)],
        );
        await client.query('COMMIT');
        return response.json({ imported: projects.length, unmatchedCount, draftsSkipped });
      } catch (error) {
        await client.query('ROLLBACK');
        return next(error);
      } finally {
        client.release();
      }
    });

  async function previewFor(db, rawRooms, rawStart) {
    const roomCount = Number(rawRooms);
    const start = rawStart || defaultStart;
    if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 100 || !validStart(start)) {
      return null;
    }
    const rows = await getProjects(db);
    const projects = eligibleProjects(rows).filter((row) => row.room_number === null);
    return makePreview(projects, roomCount, start, rows.length - projects.length);
  }

  app.get('/api/organizer/schedule-preview', requireOrganizer, async (request, response, next) => {
    try {
      const settings = await pool.query('SELECT 1 FROM judging_settings WHERE id = 1');
      if (settings.rowCount) return response.status(409).json({ error: 'Judging assignments are already locked.' });
      const preview = await previewFor(pool, request.query.rooms, request.query.start);
      if (!preview) return response.status(400).json({ error: 'Enter 1–100 rooms and a 24-hour start time.' });
      return response.json(preview);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/organizer/assign', requireOrganizer, async (request, response, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(42732)');
      const existing = await client.query('SELECT 1 FROM judging_settings WHERE id = 1');
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Projects have already been assigned. This action is one-time.' });
      }
      const preview = await previewFor(client, request.body?.rooms, request.body?.start);
      if (!preview) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: 'Enter 1–100 rooms and a 24-hour start time.' });
      }
      if (!preview.assignments.length) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: 'Import and match at least one project first.' });
      }
      if (preview.excludedCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Resolve every unmatched or duplicate team member before locking room assignments.' });
      }
      if (request.body?.fingerprint !== preview.fingerprint) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Projects changed since the preview. Review the schedule again.' });
      }
      if (preview.overtime && request.body?.allowOvertime !== true) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: `This schedule finishes at ${preview.projectedFinish}. Confirm overtime or add rooms.` });
      }
      await client.query(
        'INSERT INTO judging_settings (id, room_count, start_time, assigned_at) VALUES (1, $1, $2, NOW())',
        [preview.roomCount, preview.startTime],
      );
      for (const assignment of preview.assignments) {
        await client.query(
          'UPDATE devpost_projects SET room_number = $2, slot_index = $3 WHERE id = $1',
          [assignment.id, assignment.room, assignment.slotIndex],
        );
      }
      await client.query('COMMIT');
      return response.json({ assigned: preview.assignments.length, projectedFinish: preview.projectedFinish });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client.release();
    }
  });

}
