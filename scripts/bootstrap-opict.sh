#!/usr/bin/env bash
set -Eeuo pipefail

readonly WHISPER_VERSION="v1.7.4"
readonly WHISPER_ROOT="/home/opc/tools/whisper.cpp"
readonly WHISPER_BIN="$WHISPER_ROOT/build/bin/whisper-cli"
readonly WHISPER_MODEL="$WHISPER_ROOT/models/ggml-base.en.bin"

if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "OPIc bootstrap requires aarch64; found $(uname -m)" >&2
  exit 1
fi

sudo dnf install -y ffmpeg cmake git gcc-c++ make

if [[ -x "$WHISPER_BIN" && -f "$WHISPER_MODEL" ]]; then
  echo "Existing whisper.cpp binary and model found; preserving installation."
  exit 0
fi

mkdir -p "$(dirname "$WHISPER_ROOT")"

if [[ ! -e "$WHISPER_ROOT" ]]; then
  git clone --branch "$WHISPER_VERSION" --depth 1 \
    https://github.com/ggerganov/whisper.cpp.git "$WHISPER_ROOT"
elif [[ ! -d "$WHISPER_ROOT/.git" ]]; then
  echo "Existing whisper.cpp directory is not a git checkout; refusing to replace it: $WHISPER_ROOT" >&2
  exit 1
fi

if [[ ! -x "$WHISPER_BIN" ]]; then
  cmake -S "$WHISPER_ROOT" -B "$WHISPER_ROOT/build" \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON
  cmake --build "$WHISPER_ROOT/build" --config Release --parallel "$(nproc)"
fi

if [[ ! -f "$WHISPER_MODEL" ]]; then
  (
    cd "$WHISPER_ROOT"
    bash models/download-ggml-model.sh base.en
  )
fi

if [[ ! -x "$WHISPER_BIN" ]]; then
  echo "whisper-cli was not built at $WHISPER_BIN" >&2
  exit 1
fi

if [[ ! -f "$WHISPER_MODEL" ]]; then
  echo "Whisper model was not downloaded to $WHISPER_MODEL" >&2
  exit 1
fi

echo "Whisper installation is ready: $WHISPER_BIN"
