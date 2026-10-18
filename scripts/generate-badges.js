import { randomBytes } from 'node:crypto';
import { mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { createBadgePdf } from '../server/printBadges.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(projectRoot, '.env') });

const [paper = 'letter', ...extraArgs] = process.argv.slice(2);
if (!['letter', 'tabloid'].includes(paper) || extraArgs.length) {
  throw new Error('Usage: npm run badges:generate -- [letter|tabloid]');
}
if (!process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL in your local .env before generating badges.');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let connected = false;
let transactionOpen = false;
let commitStarted = false;
let committed = false;
let temporaryPath;
let savedPath;
let filePublished = false;

try {
  await client.connect();
  connected = true;
  await client.query('BEGIN');
  transactionOpen = true;

  const lock = await client.query('SELECT pg_try_advisory_xact_lock(42733) AS acquired');
  if (!lock.rows[0].acquired) {
    throw new Error('Another badge sheet is being generated. Try again after it finishes.');
  }

  const result = await client.query(
    `SELECT id, full_name, meal_qr_token FROM event_applications
     WHERE accepted = TRUE AND printed = FALSE
     ORDER BY id FOR UPDATE`,
  );
  if (!result.rowCount) {
    await client.query('ROLLBACK');
    transactionOpen = false;
    console.log('No accepted participants need badges.');
  } else {
    const badges = [];
    for (const row of result.rows) {
      let token = row.meal_qr_token;
      if (!token) {
        const updated = await client.query(
          `UPDATE event_applications SET meal_qr_token = COALESCE(meal_qr_token, $2)
           WHERE id = $1 RETURNING meal_qr_token`,
          [row.id, randomBytes(32).toString('hex')],
        );
        token = updated.rows[0].meal_qr_token;
      }
      badges.push({ name: row.full_name, qrValue: `onhacks:meal:${token}` });
    }

    const pdf = await createBadgePdf(badges, paper);
    const printsDirectory = path.join(projectRoot, 'prints');
    await mkdir(printsDirectory, { recursive: true });
    const [realRoot, realPrints] = await Promise.all([
      realpath(projectRoot), realpath(printsDirectory),
    ]);
    if (!realPrints.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error('The prints folder must be inside this repository.');
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `onhacks-badges-${paper}-${stamp}-${randomBytes(12).toString('hex')}.pdf`;
    savedPath = path.join(realPrints, filename);
    const pendingPath = `${savedPath}.tmp`;
    const file = await open(pendingPath, 'wx', 0o600);
    temporaryPath = pendingPath;
    try {
      await file.writeFile(pdf);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, savedPath);
    temporaryPath = undefined;
    filePublished = true;

    const marked = await client.query(
      `UPDATE event_applications SET printed = TRUE
       WHERE id = ANY($1::bigint[]) AND accepted = TRUE AND printed = FALSE`,
      [result.rows.map((row) => row.id)],
    );
    if (marked.rowCount !== result.rowCount) {
      throw new Error('Badge eligibility changed. No participants were marked printed.');
    }
    commitStarted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    committed = true;
    console.log(`Saved ${badges.length} badge(s) to ${savedPath} and marked them printed.`);
  }
} catch (error) {
  if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
  if (temporaryPath) {
    await unlink(temporaryPath).catch(() => console.error(`Could not remove incomplete file: ${temporaryPath}`));
  }
  if (filePublished && !commitStarted) {
    await unlink(savedPath).catch(() => console.error(`Could not remove uncommitted file: ${savedPath}`));
  }
  if (commitStarted && !committed) {
    console.error(`Database commit outcome is uncertain. Check ${savedPath} and the printed flags before retrying.`);
  }
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
}
