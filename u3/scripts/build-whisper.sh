#!/usr/bin/env bash
set -euo pipefail

# Ported from u3/scripts/build-whisper.sh. Only the approved Mac arm64 build.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${OPENFILM_U3_BUILD_CACHE:-$ROOT/.dev/whisper-build}"
SOURCE="$CACHE/whisper.cpp-1.9.5"
ARCHIVE="$CACHE/whisper.cpp-v1.9.5.tar.gz"
BUILD="$CACHE/build"
OUT="$CACHE/out"
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'Mac arm64에서만 빌드합니다' >&2; exit 1; }
mkdir -p "$CACHE"
if [[ ! -f "$ARCHIVE" ]]; then
  curl -fL 'https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz' -o "$ARCHIVE"
fi
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"); if(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex")!=="ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720") { console.error("Whisper archive SHA-256 오류"); process.exit(1); }' "$ARCHIVE"
if [[ ! -f "$SOURCE/CMakeLists.txt" ]]; then
  mkdir -p "$SOURCE"
  tar -xzf "$ARCHIVE" --strip-components=1 -C "$SOURCE"
fi
cmake -S "$SOURCE" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON
cmake --build "$BUILD" --config Release --target whisper-cli -j "$(sysctl -n hw.ncpu)"
BIN="$BUILD/bin/whisper-cli"
file "$BIN"
otool -L "$BIN"
if otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/System/Library/|/usr/lib/)' | grep -q .; then
  echo 'whisper-cli has a non-system dylib dependency' >&2
  exit 1
fi
mkdir -p "$OUT"
cp "$BIN" "$OUT/whisper-cli-darwin-arm64"
cp "$SOURCE/LICENSE" "$OUT/LICENSE"
chmod 755 "$OUT/whisper-cli-darwin-arm64"
shasum -a 256 "$OUT/whisper-cli-darwin-arm64" "$OUT/LICENSE"
