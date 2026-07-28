import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./init-opict-auth.mjs', import.meta.url));

function run(envFile) {
  return execFileSync(process.execPath, [script, '--env', envFile], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('auth initializer creates a protected env without storing the raw password', () => {
  const directory = mkdtempSync(join(tmpdir(), 'opict-auth-'));
  const envFile = join(directory, '.env');
  writeFileSync(envFile, 'TZ=Asia/Seoul\n');

  const output = run(envFile);
  const contents = readFileSync(envFile, 'utf8');

  assert.match(output, /OPIc initial password \(show once\): \S+/);
  assert.match(contents, /^OPICT_APP_PASSWORD_HASH=scrypt\$/m);
  assert.match(contents, /^OPICT_SESSION_SECRET=\S+$/m);
  assert.doesNotMatch(contents, /initial password|show once/i);
  if (process.platform !== 'win32') {
    assert.equal(statSync(envFile).mode & 0o777, 0o600);
  }
});

test('auth initializer refuses to overwrite existing auth values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'opict-auth-'));
  const envFile = join(directory, '.env');
  writeFileSync(envFile, 'OPICT_APP_PASSWORD_HASH=existing\nOPICT_SESSION_SECRET=existing-secret\n');

  assert.throws(() => run(envFile), /already initialized|refusing to overwrite/i);
  assert.equal(readFileSync(envFile, 'utf8'), 'OPICT_APP_PASSWORD_HASH=existing\nOPICT_SESSION_SECRET=existing-secret\n');
});
