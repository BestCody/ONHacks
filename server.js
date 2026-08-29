import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(projectRoot, 'dist');
const databaseUrl = process.env.DATABASE_URL;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : null;

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

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
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

app.disable('x-powered-by');
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

app.post('/api/applications', async (request, response, next) => {
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
  if (process.env.NODE_ENV === 'production' && !pool) {
    throw new Error('DATABASE_URL must be configured in production.');
  }

  if (pool) {
    await pool.query(applicationTable);
  } else {
    console.warn('DATABASE_URL is not set; registration writes are disabled.');
  }

  const server = app.listen(port, () => {
    console.log(`OTHacks listening on port ${port}`);
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
