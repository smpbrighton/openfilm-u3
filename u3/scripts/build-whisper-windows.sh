#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${OPENFILM_U3_BUILD_CACHE:-$ROOT/.dev/whisper-build}"
# llvm-mingw 20260908 / LLVM 23.1.1, native arm64; Wine 10.0, emulated amd64.
# These are platform manifest digests, not mutable tags or index digests.
BUILD_IMAGE='mstorsjo/llvm-mingw@sha256:62d721e7e7651cc2c233beadd9a9ced4d8271a54c2e9c5934ee515329026b57e'
WINE_IMAGE='scottyhardy/docker-wine@sha256:f85db62dca77fe9a2ed10c067113103bf48f0ac7ea12c51c1567662e10b70a8b'
SOURCE_SHA256='ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720'
MODEL_SHA256='be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'

[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'Mac arm64에서만 빌드합니다' >&2; exit 1; }
for tool in docker curl shasum tar; do
  command -v "$tool" >/dev/null || { echo "필요한 도구가 없습니다: $tool" >&2; exit 1; }
done
docker info --format 'Docker server: {{.OSType}}/{{.Architecture}}'
mkdir -p "$CACHE/out"
CACHE="$(cd "$CACHE" && pwd)"
OUT="$CACHE/out"
ARCHIVE="$CACHE/whisper.cpp-v1.9.5.tar.gz"
MODEL="$CACHE/ggml-tiny.bin"

download_verified() {
  local url="$1" path="$2" expected="$3" actual
  if [[ ! -f "$path" ]]; then
    curl -fL --retry 3 "$url" -o "$path.part"
    actual="$(shasum -a 256 "$path.part" | awk '{print $1}')"
    if [[ "$actual" != "$expected" ]]; then
      rm -f "$path.part"
      echo "다운로드 SHA-256 오류: $url ($actual)" >&2
      return 1
    fi
    mv "$path.part" "$path"
  fi
  actual="$(shasum -a 256 "$path" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || { echo "캐시 SHA-256 오류: $path ($actual)" >&2; return 1; }
  printf '%s  %s\n' "$actual" "$path"
}

# Invalidate only this target's old executable; a failed run must not look successful.
rm -f "$OUT/whisper-cli-win32-x64.exe" "$OUT/whisper-cli-win32-x64.exe.sha256"
download_verified 'https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz' "$ARCHIVE" "$SOURCE_SHA256"
# Official models/download-ggml-model.sh host, with main replaced by a pinned revision.
download_verified 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin' "$MODEL" "$MODEL_SHA256"

# Fresh source and CMake state on every run. Keep failed work and logs for diagnosis.
WORK="$(mktemp -d "$CACHE/windows.XXXXXX")"
echo "Windows build evidence: $WORK"
tar -xzf "$ARCHIVE" -C "$WORK"
cp "$MODEL" "$WORK/ggml-tiny.bin"
printf 'Build image (linux/arm64): %s\nWine image (linux/amd64): %s\n' "$BUILD_IMAGE" "$WINE_IMAGE"
docker run --rm -i --platform linux/arm64 --network none \
  --mount "type=bind,source=$WORK,target=/work" --workdir /work \
  --entrypoint bash "$BUILD_IMAGE" -s <<'BUILD' 2>&1 | tee "$WORK/build.log"
set -euo pipefail
export LC_ALL=C
cmake --version
x86_64-w64-mingw32-clang++ --version
cat > /work/mingw-toolchain.cmake <<'TOOLCHAIN'
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)
set(CMAKE_C_COMPILER x86_64-w64-mingw32-clang)
set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-clang++)
set(CMAKE_RC_COMPILER x86_64-w64-mingw32-windres)
set(CMAKE_FIND_ROOT_PATH /opt/llvm-mingw/x86_64-w64-mingw32)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
# v1.9.5 examples/common.cpp uses std::partial_sort without including <algorithm>.
# libc++ 23 does not provide that header transitively; leave the source tar intact.
set(CMAKE_CXX_FLAGS_INIT "-include algorithm")
# -static selects libc++.a, libunwind.a and libwinpthread.a instead of DLL imports.
set(CMAKE_EXE_LINKER_FLAGS_INIT "-static -static-libstdc++ -static-libgcc -Wl,--no-insert-timestamp")
TOOLCHAIN
cmake -S /work/whisper.cpp-1.9.5 -B /work/build -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE=/work/mingw-toolchain.cmake -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF -DGGML_STATIC=ON -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
  -DGGML_SSE42=ON -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_BMI2=ON -DGGML_FMA=ON -DGGML_F16C=ON
