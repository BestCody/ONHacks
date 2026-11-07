import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { parse as parseCsv } from 'csv-parse/sync';
import { createHash, randomBytes } from 'node:crypto';
import { EVENT_DETAILS } from '../src/eventDetails.js';
import { clientIpKey } from './clientIp.js';
import { formatParticipantName } from '../src/participantName.js';

const organizerCookie = process.env.NODE_ENV === 'production'
  ? '__Host-onhacks_organizer' : 'onhacks_organizer';
// Long enough for a 7 AM setup sign-in to last past closing without signing in again mid-judging.
const organizerSessionSeconds = 16 * 60 * 60;
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

  ALTER TABLE event_applications
    ADD COLUMN IF NOT EXISTS waiver_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rsvp_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acceptance_email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_meal_scan_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS waiver_files (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES event_applications(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS waiver_files_application_idx ON waiver_files(application_id);
`;

// Signed waivers hold minors' dates of birth, emergency contacts, and medical notes,
// so only PDFs and the two image formats browsers re-encode to are accepted, checked by
// their leading bytes rather than the declared type alone.
const waiverSignatures = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};
const waiverExtensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const waiverMaxTotalBytes = EVENT_DETAILS.waiverMaxFiles * EVENT_DETAILS.waiverMaxFileBytes;

function hasWaiverSignature(buffer, contentType) {
  const signature = waiverSignatures[contentType];
  return Boolean(signature) && Buffer.isBuffer(buffer) && buffer.length > signature.length
    && signature.every((byte, index) => buffer[index] === byte);
}

function waiverFileName(rawHeader, contentType) {
  let name = '';
  try {
    name = decodeURIComponent(String(rawHeader || ''));
  } catch {
    name = '';
  }
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return name || `waiver.${waiverExtensions[contentType]}`;
}

function rsvpClosed() {
  return Date.now() > Date.parse(EVENT_DETAILS.rsvpDeadline);
}

export async function purgeExpiredWaivers(db) {
  const result = await db.query(
    `DELETE FROM waiver_files WHERE uploaded_at < NOW() - make_interval(days => $1)`,
    [EVENT_DETAILS.waiverRetentionDays],
  );
  return result.rowCount;
}

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

function makePreview(projects, roomCount, start, unmatchedCount) {
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
    unmatchedCount,
    fingerprint,
  };
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDevpostCsv(csv) {
  // Devpost's header ends with a "..." column and the second and later team members' name and
  // email cells are written past it, so rows can be longer than the header. Read rows as arrays.
  const [headerRow = [], ...rows] = parseCsv(csv, {
    bom: true, skip_empty_lines: true, relax_column_count: true,
  });
  if (!rows.length || rows.length > 1000) {
    throw new Error('The CSV must contain between 1 and 1,000 project rows.');
  }
  const headers = headerRow.map((header) => normalizeHeader(String(header)));
  const column = (...tests) => {
    for (const test of tests) {
      const index = headers.findIndex(test);
      if (index >= 0) return index;
    }
    return -1;
  };
  const urlColumn = column((header) => /^(project|submission|devpost)(url|link)$/.test(header), (header) => header === 'url');
  const titleColumn = column((header) => /^(project|submission)(title|name)$/.test(header), (header) => header === 'title');
  const statusColumn = column((header) => header === 'projectstatus');
  const emailColumns = headers.flatMap((header, index) => (header.includes('email') ? [index] : []));
  const overflowStart = headers.at(-1) === '' ? headers.length - 1 : headers.length;
  if (urlColumn < 0 || titleColumn < 0 || statusColumn < 0 || !emailColumns.length) {
    throw new Error('Use a Devpost Projects data CSV with project URL, title, status, and team-member email columns.');
  }

  const projects = new Map();
  let draftsSkipped = 0;
  for (const [index, row] of rows.entries()) {
    const cell = (position) => String(row[position] ?? '');
    const status = cell(statusColumn).trim().toLowerCase();
    if (status === 'draft') {
      draftsSkipped += 1;
      continue;
    }
    if (status !== 'submitted') {
      throw new Error(`Row ${index + 2} has an unknown project status. Import a Devpost Projects data CSV with submitted projects.`);
    }
    let url;
    try {
      url = new URL(cell(urlColumn).trim());
    } catch {
      throw new Error(`Row ${index + 2} has an invalid project URL.`);
    }
    if (url.protocol !== 'https:' || !/(^|\.)devpost\.com$/.test(url.hostname)) {
      throw new Error(`Row ${index + 2} needs an HTTPS Devpost project URL.`);
    }
    url.hash = '';
    url.search = '';
    const projectUrl = url.toString().replace(/\/$/, '');
    const title = cell(titleColumn).trim();
    if (!title || title.length > 200) {
      throw new Error(`Row ${index + 2} needs a project title under 200 characters.`);
    }
    const emails = [...emailColumns.map(cell), ...row.slice(overflowStart).map(String)]
      .flatMap((value) => value.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []);
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
  // Several organizer devices sign in from the venue's shared Wi-Fi, so only wrong passwords count.
  const organizerLoginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: clientIpKey,
    skipSuccessfulRequests: true,
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
         VALUES ($1, $2, NOW() + $3 * INTERVAL '1 second')`,
        [hashSessionToken(token), passwordFingerprint, organizerSessionSeconds],
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
        `SELECT id, full_name, meal_count, meal_qr_token, rsvp_at FROM event_applications
         WHERE accepted = TRUE AND (user_id = $1 OR (user_id IS NULL AND email = $2))
         ORDER BY created_at DESC LIMIT 1`,
        [request.user.id, request.user.email],
      );
      let application = applicationResult.rows[0];
      if (!application) return response.status(403).json({ error: 'Participant access is not available yet.' });
      // The event pass (and its meal QR) is only for hackers who have confirmed their spot.
      if (!application.rsvp_at) {
        return response.status(403).json({
          code: 'rsvp_required',
          error: 'Confirm your spot on your dashboard to get your event pass.',
        });
      }
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

  async function findAcceptedApplication(db, user, { lock = false } = {}) {
    const result = await db.query(
      `SELECT id, waiver_submitted_at, rsvp_at FROM event_applications
       WHERE accepted = TRUE AND (user_id = $1 OR (user_id IS NULL AND email = $2))
       ORDER BY created_at DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [user.id, user.email],
    );
    return result.rows[0] || null;
  }

  async function checklistFor(db, application) {
    const files = await db.query(
      `SELECT id, file_name, byte_size, content_type, uploaded_at FROM waiver_files
       WHERE application_id = $1 ORDER BY id`,
      [application.id],
    );
    return {
      waiver: {
        submittedAt: application.waiver_submitted_at,
        files: files.rows.map((file) => ({
          id: Number(file.id),
          name: file.file_name,
          size: file.byte_size,
          type: file.content_type,
          uploadedAt: file.uploaded_at,
        })),
      },
      rsvpAt: application.rsvp_at,
      rsvpDeadline: EVENT_DETAILS.rsvpDeadline,
      rsvpClosed: rsvpClosed(),
    };
  }

  const notAcceptedYet = (response) => response.status(403).json({ error: 'Participant access is not available yet.' });
  const waiverLocked = (response) => response.status(409).json({
    error: 'Your waiver is already submitted. Email hello@onhacks.ca if you need to change it.',
  });
  const waiverUploadLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 40,
    keyGenerator: (request) => `user:${request.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: 'Too many uploads. Please try again later.' }),
  });

  app.get('/api/participant/checklist', requireAuth, async (request, response, next) => {
    try {
      const application = await findAcceptedApplication(pool, request.user);
      if (!application) return notAcceptedYet(response);
      return response.json(await checklistFor(pool, application));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/participant/waiver/files', requireAuth, waiverUploadLimit,
    express.raw({ type: Object.keys(waiverSignatures), limit: EVENT_DETAILS.waiverMaxFileBytes }),
    async (request, response, next) => {
      const contentType = String(request.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!hasWaiverSignature(request.body, contentType)) {
        return response.status(415).json({ error: 'Upload the waiver as a PDF, JPG, or PNG file.' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const application = await findAcceptedApplication(client, request.user, { lock: true });
        if (!application) {
          await client.query('ROLLBACK');
          return notAcceptedYet(response);
        }
        if (application.waiver_submitted_at) {
          await client.query('ROLLBACK');
          return waiverLocked(response);
        }
        const totals = await client.query(
          `SELECT COUNT(*)::integer AS count, COALESCE(SUM(byte_size), 0)::bigint AS bytes
           FROM waiver_files WHERE application_id = $1`,
          [application.id],
        );
        if (totals.rows[0].count >= EVENT_DETAILS.waiverMaxFiles) {
          await client.query('ROLLBACK');
          return response.status(409).json({ error: `You can upload up to ${EVENT_DETAILS.waiverMaxFiles} files. Remove one to add another.` });
        }
        if (Number(totals.rows[0].bytes) + request.body.length > waiverMaxTotalBytes) {
          await client.query('ROLLBACK');
          return response.status(413).json({ error: 'Your waiver files are too large in total. Use smaller photos or a PDF scan.' });
        }
        await client.query(
          `INSERT INTO waiver_files (application_id, content_type, file_name, byte_size, data)
           VALUES ($1, $2, $3, $4, $5)`,
          [application.id, contentType, waiverFileName(request.get('x-file-name'), contentType),
            request.body.length, request.body],
        );
        const checklist = await checklistFor(client, application);
        await client.query('COMMIT');
        return response.status(201).json(checklist);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return next(error);
      } finally {
        client.release();
      }
    });

  app.delete('/api/participant/waiver/files/:fileId', requireAuth, async (request, response, next) => {
    const fileId = Number(request.params.fileId);
    if (!Number.isSafeInteger(fileId) || fileId < 1) {
      return response.status(400).json({ error: 'That file does not exist.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const application = await findAcceptedApplication(client, request.user, { lock: true });
      if (!application) {
        await client.query('ROLLBACK');
        return notAcceptedYet(response);
      }
      if (application.waiver_submitted_at) {
        await client.query('ROLLBACK');
        return waiverLocked(response);
      }
      const removed = await client.query(
        'DELETE FROM waiver_files WHERE id = $1 AND application_id = $2',
        [fileId, application.id],
      );
      if (!removed.rowCount) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'That file does not exist.' });
      }
      const checklist = await checklistFor(client, application);
      await client.query('COMMIT');
      return response.json(checklist);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client.release();
    }
  });

  app.post('/api/participant/waiver/submit', requireAuth, async (request, response, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let application = await findAcceptedApplication(client, request.user, { lock: true });
      if (!application) {
        await client.query('ROLLBACK');
        return notAcceptedYet(response);
      }
      if (!application.waiver_submitted_at) {
        const files = await client.query(
          'SELECT COUNT(*)::integer AS count FROM waiver_files WHERE application_id = $1',
          [application.id],
        );
        if (!files.rows[0].count) {
          await client.query('ROLLBACK');
          return response.status(400).json({ error: 'Upload your signed waiver before submitting it.' });
        }
        const updated = await client.query(
          `UPDATE event_applications SET waiver_submitted_at = NOW()
           WHERE id = $1 RETURNING id, waiver_submitted_at, rsvp_at`,
          [application.id],
        );
        application = updated.rows[0];
      }
      const checklist = await checklistFor(client, application);
      await client.query('COMMIT');
      return response.json(checklist);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client.release();
    }
  });

  app.post('/api/participant/rsvp', requireAuth, async (request, response, next) => {
    try {
      const application = await findAcceptedApplication(pool, request.user);
      if (!application) return notAcceptedYet(response);
      if (application.rsvp_at) return response.json(await checklistFor(pool, application));
      if (!application.waiver_submitted_at) {
        return response.status(409).json({ error: 'Submit your signed waiver before you RSVP.' });
      }
      if (rsvpClosed()) {
        return response.status(409).json({
          code: 'rsvp_closed',
          error: `RSVPs closed on ${EVENT_DETAILS.rsvpDeadlineLabel}. Email hello@onhacks.ca if you still plan to attend.`,
        });
      }
      const updated = await pool.query(
        `UPDATE event_applications SET rsvp_at = COALESCE(rsvp_at, NOW())
         WHERE id = $1 AND accepted = TRUE AND waiver_submitted_at IS NOT NULL
         RETURNING id, waiver_submitted_at, rsvp_at`,
        [application.id],
      );
      if (!updated.rowCount) {
        return response.status(409).json({ error: 'Submit your signed waiver before you RSVP.' });
      }
      return response.json(await checklistFor(pool, updated.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/organizer/participants', requireOrganizer, async (_request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT a.id, a.full_name, a.email, a.waiver_submitted_at, a.rsvp_at,
               COALESCE(
                 JSON_AGG(JSON_BUILD_OBJECT(
                   'id', f.id, 'name', f.file_name, 'size', f.byte_size, 'type', f.content_type
                 ) ORDER BY f.id) FILTER (WHERE f.id IS NOT NULL),
                 '[]'::json
               ) AS files
        FROM event_applications a
        LEFT JOIN waiver_files f ON f.application_id = a.id
        WHERE a.accepted = TRUE
        GROUP BY a.id
        ORDER BY lower(a.full_name), a.id
      `);
      return response.json({
        participants: result.rows.map((row) => ({
          id: Number(row.id),
          name: formatParticipantName(row.full_name),
          email: row.email,
          waiverSubmittedAt: row.waiver_submitted_at,
          rsvpAt: row.rsvp_at,
          files: row.files.map((file) => ({ ...file, id: Number(file.id) })),
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/organizer/waivers/files/:fileId', requireOrganizer, async (request, response, next) => {
    const fileId = Number(request.params.fileId);
    if (!Number.isSafeInteger(fileId) || fileId < 1) {
      return response.status(404).json({ error: 'Waiver file not found.' });
    }
    try {
      const result = await pool.query(
        'SELECT application_id, content_type, data FROM waiver_files WHERE id = $1',
        [fileId],
      );
      const file = result.rows[0];
      if (!file) return response.status(404).json({ error: 'Waiver file not found.' });
      const extension = waiverExtensions[file.content_type] || 'bin';
      response.setHeader('Content-Type', file.content_type);
      // Always download rather than render, so an uploaded file can never run in the site's origin.
      response.setHeader('Content-Disposition',
        `attachment; filename="waiver-${file.application_id}-${fileId}.${extension}"`);
      return response.send(file.data);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/organizer/participants/:applicationId/waiver/reset', requireOrganizer, async (request, response, next) => {
    const applicationId = Number(request.params.applicationId);
    if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
      return response.status(404).json({ error: 'Participant not found.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE event_applications SET waiver_submitted_at = NULL, rsvp_at = NULL
         WHERE id = $1 AND accepted = TRUE RETURNING id`,
        [applicationId],
      );
      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Participant not found.' });
      }
      await client.query('DELETE FROM waiver_files WHERE application_id = $1', [applicationId]);
      await client.query('COMMIT');
      return response.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client.release();
    }
  });

  // Hackers can't RSVP themselves after the deadline (including after a waiver reset), so an
  // organizer confirms them once their signed waiver is in.
  app.post('/api/organizer/participants/:applicationId/rsvp', requireOrganizer, async (request, response, next) => {
    const applicationId = Number(request.params.applicationId);
    if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
      return response.status(404).json({ error: 'Participant not found.' });
    }
    try {
      const updated = await pool.query(
        `UPDATE event_applications SET rsvp_at = COALESCE(rsvp_at, NOW())
         WHERE id = $1 AND accepted = TRUE AND waiver_submitted_at IS NOT NULL
         RETURNING id`,
        [applicationId],
      );
      if (!updated.rowCount) {
        return response.status(409).json({ error: 'This hacker needs a submitted waiver before you can confirm their RSVP.' });
      }
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/organizer/meals/scan', requireOrganizer, async (request, response, next) => {
    const qrValue = request.body?.qrValue;
    const match = typeof qrValue === 'string' && /^onhacks:meal:([a-f0-9]{64})$/.exec(qrValue);
    if (!match) return response.status(400).json({ code: 'invalid_meal_qr', error: 'This is not an ONHacks meal QR code.' });
    try {
      // A scan within the cooldown is treated as a repeat (a retry after a lost response, or a
      // second volunteer scanning the same badge) rather than the hacker's next meal.
      const result = await pool.query(
        `UPDATE event_applications SET meal_count = meal_count + 1, last_meal_scan_at = NOW()
         WHERE meal_qr_token = $1 AND accepted = TRUE AND meal_count < $2
           AND (last_meal_scan_at IS NULL OR last_meal_scan_at <= NOW() - $3 * INTERVAL '1 minute')
         RETURNING full_name, meal_count`,
        [match[1], EVENT_DETAILS.mealLimitPerParticipant, EVENT_DETAILS.mealScanCooldownMinutes],
      );
      if (!result.rowCount) {
        const participant = await pool.query(
          `SELECT accepted, meal_count, full_name, last_meal_scan_at,
                  last_meal_scan_at > NOW() - $2 * INTERVAL '1 minute' AS recently_scanned
           FROM event_applications WHERE meal_qr_token = $1`,
          [match[1], EVENT_DETAILS.mealScanCooldownMinutes],
        );
        const scanned = participant.rows[0];
        if (scanned?.accepted && scanned.recently_scanned) {
          const name = formatParticipantName(scanned.full_name);
          const at = new Date(scanned.last_meal_scan_at).toLocaleTimeString('en-CA', {
            hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
          });
          return response.status(409).json({
            code: 'meal_recently_scanned',
            error: `${name}'s meal was already recorded at ${at}, so they're all set. No extra meal was counted.`,
          });
        }
        if (scanned?.accepted && scanned.meal_count >= EVENT_DETAILS.mealLimitPerParticipant) {
          return response.status(409).json({
            code: 'meal_limit_reached',
            error: `This participant has already received the maximum of ${EVENT_DETAILS.mealLimitPerParticipant} meals. No additional meal was recorded.`,
          });
        }
        return response.status(404).json({
          code: 'participant_not_accepted',
          error: 'This participant is not accepted. No meal was recorded.',
        });
      }
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
                           COUNT(*) FILTER (WHERE accepted AND rsvp_at IS NOT NULL AND NOT printed)::integer AS unprinted_count,
                           COUNT(*) FILTER (WHERE accepted AND waiver_submitted_at IS NOT NULL)::integer AS waiver_count,
                           COUNT(*) FILTER (WHERE accepted AND rsvp_at IS NOT NULL)::integer AS rsvp_count
                    FROM event_applications`),
        pool.query('SELECT room_count, start_time, assigned_at FROM judging_settings WHERE id = 1'),
        getProjects(pool),
      ]);
      return response.json({
        acceptedCount: counts.rows[0].accepted_count,
        unprintedCount: counts.rows[0].unprinted_count,
        waiverCount: counts.rows[0].waiver_count,
        rsvpCount: counts.rows[0].rsvp_count,
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
    const matchedIds = new Set(eligibleProjects(rows).map((row) => String(row.id)));
    // Every submitted project gets a pitch slot. Projects whose team members couldn't all be
    // matched to one accepted application are still judged; those hackers just won't see
    // their room and time on their pass, so organizers tell them in person.
    const projects = rows.filter((row) => row.room_number === null);
    const unmatchedCount = projects.filter((row) => !matchedIds.has(String(row.id))).length;
    return makePreview(projects, roomCount, start, unmatchedCount);
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
        return response.status(400).json({ error: 'Import at least one project first.' });
      }
      if (preview.unmatchedCount && request.body?.allowUnmatched !== true) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: `${preview.unmatchedCount} project(s) have team members who couldn't be matched. Confirm to schedule them anyway, or fix the emails and re-import.` });
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
