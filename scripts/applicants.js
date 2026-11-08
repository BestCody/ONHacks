import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { buildAcceptanceEmail } from '../server/acceptanceEmail.js';
import { emailSettings, sendEmail } from '../server/email.js';
import { EVENT_DETAILS } from '../src/eventDetails.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(projectRoot, '.env'), quiet: true });

const usage = `Usage:
  npm run applicants -- list [--all]
  npm run applicants -- accept <application id>... [--send]
  npm run applicants -- accept --all-pending [--send]
  npm run applicants -- mark-sent <application id>...
  npm run applicants -- retry <application id>...

list shows applicants who haven't been sent an acceptance email yet (--all shows everyone).
accept without --send is a dry run: it changes nothing and saves a preview of the email in prints/.
With --send it marks the applicants accepted and emails each of them once through Brevo.
If a send's outcome was unclear, that applicant is flagged "Unconfirmed". Check Brevo's
transactional log, then run mark-sent (it was delivered) or retry (it wasn't) for them.`;

const lockKey = 42734;
const sendSpacingMs = 600;
const maxAttempts = 4;

class SendError extends Error {
  constructor(message, { stopRun = false, uncertain = false } = {}) {
    super(message);
    this.stopRun = stopRun;
    this.uncertain = uncertain;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((value) => value.startsWith('--')));
  const values = rest.filter((value) => !value.startsWith('--'));
  const known = { list: ['--all'], accept: ['--send', '--all-pending'], 'mark-sent': [], retry: [] }[command];
  if (!known || [...flags].some((flag) => !known.includes(flag))) return null;
  if (command === 'list') return values.length ? null : { command, all: flags.has('--all') };

  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null;
  if (command === 'mark-sent' || command === 'retry') return ids.length ? { command, ids: [...new Set(ids)] } : null;
  const allPending = flags.has('--all-pending');
  if (allPending === Boolean(ids.length)) return null;
  return { command, ids: [...new Set(ids)], allPending, send: flags.has('--send') };
}

async function existingColumns(client) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'event_applications'`,
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function statusFor(row) {
  if (!row.accepted) return 'Pending';
  if (!row.acceptance_email_sent_at) return row.acceptance_email_attempted_at ? 'Unconfirmed (check Brevo)' : 'Accepted, not emailed';
  if (row.rsvp_at) return "RSVP'd";
  if (row.waiver_submitted_at) return 'Waiver in, no RSVP';
  return 'Emailed';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : '';
}

async function listApplicants(client, all) {
  const columns = await existingColumns(client);
  // Before the latest update is deployed some columns don't exist yet; listing still works.
  const optional = ['acceptance_email_sent_at', 'acceptance_email_attempted_at', 'waiver_submitted_at', 'rsvp_at']
    .map((name) => (columns.has(name) ? name : `NULL::timestamptz AS ${name}`));
  const result = await client.query(
    `SELECT id, full_name, email, team, github, accepted, created_at, ${optional.join(', ')}
     FROM event_applications ORDER BY id`,
  );
  const rows = all ? result.rows : result.rows.filter((row) => !row.acceptance_email_sent_at);
  if (!rows.length) {
    console.log(all ? 'There are no applications yet.' : 'Everyone who applied has been sent an acceptance email.');
  } else {
    console.table(rows.map((row) => ({
      id: Number(row.id),
      name: row.full_name,
      email: row.email,
      team: row.team,
      github: row.github,
      applied: formatDate(row.created_at),
      status: statusFor(row),
    })));
  }
  const counts = result.rows.reduce((total, row) => {
    total[statusFor(row)] = (total[statusFor(row)] || 0) + 1;
    return total;
  }, {});
  console.log(`${result.rowCount} application(s): ${Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(', ') || 'none'}.`);
}

async function selectApplicants(client, { ids, allPending }) {
  const columns = 'id, full_name, email, accepted, acceptance_email_sent_at, acceptance_email_attempted_at';
  const result = allPending
    ? await client.query(`SELECT ${columns} FROM event_applications WHERE acceptance_email_sent_at IS NULL ORDER BY id`)
    : await client.query(`SELECT ${columns} FROM event_applications WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids]);
  if (!allPending) {
    const found = new Set(result.rows.map((row) => Number(row.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`No application has id ${missing.join(', ')}. Nothing was changed.`);
  }
  return result.rows;
}

async function savePreview(row) {
  const email = buildAcceptanceEmail(row.full_name);
  const printsDirectory = path.join(projectRoot, 'prints');
  await mkdir(printsDirectory, { recursive: true });
  const [realRoot, realPrints] = await Promise.all([realpath(projectRoot), realpath(printsDirectory)]);
  if (!realPrints.startsWith(`${realRoot}${path.sep}`)) throw new Error('The prints folder must be inside this repository.');
  const htmlPath = path.join(realPrints, 'acceptance-email-preview.html');
  await writeFile(htmlPath, email.html, { mode: 0o600 });
  await writeFile(path.join(realPrints, 'acceptance-email-preview.txt'), `Subject: ${email.subject}\n\n${email.text}\n`, { mode: 0o600 });
  return htmlPath;
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

// Brevo has no way to recognize a repeated send, so a request is retried only when Brevo
// clearly refused it (rate limited). Anything without a clear answer is reported as uncertain.
async function sendAcceptance(row, settings) {
  const email = buildAcceptanceEmail(row.full_name);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await sendEmail(settings, {
        to: row.email,
        toName: row.full_name,
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo: email.replyTo,
        tags: ['acceptance'],
      });
    } catch (error) {
      if (error.uncertain) {
        throw new SendError(`${error.message} The email may or may not have been sent.`, { stopRun: true, uncertain: true });
      }
      if (error.status === 429 && attempt < maxAttempts) {
        await sleep((error.retryAfter || 2 * attempt) * 1000);
        continue;
      }
      const limit = /limit|quota|credit|exceed/i.test(error.message);
      throw new SendError(error.message, { stopRun: limit || [401, 402, 403, 429].includes(error.status) });
    }
  }
  throw new SendError('Brevo kept rate limiting the request.', { stopRun: true });
}

