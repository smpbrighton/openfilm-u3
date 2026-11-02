# u3 Studio

u3 Studio는 MIT 라이선스의 OpenFilm을 기반으로 만든 앱이다. OpenFilm 프로젝트와 제휴 관계가 없다. 업스트림의 라이선스와 `TRADEMARK.md` 고지는 유지한다.

## 로컬 음성 인식

Studio에서 u3 Whisper를 연결하고 서비스의 음성 인식 모델을 선택한다. API 키가 필요 없다. 프로젝트 음성은 이 컴퓨터에서 처리한다.

CLI는 연결 후 프로젝트 폴더에서 실행한다.

```sh
openfilm get asr --via u3-whisper --src assets/voice.wav
```

`OPENFILM_U3_WHISPER_CLI`로 실행 파일을 지정한다. 지정하지 않으면 PATH의 `whisper-cli`를 찾는다. Mac arm64 데스크톱 설치 파일은 실행 파일을 포함한다. Windows 바이너리는 아직 배포하지 않는다. 실행 파일이 없으면 `whisper-cli 를 찾지 못했다`고 알린다.

첫 실행에서 아래 모델을 받는다. 기본 위치는 `~/.openfilm/u3/models/`이며 `OPENFILM_U3_MODELS`로 바꾼다. 중단된 `.part`는 이어받는다. 크기와 SHA-256이 맞아야 사용한다. 음성 파일은 모델 다운로드 서버로 보내지 않는다.