cmake --build /work/build --target whisper-cli --parallel "$(nproc)" --verbose
BIN=/work/build/bin/whisper-cli.exe
file "$BIN"
llvm-objdump -p "$BIN" > /work/whisper-cli-win32-x64.objdump.txt
awk '/DLL Name:/ {print $3}' /work/whisper-cli-win32-x64.objdump.txt | sort -fu > /work/whisper-cli-win32-x64.imports.txt
[[ -s /work/whisper-cli-win32-x64.imports.txt ]] || { echo 'DLL import 표가 비었습니다' >&2; exit 1; }
while IFS= read -r dll; do
  case "${dll,,}" in
    kernel32.dll|advapi32.dll|user32.dll|shell32.dll|ole32.dll|oleaut32.dll|ws2_32.dll|bcrypt.dll|ntdll.dll|shlwapi.dll|version.dll|winmm.dll|gdi32.dll|psapi.dll|rpcrt4.dll|ucrtbase.dll|api-ms-win-crt-*.dll) ;;
    *) echo "허용하지 않은 DLL import: $dll" >&2; exit 1 ;;
  esac
done < /work/whisper-cli-win32-x64.imports.txt
cat /work/whisper-cli-win32-x64.imports.txt
echo '✓ Windows system/UCRT import check passed'
BUILD

# A clean prefix prevents a previously installed runtime from masking dependencies.
# Keep AVX2/FMA/F16C/BMI2 enabled even when amd64 emulation cannot execute them.
if docker run --rm -i --platform linux/amd64 --network none \
  --mount "type=bind,source=$WORK,target=/work" --workdir /work \
  --env WINEPREFIX=/tmp/whisper-wine --env WINEARCH=win64 --env WINEDEBUG=-all \
  --env WINEDLLOVERRIDES='mscoree,mshtml=' --entrypoint bash "$WINE_IMAGE" -s <<'SMOKE' 2>&1 | tee "$WORK/wine-smoke.log"
set -euo pipefail
export LC_ALL=C
wine --version
trap 'wineserver -k || true' EXIT
timeout --kill-after=10s 600s xvfb-run -a wine /work/build/bin/whisper-cli.exe \
  -m /work/ggml-tiny.bin -f /work/whisper.cpp-1.9.5/samples/jfk.wav \
  -l en --no-gpu -t 4 -otxt -of /work/jfk-smoke
[[ -s /work/jfk-smoke.txt ]] || { echo 'Wine이 받아쓰기 파일을 만들지 않았습니다' >&2; exit 1; }
cat /work/jfk-smoke.txt
grep -Eiq '\bask[[:space:]]+not\b' /work/jfk-smoke.txt || { echo "Wine 출력에 'ask not'이 없습니다" >&2; exit 1; }
echo "✓ Wine jfk.wav smoke test passed (ask not)"
SMOKE
then
  cp "$WORK/build/bin/whisper-cli.exe" "$OUT/whisper-cli-win32-x64.exe"
  cp "$WORK/whisper-cli-win32-x64.objdump.txt" "$WORK/whisper-cli-win32-x64.imports.txt" "$WORK/wine-smoke.log" "$OUT/"
  shasum -a 256 "$OUT/whisper-cli-win32-x64.exe" | tee "$OUT/whisper-cli-win32-x64.exe.sha256"
else
  echo "Wine 검증에 실패했습니다. ISA는 AVX2/FMA/F16C/BMI2 그대로입니다. 로그: $WORK/wine-smoke.log" >&2
  exit 1
fi