async function requireLatestSchema(client) {
  const columns = await existingColumns(client);
  const waiverTable = await client.query(`SELECT to_regclass('waiver_files') IS NOT NULL AS present`);
  const needed = ['rsvp_at', 'waiver_submitted_at', 'acceptance_email_sent_at', 'acceptance_email_attempted_at'];
  if (!needed.every((name) => columns.has(name)) || !waiverTable.rows[0].present) {
    throw new Error('This database does not have the latest site update yet. Deploy the latest site to Render, let it start, then run this again. Nothing was changed.');
  }
}

async function acceptApplicants(client, options) {
  const deadline = Date.parse(EVENT_DETAILS.rsvpDeadline);
  const rsvpClosed = Date.now() > deadline;
  const rows = await selectApplicants(client, options);
  const alreadyEmailed = rows.filter((row) => row.acceptance_email_sent_at);
  const unconfirmed = rows.filter((row) => !row.acceptance_email_sent_at && row.acceptance_email_attempted_at);
  const targets = rows.filter((row) => !row.acceptance_email_sent_at && !row.acceptance_email_attempted_at);

  for (const row of alreadyEmailed) {
    console.log(`Skipping #${row.id} ${row.full_name}: acceptance email already sent ${formatDate(row.acceptance_email_sent_at)}.`);
  }
  for (const row of unconfirmed) {
    console.log(`Skipping #${row.id} ${row.full_name}: an earlier send is unconfirmed. Check Brevo's log, then run mark-sent or retry for ${row.id}.`);
  }
  if (!targets.length) {
    console.log('Nobody to accept or email.');
    return !unconfirmed.length;
  }

  console.log(`${options.send ? 'Accepting and emailing' : 'Would accept and email'} ${targets.length} applicant(s):`);
  for (const row of targets) {
    console.log(`  #${row.id}  ${row.full_name} <${row.email}>${row.accepted ? '  (already accepted, not yet emailed)' : ''}`);
  }
  if (rsvpClosed) {
    throw new Error(`RSVPs closed on ${EVENT_DETAILS.rsvpDeadlineLabel}, so newly accepted hackers couldn't confirm their spot. Move rsvpDeadline in src/eventDetails.js and deploy before accepting anyone.`);
  }
  const hoursLeft = Math.floor((deadline - Date.now()) / 3_600_000);
  if (hoursLeft < 72) console.log(`Note: only ${hoursLeft} hour(s) remain before RSVPs close on ${EVENT_DETAILS.rsvpDeadlineLabel}.`);
  if (targets.length > 290) console.log(`Note: Brevo's free plan sends 300 emails a day (sign-up emails included), so this run will likely stop partway. Run it again the next day to finish.`);

  if (!options.send) {
    const previewPath = await savePreview(targets[0]);
    console.log(`\nDry run only. Nothing was changed or sent.\nEmail preview for #${targets[0].id}: ${previewPath}\nAdd --send to accept and email them through Brevo.`);
    return true;
  }

  const settings = emailSettings();
  if (!settings) {
    throw new Error('Set BREVO_API_KEY and EMAIL_FROM in your local .env before sending. Nothing was changed.');
  }
  await requireLatestSchema(client);

  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (!await confirm(`\nAccept and email ${targets.length} applicant(s) from ${settings.from} through Brevo, using the database at ${databaseHost}? Type yes to continue: `)) {
    console.log('Cancelled. Nothing was changed or sent.');
    return true;
  }

  const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
  if (!lock.rows[0].acquired) throw new Error('Another acceptance run is in progress. Try again after it finishes.');
  try {
    // Re-read exactly the applicants shown above, under the lock, in case another run
    // emailed one of them meanwhile. Anyone who applied after the list was shown waits.
    const fresh = (await selectApplicants(client, { ids: targets.map((row) => Number(row.id)) }))
      .filter((row) => !row.acceptance_email_sent_at && !row.acceptance_email_attempted_at);
    const accepted = await client.query(
      `UPDATE event_applications SET accepted = TRUE
       WHERE id = ANY($1::bigint[]) AND accepted = FALSE RETURNING id`,
      [fresh.map((row) => row.id)],
    );
    console.log(`Marked ${accepted.rowCount} applicant(s) accepted.`);

    const failures = [];
    const unclear = [];
    let sent = 0;
    for (const [index, row] of fresh.entries()) {
      if (index > 0) await sleep(sendSpacingMs);
      // Record the attempt first, so an interrupted run can never email this person twice.
      const claimed = await client.query(
        `UPDATE event_applications SET acceptance_email_attempted_at = NOW()
         WHERE id = $1 AND acceptance_email_sent_at IS NULL AND acceptance_email_attempted_at IS NULL
         RETURNING id`,
        [row.id],
      );
      if (!claimed.rowCount) continue;
      try {
        await sendAcceptance(row, settings);
      } catch (error) {
        if (error.uncertain) {
          unclear.push(row);
        } else {
          // Brevo clearly refused it, so nothing went out; a later run may try again.
          await client.query('UPDATE event_applications SET acceptance_email_attempted_at = NULL WHERE id = $1', [row.id]);
          failures.push(`#${row.id} ${row.email}: ${error.message}`);
        }
        if (error.stopRun) {
          const remaining = fresh.length - index - 1;
          if (remaining) failures.push(`Stopped before emailing ${remaining} more applicant(s). They are accepted; run the same command again to email them.`);
          break;
        }
        continue;
      }
      try {
        await client.query('UPDATE event_applications SET acceptance_email_sent_at = NOW() WHERE id = $1', [row.id]);
      } catch (error) {
        throw new Error(`Emailed #${row.id} ${row.email} but could not record it (${error.message}). They stay flagged as unconfirmed, so no run will email them again; run mark-sent ${row.id} once the database is reachable.`);
      }
      sent += 1;
      console.log(`  Emailed #${row.id} ${row.email}`);
    }

    console.log(`\nSent ${sent} of ${fresh.length} acceptance email(s).`);
    if (unclear.length) {
      console.error(`Unconfirmed: Brevo didn't give a clear answer for ${unclear.map((row) => `#${row.id} ${row.email}`).join(', ')}.`);
      console.error(`Check Brevo's transactional log (tag "acceptance"), then run "npm run applicants -- mark-sent <id>" if it was delivered or "npm run applicants -- retry <id>" if it wasn't.`);
    }
    if (failures.length) {
      console.error(`Problems:\n  ${failures.join('\n  ')}`);
      console.error('Fix the problem (or wait for Brevo\'s daily limit to reset), then run the same command again. Anyone already emailed is skipped.');
    }
    return !failures.length && !unclear.length;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {});
  }
}

