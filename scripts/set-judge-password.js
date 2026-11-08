import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

// Saves the shared judge password, as a scrypt hash, in the database the local .env points to.
// The repository is public, so the password is never stored in code. Changing it signs every
// judge out. Run `npm run judges:set-password` and type the password, or pipe it in.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(projectRoot, '.env'), quiet: true });

function readPassword() {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', () => resolve(input.replace(/\r?\n$/, '')));
    });
  }
  return new Promise((resolve, reject) => {
    process.stdout.write('Judge password (input hidden): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let password = '';
    process.stdin.on('data', (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        if (character === '\u007f' || character === '\b') password = password.slice(0, -1);
        else password += character;
      }
    });
  });
}

const hashPassword = (password) => new Promise((resolve, reject) => {
  const salt = randomBytes(16).toString('hex');
  scryptCallback(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, key) => {
    if (error) reject(error);
    else resolve(`scrypt:${salt}:${key.toString('hex')}`);
  });
});

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in your local .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
client.on('error', (error) => console.error(`Database connection error: ${error.message}`));
let connected = false;
try {
  const password = await readPassword();
  if (password.length < 12 || password.length > 128) throw new Error('Use a password of 12 to 128 characters.');
  const hash = await hashPassword(password);
  await client.connect();
  connected = true;
  await client.query(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('judge_password_hash', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [hash],
  );
  console.log(`Judge password saved to the database at ${new URL(process.env.DATABASE_URL).hostname}. Judges sign in at /judges (anyone already signed in is signed out within 30 seconds).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
}
