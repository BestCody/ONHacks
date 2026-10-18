import { randomBytes, scrypt as scryptCallback } from 'node:crypto';

if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  console.error('Run this command in an interactive terminal.');
  process.exitCode = 1;
} else {
  process.stdout.write('Organizer password (input hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let password = '';

  process.stdin.on('data', (chunk) => {
    const value = chunk.toString('utf8');
    if (value.includes('\u0003')) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\nCancelled.\n');
      process.exitCode = 1;
      return;
    }
    const newlineIndex = value.search(/[\r\n]/);
    const typed = newlineIndex === -1 ? value : value.slice(0, newlineIndex);
    for (const character of typed) {
      if (character === '\u007f' || character === '\b') password = password.slice(0, -1);
      else password += character;
    }
    if (newlineIndex !== -1) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (password.length < 12 || password.length > 128) {
        console.error('Use 12–128 characters.');
        process.exitCode = 1;
        return;
      }
      const salt = randomBytes(16).toString('hex');
      scryptCallback(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 },
        (error, key) => {
          password = '';
          if (error) {
            console.error('Could not hash password.');
            process.exitCode = 1;
            return;
          }
          console.log(`ORGANIZER_PASSWORD_HASH=scrypt:${salt}:${key.toString('hex')}`);
        });
      return;
    }
  });
}