// Resolves applicants flagged "Unconfirmed" after checking Brevo's transactional log.
async function resolveUnconfirmed(client, { command, ids }) {
  await requireLatestSchema(client);
  const result = command === 'mark-sent'
    ? await client.query(
      `UPDATE event_applications SET acceptance_email_sent_at = acceptance_email_attempted_at
       WHERE id = ANY($1::bigint[]) AND acceptance_email_sent_at IS NULL AND acceptance_email_attempted_at IS NOT NULL
       RETURNING id`,
      [ids],
    )
    : await client.query(
      `UPDATE event_applications SET acceptance_email_attempted_at = NULL
       WHERE id = ANY($1::bigint[]) AND acceptance_email_sent_at IS NULL AND acceptance_email_attempted_at IS NOT NULL
       RETURNING id`,
      [ids],
    );
  const changed = new Set(result.rows.map((row) => Number(row.id)));
  for (const id of ids) {
    if (!changed.has(id)) console.log(`#${id} isn't flagged as unconfirmed, so nothing changed for it.`);
  }
  if (changed.size) {
    console.log(command === 'mark-sent'
      ? `Recorded ${changed.size} acceptance email(s) as sent.`
      : `Cleared ${changed.size} unconfirmed send(s). Run accept for them again to email them.`);
  }
  return true;
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
// A dropped connection fails the next query with a clear message instead of crashing mid-run.
client.on('error', (error) => console.error(`Database connection error: ${error.message}`));
let connected = false;
try {
  await client.connect();
  connected = true;
  let ok = true;
  if (options.command === 'list') await listApplicants(client, options.all);
  else if (options.command === 'accept') ok = await acceptApplicants(client, options);
  else ok = await resolveUnconfirmed(client, options);
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
}