| 모델 | 출처 | 크기 | SHA-256 |
|---|---|---|---|
| `ggml-large-v3-turbo-q5_0.bin` | [whisper.cpp 모델](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin) | 574,041,195 B | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` |
| `ggml-silero-v6.2.0.bin` | [whisper-vad](https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin) | 885,098 B | `2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987` |

## whisper-cli 출처와 배포

- 소스: [whisper.cpp v1.9.5](https://github.com/ggml-org/whisper.cpp/tree/v1.9.5), MIT.
- 소스 tar SHA-256: `ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720`.
- 빌드: `bash u3/scripts/build-whisper.sh`. u3의 스크립트에서 Mac arm64 부분을 옮겼다. 정적 라이브러리와 Metal shader를 내장하고 시스템 dylib 이외 의존성이 없는지 검사한다.
- 결과: `.dev/whisper-build/out/whisper-cli-darwin-arm64`, `LICENSE`. `OPENFILM_U3_BUILD_CACHE`로 빌드 위치를 바꾼다.
- 비공개 배포: [smpbrighton/openfilm-u3 · whisper-cli-1.9.5](https://github.com/smpbrighton/openfilm-u3/releases/tag/whisper-cli-1.9.5)의 prerelease asset 두 개다. 저장소 공개 범위를 바꾸지 않는다.
- 바이너리 SHA-256: `355c1791326a6dda1daebdd6a2b06bf127ad085cf021f5bb021bbbd652bed14b`.
- LICENSE SHA-256: `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`.

Windows x64 빌드는 같은 v1.9.5 소스 tar와 SHA-256을 사용한다. Mac arm64에서 Docker를 실행한 뒤 `bash u3/scripts/build-whisper-windows.sh`를 실행한다. Docker 서버는 Linux 컨테이너와 amd64 에뮬레이션을 지원해야 한다.

- 빌드 이미지: [llvm-mingw 20260908](https://github.com/mstorsjo/llvm-mingw/tree/20260908), LLVM 23.1.1, UCRT. `mstorsjo/llvm-mingw@sha256:62d721e7e7651cc2c233beadd9a9ced4d8271a54c2e9c5934ee515329026b57e`를 `--platform linux/arm64`로 실행한다. digest는 arm64 manifest를 고정한다.
- 빌드 옵션: CMake toolchain이 `x86_64-w64-mingw32-clang(++)`와 Windows x86_64 타깃을 지정한다. Release `whisper-cli`만 빌드한다. `BUILD_SHARED_LIBS=OFF`, `GGML_STATIC=ON`, `GGML_OPENMP=OFF`, `GGML_NATIVE=OFF`, `WHISPER_BUILD_TESTS=OFF`, `WHISPER_BUILD_SERVER=OFF`를 사용한다. 링크 옵션은 `-static -static-libstdc++ -static-libgcc -Wl,--no-insert-timestamp`다. libc++·libunwind·winpthread는 정적 라이브러리를 사용한다. 교차 빌드에서도 `GGML_SSE42`, `GGML_AVX`, `GGML_AVX2`, `GGML_BMI2`, `GGML_FMA`, `GGML_F16C`를 명시적으로 켠다. 실행 CPU는 AVX2·BMI2·FMA·F16C를 지원해야 한다.
- libc++ 23 호환: v1.9.5의 `examples/common.cpp`가 `std::partial_sort`에 필요한 `<algorithm>`을 직접 포함하지 않는다. C++ 컴파일 옵션 `-include algorithm`으로 헤더를 포함한다. 소스 파일은 수정하지 않는다.
- import 검사: `llvm-objdump -p`로 Windows 시스템 DLL의 명시적 허용 목록과 `api-ms-win-crt-*.dll`·`ucrtbase.dll`만 허용한다. UCRT는 Windows 10 이상에 기본 포함된다. `libc++`, `libunwind`, `libwinpthread`, `libgomp`, `VCRUNTIME*`, `MSVCP*` 등 목록 밖 DLL은 모두 실패다.
- smoke test 이미지: [docker-wine](https://github.com/scottyhardy/docker-wine)의 Wine 10.0(`stable-10.0-20260111`)을 `scottyhardy/docker-wine@sha256:f85db62dca77fe9a2ed10c067113103bf48f0ac7ea12c51c1567662e10b70a8b`와 `--platform linux/amd64`로 고정한다. Wine 11.0은 이 Mac의 QEMU에서 초기화 중 `anon_mmap_fixed` assertion으로 실패했다. 새 Wine prefix에서 소스의 `samples/jfk.wav`를 받아쓴다. 모델은 소스의 `models/download-ggml-model.sh`에 있는 공식 호스트의 [ggml tiny](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin)다. revision과 SHA-256 `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`을 고정한다. 실행 종료 코드가 0이고 받아쓰기 파일에 `ask not`이 있어야 통과한다. 실패해도 ISA를 낮추지 않는다.
- 결과: 두 검사를 통과하면 `.dev/whisper-build/out/whisper-cli-win32-x64.exe`를 만들고 SHA-256을 출력한다. 같은 폴더에 `.exe.sha256`, `.objdump.txt`, `.imports.txt`, `wine-smoke.log`를 남긴다. 매번 새 소스·빌드 폴더를 `.dev/whisper-build/windows.XXXXXX`에 만들고 `build.log`, `wine-smoke.log`, 받아쓰기 파일을 보관한다. `.dev/`는 git에서 제외한다. `OPENFILM_U3_BUILD_CACHE`로 캐시 위치를 바꾼다.

데스크톱 release 단계는 `u3-whisper-runtime.mjs`로 두 asset을 받아 각각 해시를 확인한다. 비공개 asset에는 `gh`의 `smpbrighton` 인증 또는 `GH_TOKEN`이 필요하다. `runtime/whisper`의 실행 파일과 MIT LICENSE가 기존 `extraResources`의 `runtime` 항목으로 앱에 들어간다. 설치 후 바이너리를 받지 않는다.

단어 시각과 한국어 옵션은 u3의 `whisper.ts`, `transcript.ts`에서 옮겼다. 테스트 fixture는 u3의 `tests/fixtures/whisper-output.json`에서 가져왔다.

## 앱 아이콘

원본은 `apps/desktop/build/logo-1024.png`다. `icon.png`는 원본의 복사본이다. `icon-dev.png`는 같은 원본에 파란색 `(0.12, 0.40, 1.0)`을 30% 혼합한다. `apps/desktop/build/dev-icon.swift`가 alpha 값을 유지하며 만든다.

```sh
cp apps/desktop/build/logo-1024.png apps/desktop/build/icon.png
swift apps/desktop/build/dev-icon.swift apps/desktop/build/logo-1024.png apps/desktop/build/icon-dev.png
node apps/desktop/scripts/make-ico.mjs
```

macOS의 각 iconset에는 `sips -z`로 16·32·128·256·512 px와 각 크기의 `@2x` PNG를 넣는다. `iconutil --convert icns --output apps/desktop/build/icon.icns <icon.iconset>`으로 release 아이콘을 만든다. dev iconset도 같은 방법으로 `icon-dev.icns`로 변환한다. Studio와 chat은 11–34 px 크기에 맞춘 흰색 u3와 `#FFB020` 재생 삼각형 SVG를 공유한다.
