import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { buildAcceptanceEmail } from '../server/acceptanceEmail.js';
import { EVENT_DETAILS } from '../src/eventDetails.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(projectRoot, '.env') });

const usage = `Usage:
  npm run applicants -- list [--all]
  npm run applicants -- accept <application id>... [--send]
  npm run applicants -- accept --all-pending [--send]

list shows applicants who haven't been sent an acceptance email yet (--all shows everyone).
accept without --send is a dry run: it changes nothing and saves a preview of the email in prints/.
With --send it marks the applicants accepted and emails each of them once.`;

const resendUrl = 'https://api.resend.com/emails';
const lockKey = 42734;
const sendSpacingMs = 600;
const maxAttempts = 4;

class SendError extends Error {
  constructor(message, { stopRun = false } = {}) {
    super(message);
    this.stopRun = stopRun;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((value) => value.startsWith('--')));
  const values = rest.filter((value) => !value.startsWith('--'));
  const known = { list: ['--all'], accept: ['--send', '--all-pending'] }[command];
  if (!known || [...flags].some((flag) => !known.includes(flag))) return null;
  if (command === 'list') return values.length ? null : { command, all: flags.has('--all') };

  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null;
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
  if (!row.acceptance_email_sent_at) return 'Accepted, not emailed';
  if (row.rsvp_at) return "RSVP'd";
  if (row.waiver_submitted_at) return 'Waiver in, no RSVP';
  return 'Emailed';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : '';
}

async function listApplicants(client, all) {
  const columns = await existingColumns(client);
  // Before the waiver update is deployed these columns don't exist yet; listing still works.
  const optional = ['acceptance_email_sent_at', 'waiver_submitted_at', 'rsvp_at']
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
  const result = allPending
    ? await client.query(
      `SELECT id, full_name, email, accepted, acceptance_email_sent_at FROM event_applications
       WHERE acceptance_email_sent_at IS NULL ORDER BY id`,
    )
    : await client.query(
      `SELECT id, full_name, email, accepted, acceptance_email_sent_at FROM event_applications
       WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [ids],
    );
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

async function sendAcceptance(row, { apiKey, from }) {
  const email = buildAcceptanceEmail(row.full_name);
  const body = JSON.stringify({
    from,
    to: row.email,
    reply_to: email.replyTo,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(resendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Resend drops a repeat of this key for 24 hours, so a retry after a timeout
          // or an interrupted run cannot email the same hacker twice.
          'Idempotency-Key': `onhacks-acceptance-${row.id}`,
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (attempt === maxAttempts) throw new SendError(`Could not reach Resend (${error.message}).`, { stopRun: true });
      await sleep(2_000 * attempt);
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.id;

    const detail = data.message || data.name || 'no details';
    const quota = /quota/i.test(`${data.name} ${data.message}`);
    const retryable = (response.status === 429 && !quota)
      || response.status >= 500
      || data.name === 'concurrent_idempotent_requests';
    if (retryable && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2_000 * attempt);
      continue;
    }
    if (data.name === 'invalid_idempotent_request') {
      throw new SendError('Resend says an acceptance email to this hacker was already sent in the last 24 hours with different content. Check the Resend dashboard before retrying.');
    }
    throw new SendError(`Resend returned HTTP ${response.status}: ${detail}`, {
      stopRun: quota || [401, 403].includes(response.status) || retryable,
    });
  }
  throw new SendError('Resend did not accept the email after several attempts.', { stopRun: true });
}

async function acceptApplicants(client, options) {
  const deadline = Date.parse(EVENT_DETAILS.rsvpDeadline);
  const rsvpClosed = Date.now() > deadline;
  const rows = await selectApplicants(client, options);
  const alreadyEmailed = rows.filter((row) => row.acceptance_email_sent_at);
  const targets = rows.filter((row) => !row.acceptance_email_sent_at);

  for (const row of alreadyEmailed) {
    console.log(`Skipping #${row.id} ${row.full_name}: acceptance email already sent ${formatDate(row.acceptance_email_sent_at)}.`);
  }
  if (!targets.length) {
    console.log('Nobody to accept or email.');
    return true;
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

  if (!options.send) {
    const previewPath = await savePreview(targets[0]);
    console.log(`\nDry run only. Nothing was changed or sent.\nEmail preview for #${targets[0].id}: ${previewPath}\nAdd --send to accept and email them.`);
    return true;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Set RESEND_API_KEY and EMAIL_FROM in your local .env (copy them from Render) before sending. Nothing was changed.');
  }
  const columns = await existingColumns(client);
  const waiverTable = await client.query(`SELECT to_regclass('waiver_files') IS NOT NULL AS present`);
  if (!['rsvp_at', 'waiver_submitted_at', 'acceptance_email_sent_at'].every((name) => columns.has(name)) || !waiverTable.rows[0].present) {
    throw new Error('This database does not have the waiver and RSVP update yet. Deploy the latest site to Render, let it start, then run this again. Nothing was changed.');
  }

  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (!await confirm(`\nAccept and email ${targets.length} applicant(s) from ${from} using the database at ${databaseHost}? Type yes to continue: `)) {
    console.log('Cancelled. Nothing was changed or sent.');
    return true;
  }

  const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
  if (!lock.rows[0].acquired) throw new Error('Another acceptance run is in progress. Try again after it finishes.');
  try {
    // Re-read exactly the applicants shown above, under the lock, in case another run
    // emailed one of them meanwhile. Anyone who applied after the list was shown waits.
    const fresh = (await selectApplicants(client, { ids: targets.map((row) => Number(row.id)) }))
      .filter((row) => !row.acceptance_email_sent_at);
    const accepted = await client.query(
      `UPDATE event_applications SET accepted = TRUE
       WHERE id = ANY($1::bigint[]) AND accepted = FALSE RETURNING id`,
      [fresh.map((row) => row.id)],
    );
    console.log(`Marked ${accepted.rowCount} applicant(s) accepted.`);

    const failures = [];
    let sent = 0;
    for (const [index, row] of fresh.entries()) {
      if (index > 0) await sleep(sendSpacingMs);
      try {
        await sendAcceptance(row, { apiKey, from });
      } catch (error) {
        failures.push(`#${row.id} ${row.email}: ${error.message}`);
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
        throw new Error(`Emailed #${row.id} ${row.email} but could not record it (${error.message}). Run the same command again within 24 hours; Resend will recognize the repeat and won't email them twice.`);
      }
      sent += 1;
      console.log(`  Emailed #${row.id} ${row.email}`);
    }

    console.log(`\nSent ${sent} of ${fresh.length} acceptance email(s).`);
    if (failures.length) {
      console.error(`Problems:\n  ${failures.join('\n  ')}`);
      console.error('Fix the problem (or wait for Resend\'s daily limit to reset), then run the same command again. Anyone already emailed is skipped.');
      return false;
    }
    return true;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {});
  }
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
  if (options.command === 'list') {
    await listApplicants(client, options.all);
  } else if (!await acceptApplicants(client, options)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
}
