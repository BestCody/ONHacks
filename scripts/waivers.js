import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { formatParticipantName } from '../src/participantName.js';

// Waivers aren't available through the website at all (the organizer password is shared with
// meal-scan volunteers), so lead organizers with the database login check waivers, reset them,
// and confirm RSVPs with this command.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(projectRoot, '.env'), quiet: true });

const defaultOut = path.join(os.homedir(), 'Downloads', 'ONHacks waivers');
const usage = `Usage:
  npm run waivers -- list
  npm run waivers -- download <application id>...
  npm run waivers -- download --submitted
  npm run waivers -- reset <application id>...
  npm run waivers -- confirm-rsvp <application id>...
  (add --out <folder> to choose where downloaded files are saved)

list shows every accepted hacker's waiver status. download saves waiver files to
"${defaultOut}" by default, outside this OneDrive-synced project folder. Delete the
files once you've checked that every page is signed.
reset deletes a hacker's waiver files and RSVP so they can upload again (it asks first).
confirm-rsvp confirms the spot of a hacker whose waiver is in, for example after the
RSVP deadline or after a reset.`;

const extensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const outIndex = rest.indexOf('--out');
  let out = defaultOut;
  if (outIndex >= 0) {
    out = rest[outIndex + 1];
    if (!out || out.startsWith('--')) return null;
    rest.splice(outIndex, 2);
  }
  const flags = rest.filter((value) => value.startsWith('--'));
  const values = rest.filter((value) => !value.startsWith('--'));
  if (command === 'list') return flags.length || values.length ? null : { command };
  if (command === 'reset' || command === 'confirm-rsvp') {
    const ids = values.map(Number);
    if (flags.length || !ids.length || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null;
    return { command, ids: [...new Set(ids)] };
  }
  if (command !== 'download') return null;
  if (flags.some((flag) => flag !== '--submitted')) return null;
  const submitted = flags.includes('--submitted');
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null;
  if (submitted === Boolean(ids.length)) return null;
  return { command, ids: [...new Set(ids)], submitted, out: path.resolve(out) };
}

const formatWhen = (value) => (value ? new Date(value).toLocaleString('en-CA', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
}) : '');

function slug(name) {
  const value = formatParticipantName(name).normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return value || 'hacker';
}

async function list(client) {
  const result = await client.query(`
    SELECT a.id, a.full_name, a.waiver_submitted_at, a.rsvp_at, COUNT(f.id)::integer AS files
    FROM event_applications a
    LEFT JOIN waiver_files f ON f.application_id = a.id
    WHERE a.accepted = TRUE
    GROUP BY a.id
    ORDER BY a.id`);
  if (!result.rowCount) {
    console.log('No accepted hackers yet.');
    return;
  }
  console.table(result.rows.map((row) => ({
    id: Number(row.id),
    name: formatParticipantName(row.full_name),
    waiver: row.waiver_submitted_at ? `Submitted ${formatWhen(row.waiver_submitted_at)}` : row.files ? 'Uploading (not submitted)' : 'Not submitted',
    files: row.files,
    rsvp: row.rsvp_at ? `Confirmed ${formatWhen(row.rsvp_at)}` : '',
  })));
  const submitted = result.rows.filter((row) => row.waiver_submitted_at).length;
  console.log(`${submitted} of ${result.rowCount} accepted hackers have submitted a waiver.`);
}

