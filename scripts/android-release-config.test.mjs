import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Android release workflow builds a signed APK from a manual tag input', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/android-release.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /OPICT_ANDROID_KEYSTORE_BASE64/);
  assert.match(workflow, /android-actions\/setup-android@v3/);
  assert.match(workflow, /\.\/gradlew test lint assembleRelease/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /app\/build\/outputs\/apk\/release\/app-release\.apk/);
});

test('Android release signing files stay outside git', () => {
  const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8');

  assert.match(ignore, /android\/keystore\.properties/);
  assert.match(ignore, /android\/keystore\//);
  assert.match(ignore, /\*\.jks/);
});
