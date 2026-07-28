#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH env var must be set}"

if [[ "$DEPLOY_PATH" != "/home/opc/opict" ]]; then
  echo "DEPLOY_PATH must be /home/opc/opict for the OPIc production unit" >&2
  exit 1
fi

cd "$DEPLOY_PATH"
export PATH="/home/opc/.local/bin:/home/opc/tools/whisper.cpp/build/bin:$PATH"

on_exit() {
  local exit_code="$1"
  if [[ "$exit_code" -eq 0 ]]; then
    return
  fi
  echo "OPIc deployment failed with exit code $exit_code" >&2
  systemctl --user status opict --no-pager || true
  journalctl --user -u opict -n 100 --no-pager || true
}
trap 'on_exit "$?"' EXIT

if [[ ! -f .env ]]; then
  echo "Missing .env at $DEPLOY_PATH/.env" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' .env
}

whisper_bin="$(read_env_value OPICT_WHISPER_BIN)"
whisper_model="$(read_env_value OPICT_WHISPER_MODEL)"

if [[ -z "$whisper_bin" || ! -x "$whisper_bin" ]]; then
  echo "Missing executable OPICT_WHISPER_BIN: ${whisper_bin:-<unset>}" >&2
  exit 1
fi
if [[ -z "$whisper_model" || ! -f "$whisper_model" ]]; then
  echo "Missing file OPICT_WHISPER_MODEL: ${whisper_model:-<unset>}" >&2
  exit 1
fi

for command_name in node npm curl systemctl journalctl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
done
for cli_name in claude codex agy; do
  if ! command -v "$cli_name" >/dev/null 2>&1; then
    echo "Required AI CLI is missing: $cli_name" >&2
    exit 1
  fi
done

cd "$DEPLOY_PATH/server"
npm ci --omit=dev

prepare_better_sqlite3() {
  local module_dir="$DEPLOY_PATH/server/node_modules/better-sqlite3"
  local native_binding="$module_dir/build/Release/better_sqlite3.node"
  local arm64_prebuild="$module_dir/prebuilds/linux-arm64.node"

  if node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();" >/dev/null 2>&1; then
    return
  fi

  if [[ "$(uname -m)" != "aarch64" ]]; then
    echo "better-sqlite3 could not load its native binding outside the supported OCI ARM host" >&2
    exit 1
  fi

  echo "Rebuilding better-sqlite3 for the OCI host glibc and ARM runtime."
  (
    cd "$module_dir"
    GYP_DEFINES=force_build=1 npm rebuild better-sqlite3 --foreground-scripts
  )

  if [[ ! -f "$native_binding" ]]; then
    echo "better-sqlite3 source build did not produce $native_binding" >&2
    exit 1
  fi

  install -m 0755 "$native_binding" "$arm64_prebuild"
  node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();"
}

prepare_better_sqlite3

cd "$DEPLOY_PATH/web"
npm ci
npm run build

unit_dir="$HOME/.config/systemd/user"
unit_path="$unit_dir/opict.service"
mkdir -p "$unit_dir"
install -m 0644 "$DEPLOY_PATH/deploy/opict.service" "$unit_path"
systemctl --user daemon-reload
systemctl --user enable opict
systemctl --user restart opict
systemctl --user status opict --no-pager

health_url="http://127.0.0.1:3001/api/health"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "$health_url"; then
    echo
    echo "OPIc health check passed."
    exit 0
  fi
  sleep 1
done

echo "OPIc health check failed: $health_url" >&2
exit 1
