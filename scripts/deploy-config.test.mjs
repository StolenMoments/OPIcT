import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('systemd unit pins the production runtime contract', () => {
  const service = read('deploy/opict.service');

  assert.match(service, /WorkingDirectory=\/home\/opc\/opict\/server/);
  assert.match(service, /ExecStart=\/usr\/bin\/node src\/server\.js/);
  assert.match(service, /EnvironmentFile=\/home\/opc\/opict\/\.env/);
  assert.match(service, /Environment=NODE_ENV=production/);
  assert.match(service, /Environment=PORT=3001/);
  assert.match(service, /Environment=HOST=127\.0\.0\.1/);
  assert.match(service, /whisper\.cpp\/build\/bin/);
  assert.match(service, /WantedBy=default\.target/);
});

test('nginx config proxies the app with upload and long-request limits', () => {
  const nginx = read('deploy/nginx/opict.mygreed.shop.conf');

  assert.match(nginx, /server_name opict\.mygreed\.shop/);
  assert.match(nginx, /client_max_body_size 50m/);
  assert.match(nginx, /proxy_pass\s+http:\/\/127\.0\.0\.1:3001/);
  assert.match(nginx, /proxy_read_timeout 300s/);
  assert.match(nginx, /live\/opict\.mygreed\.shop\/fullchain\.pem/);
  assert.match(nginx, /live\/opict\.mygreed\.shop\/privkey\.pem/);
});

test('HTTP bootstrap nginx config exposes the app before certificate issuance', () => {
  const nginx = read('deploy/nginx/opict.mygreed.shop.http.conf');

  assert.match(nginx, /listen 80/);
  assert.match(nginx, /server_name opict\.mygreed\.shop/);
  assert.match(nginx, /proxy_pass\s+http:\/\/127\.0\.0\.1:3001/);
  assert.match(nginx, /proxy_read_timeout 300s/);
  assert.doesNotMatch(nginx, /listen 443/);
});

test('bootstrap script pins the whisper installation and validates its executable', () => {
  const bootstrap = read('scripts/bootstrap-opict.sh');

  assert.match(bootstrap, /sudo dnf install -y ffmpeg cmake/);
  assert.match(bootstrap, /ffmpeg-free/);
  assert.match(bootstrap, /FFMPEG_VERSION="7\.1\.1"/);
  assert.match(bootstrap, /FFMPEG_URL="https:\/\/ffmpeg\.org\/releases\/ffmpeg-\$FFMPEG_VERSION\.tar\.xz"/);
  assert.match(bootstrap, /\.\/configure[\s\S]*make[\s\S]*make install/);
  assert.match(bootstrap, /command -v cmake[\s\S]*sudo dnf install -y cmake/);
  assert.match(bootstrap, /aarch64/);
  assert.match(bootstrap, /v1\.7\.4/);
  assert.match(bootstrap, /WHISPER_BIN="\$WHISPER_ROOT\/build\/bin\/whisper-cli"/);
  assert.match(bootstrap, /WHISPER_MODEL="\$WHISPER_ROOT\/models\/ggml-base\.en\.bin"/);
});

test('remote deploy script validates runtime prerequisites and restarts opict', () => {
  const deploy = read('scripts/deploy-remote.sh');

  assert.match(deploy, /server[\s\S]*npm ci --omit=dev/);
  assert.match(deploy, /web[\s\S]*npm ci/);
  assert.match(deploy, /npm run build/);
  assert.match(deploy, /systemctl --user daemon-reload/);
  assert.match(deploy, /systemctl --user enable opict/);
  assert.match(deploy, /systemctl --user restart opict/);
  assert.match(deploy, /127\.0\.0\.1:3001\/api\/health/);
  assert.match(deploy, /OPICT_APP_PASSWORD_HASH/);
  assert.match(deploy, /OPICT_SESSION_SECRET/);
  assert.match(deploy, /invalid OPICT_APP_PASSWORD_HASH/);
  assert.match(deploy, /journalctl --user -u opict/);
  assert.match(deploy, /trap 'on_exit "\$\?"' EXIT/);
  assert.match(deploy, /home\/opc\/\.local\/bin/);
  assert.match(deploy, /GYP_DEFINES=force_build=1 npm rebuild better-sqlite3/);
  assert.match(deploy, /build\/Release\/better_sqlite3\.node/);
  assert.match(deploy, /prebuilds\/linux-arm64\.node/);
});

test('workflow tests master before deploying and preserves server state during rsync', () => {
  const workflow = read('.github/workflows/deploy.yml');

  assert.match(workflow, /branches: \[master\]/);
  assert.match(workflow, /node-version: ['"]24['"]/);
  assert.match(workflow, /needs: test/);
  assert.match(workflow, /server[\s\S]*npm ci[\s\S]*npm test/);
  assert.match(workflow, /web[\s\S]*npm ci[\s\S]*npm test[\s\S]*npm run build/);
  assert.match(workflow, /--exclude='\.env'/);
  assert.match(workflow, /--exclude='server\/data\/'/);
  assert.match(workflow, /--exclude='server\/node_modules\/'/);
  assert.match(workflow, /--exclude='web\/node_modules\/'/);
  assert.match(workflow, /--exclude='web\/dist\/'/);
});

test('environment example documents the production whisper paths and timezone', () => {
  const envExample = read('.env.example');

  assert.match(envExample, /OPICT_WHISPER_BIN=\/home\/opc\/tools\/whisper\.cpp\/build\/bin\/whisper-cli/);
  assert.match(envExample, /OPICT_WHISPER_MODEL=\/home\/opc\/tools\/whisper\.cpp\/models\/ggml-base\.en\.bin/);
  assert.match(envExample, /OPICT_APP_PASSWORD_HASH=scrypt\$<generate-on-server>/);
  assert.match(envExample, /OPICT_SESSION_SECRET=<generate-on-server>/);
  assert.match(envExample, /TZ=Asia\/Seoul/);
});

test('Linux deployment files use LF line endings', () => {
  for (const relativePath of [
    'scripts/bootstrap-opict.sh',
    'scripts/deploy-remote.sh',
    'deploy/opict.service',
    'deploy/nginx/opict.mygreed.shop.conf',
    'deploy/nginx/opict.mygreed.shop.http.conf',
    '.github/workflows/deploy.yml',
  ]) {
    assert.doesNotMatch(read(relativePath), /\r/);
  }
});
