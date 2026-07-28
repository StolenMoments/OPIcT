import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../server/src/auth/password.js';

const AUTH_KEYS = ['OPICT_APP_PASSWORD_HASH', 'OPICT_SESSION_SECRET'];

function envPathFromArgs(args) {
  const index = args.indexOf('--env');
  return resolve(index >= 0 ? args[index + 1] : '.env');
}

function readEntries(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !/^\s*#/.test(line))
      .flatMap((line) => {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)\s*$/);
        return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
      }),
  );
}

const envPath = envPathFromArgs(process.argv.slice(2));
if (process.argv.includes('--env') && !process.argv[process.argv.indexOf('--env') + 1]) {
  throw new Error('--env requires a file path');
}

const contents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const entries = readEntries(contents);
const existingKeys = AUTH_KEYS.filter((key) => Object.hasOwn(entries, key));
if (existingKeys.length > 0) {
  throw new Error(`Auth keys already exist (${existingKeys.join(', ')}); refusing to overwrite`);
}

const password = randomBytes(18).toString('base64url');
const passwordHash = hashPassword(password);
const sessionSecret = randomBytes(32).toString('base64url');
const suffix = contents.length === 0 || contents.endsWith('\n') ? '' : '\n';
const nextContents = `${contents}${suffix}OPICT_APP_PASSWORD_HASH=${passwordHash}\nOPICT_SESSION_SECRET=${sessionSecret}\n`;

writeFileSync(envPath, nextContents, { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log(`OPIc initial password (show once): ${password}`);
