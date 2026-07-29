#!/usr/bin/env bash
set -Eeuo pipefail

readonly WHISPER_VERSION="v1.7.4"
readonly WHISPER_ROOT="/home/opc/tools/whisper.cpp"
readonly WHISPER_BIN="$WHISPER_ROOT/build/bin/whisper-cli"
readonly WHISPER_MODEL="$WHISPER_ROOT/models/ggml-small.en.bin"
readonly FFMPEG_VERSION="7.1.1"
readonly FFMPEG_ROOT="/home/opc/tools/ffmpeg-$FFMPEG_VERSION"
readonly FFMPEG_BIN="/home/opc/.local/bin/ffmpeg"
readonly FFMPEG_URL="https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"

if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "OPIc bootstrap requires aarch64; found $(uname -m)" >&2
  exit 1
fi

build_ffmpeg_from_source() {
  echo "Building FFmpeg $FFMPEG_VERSION from the official source archive."
  mkdir -p "$(dirname "$FFMPEG_ROOT")" "/home/opc/.local/bin"

  if [[ ! -d "$FFMPEG_ROOT" ]]; then
    curl -fsSL "$FFMPEG_URL" -o "/tmp/ffmpeg-$FFMPEG_VERSION.tar.xz"
    tar -xJf "/tmp/ffmpeg-$FFMPEG_VERSION.tar.xz" -C "$(dirname "$FFMPEG_ROOT")"
    rm -f "/tmp/ffmpeg-$FFMPEG_VERSION.tar.xz"
  fi

  if [[ ! -x "$FFMPEG_BIN" ]]; then
    (
      cd "$FFMPEG_ROOT"
      ./configure \
        --prefix=/home/opc/.local \
        --disable-debug \
        --disable-doc \
        --disable-ffplay \
        --disable-ffprobe \
        --disable-x86asm
      make --jobs "$(nproc)"
      make install
    )
  fi
}

export PATH="/home/opc/.local/bin:$PATH"

if ! sudo dnf install -y ffmpeg cmake git gcc-c++ make; then
  echo "ffmpeg is unavailable in the configured repositories; trying Oracle Linux's ffmpeg-free package."
  if ! sudo dnf install -y ffmpeg-free cmake git gcc-c++ make; then
    build_ffmpeg_from_source
  fi
fi

if ! command -v cmake >/dev/null 2>&1; then
  sudo dnf install -y cmake
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is not available after package/source installation." >&2
  exit 1
fi

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
    bash models/download-ggml-model.sh small.en
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