async function download(client, { ids, submitted, out }) {
  const relative = path.relative(projectRoot, out);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Save waivers outside this project folder (it is synced to OneDrive and is a public git repository). Use --out with another folder.');
  }
  const files = await client.query(
    `SELECT f.id, f.application_id, f.content_type, a.full_name
     FROM waiver_files f
     JOIN event_applications a ON a.id = f.application_id
     WHERE a.accepted = TRUE AND ${submitted ? 'a.waiver_submitted_at IS NOT NULL' : 'a.id = ANY($1::bigint[])'}
     ORDER BY f.application_id, f.id`,
    submitted ? [] : [ids],
  );
  if (!files.rowCount) {
    console.log(submitted ? 'No submitted waivers yet.' : 'Those hackers have no waiver files.');
    return;
  }
  await mkdir(out, { recursive: true });
  const perHacker = new Map();
  for (const file of files.rows) {
    const index = (perHacker.get(file.application_id) || 0) + 1;
    perHacker.set(file.application_id, index);
    // One file at a time, so a large batch never holds every waiver in memory at once.
    const data = await client.query('SELECT data FROM waiver_files WHERE id = $1', [file.id]);
    if (!data.rowCount) continue;
    const name = `waiver-${file.application_id}-${slug(file.full_name)}-${index}.${extensions[file.content_type] || 'bin'}`;
    await writeFile(path.join(out, name), data.rows[0].data, { mode: 0o600 });
  }
  console.log(`Saved ${files.rowCount} file(s) for ${perHacker.size} hacker(s) to ${out}`);
  console.log("Check that every page is signed, then delete these files. If one isn't signed, run: npm run waivers -- reset <id>");
}

async function confirm(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim().toLowerCase() === 'yes';
  } catch {
    return false;
  } finally {
    prompt.close();
  }
}

async function accepted(client, ids) {
  const result = await client.query(
    'SELECT id, full_name, waiver_submitted_at, rsvp_at FROM event_applications WHERE id = ANY($1::bigint[]) AND accepted = TRUE ORDER BY id',
    [ids],
  );
  const found = new Set(result.rows.map((row) => Number(row.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`No accepted hacker has id ${missing.join(', ')}. Nothing was changed.`);
  return result.rows;
}

async function reset(client, { ids }) {
  const rows = await accepted(client, ids);
  for (const row of rows) console.log(`  #${row.id}  ${formatParticipantName(row.full_name)}${row.rsvp_at ? ' (RSVP will be cleared too)' : ''}`);
  if (!await confirm(`Delete the waiver files and RSVP for ${rows.length} hacker(s) so they can upload again? Type yes to continue: `)) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }
  await client.query('BEGIN');
  try {
    await client.query(
      'UPDATE event_applications SET waiver_submitted_at = NULL, rsvp_at = NULL WHERE id = ANY($1::bigint[]) AND accepted = TRUE',
      [ids],
    );
    const deleted = await client.query('DELETE FROM waiver_files WHERE application_id = ANY($1::bigint[])', [ids]);
    await client.query('COMMIT');
    console.log(`Reset ${rows.length} waiver(s) and deleted ${deleted.rowCount} file(s). Ask them to upload a signed waiver again; once it's in, confirm their RSVP with confirm-rsvp if RSVPs have closed.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function confirmRsvp(client, { ids }) {
  await accepted(client, ids);
  const result = await client.query(
    `UPDATE event_applications SET rsvp_at = COALESCE(rsvp_at, NOW())
     WHERE id = ANY($1::bigint[]) AND accepted = TRUE AND waiver_submitted_at IS NOT NULL
     RETURNING id`,
    [ids],
  );
  const confirmed = new Set(result.rows.map((row) => Number(row.id)));
  const waiting = ids.filter((id) => !confirmed.has(id));
  if (confirmed.size) console.log(`Confirmed ${confirmed.size} RSVP(s). They get their event pass right away.`);
  if (waiting.length) console.log(`Not confirmed: #${waiting.join(', #')} haven't submitted a waiver yet.`);
}

const options = parseArguments(process.argv.slice(2));
if (!options) {
  console.error(usage);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in your local .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
client.on('error', (error) => console.error(`Database connection error: ${error.message}`));
let connected = false;
try {
  await client.connect();
  connected = true;
  if (options.command === 'list') await list(client);
  else if (options.command === 'reset') await reset(client, options);
  else if (options.command === 'confirm-rsvp') await confirmRsvp(client, options);
  else await download(client, options);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
}
