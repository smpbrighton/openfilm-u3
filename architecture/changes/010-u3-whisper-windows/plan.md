# Plan: u3-whisper-windows (lite)
Track: lite.

## 검토 목록
- **출처는 ggml-org 공식 Windows 빌드다.** 받는 파일은 `b5454` release 의 `whisper-bin-x64.zip` 이다(8,928,640 bytes, GitHub digest `sha256:6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`). 이 빌드는 `v1.9.5` 와 같은 commit(`d1be6fd`)에서 나왔다. 그래서 Mac 빌드와 버전이 같다. 공개 URL 을 SHA-256 으로 고정해 직접 받는다. 추천: 받아들인다. 이유: Windows ffmpeg 이 같은 방식(공개 zip + SHA-256 고정, `ffmpeg-runtime.mjs` `unzipEntry`)이다. Mac 에서는 MSVC 빌드를 할 수 없다. 대안은 비공개 prerelease 로 다시 올리는 것이었고, 택하지 않았다.
- **CPU 빌드만 넣는다.** BLAS 빌드와 CUDA 빌드는 넣지 않는다. 사용자에게 보이는 동작: Windows 의 「자막 만들기」는 Mac(Metal)보다 느리다. 추천: 받아들인다.
- **MSVC 런타임 의존성.** codex 가 zip 안 exe 와 dll 의 import 표를 검사한다. zip 에 없는 비시스템 DLL(예: `VCRUNTIME140.dll`)이 필요하면 멈추고 보고한다. 그러면 재배포 판단을 사람이 한다.
- **이 Mac 에 Rosetta 2 를 설치한다(`softwareupdate --install-rosetta --agree-to-license`).** NSIS 의 `makensis` 가 x86_64 바이너리라서, Rosetta 가 없으면 이 Mac 에서 Windows 설치 파일을 끝까지 만들지 못한다. 시스템 변경이다. 추천: 설치한다. 이유: CI 첫 실행 전에 설치 파일과 그 안의 whisper 를 이 Mac 에서 확인한다. CI(macos-14)에 Rosetta 가 있는지는 확인하지 않았다. 첫 CI 실행에서 확인된다.
- 미검증으로 남길 것: Windows 실기기에서 실행하는 것.

## 결정
- 사용자: 「검증은 /orca-cli 를 이용해서 codex에게 일임하고 결과확인해서 검토해 그리고, 배포 직전에 나한테 보고해」
- 출시 전 검증에서 Windows 패키지에 whisper-cli 가 없는 것을 찾았다(INTENT 기대 결과 「Mac arm64, Windows x64」). 005 plan 은 「Windows 빌드는 007 CI 뒤 따로 한다」고 미뤘다. 이 변경이 그것을 한다.

## 대조
결정 0003(코어 고치지 않음): 데스크톱 `u3-` 파일과 release 한 줄만 바꾼다. 진행 중인 다른 변경은 없다.

## 바꿀 파일
- `apps/desktop/src/u3-whisper-runtime.mjs`: 타깃 표를 둔다. darwin-arm64 는 지금과 같다. win32-x64 는 공개 zip 하나를 받고 SHA-256 을 검사한다. 그다음 `unzipEntry`(`ffmpeg-runtime.mjs`)로 `whisper-cli.exe`, 필요한 DLL, LICENSE 를 꺼낸다. 받기 실패와 해시 실패에서는 파일을 남기지 않는다. `whisperDownloadable`, `whisperIn` 은 플랫폼별 실행 파일 이름을 쓴다.
- `apps/desktop/src/u3-whisper-runtime.test.mjs`: Windows 사례를 더한다. 가짜 zip 으로 해시 실패, 성공 배치, 필요한 파일 목록을 시험한다. 「Windows 는 찾지 못했다」 단언은 win32-arm64 로 바꾼다.
- `apps/desktop/src/main.mjs`: `runtime/whisper/whisper-cli(.exe)` 를 플랫폼별 이름으로 찾는다(:487–488). 고치는 곳은 한 곳이다.
- `apps/desktop/scripts/release.mjs`: 바꾸지 않는다. 지금도 `whisperDownloadable(platform, arch)` 로 분기한다. 확인만 한다.
- `u3/README.md`: 「Windows 바이너리는 아직 배포하지 않는다」를 출처, 해시, CPU 빌드라는 사실로 바꾼다.

## 순서
1. zip 을 scratch 에 받는다. SHA-256 을 대조한다. 엔트리 목록을 확인하고, `objdump -p` 등으로 import 표를 확인한다. 필요한 DLL 목록을 정한다. 비시스템 의존성이 zip 밖에 있으면 멈추고 보고한다.
2. 테스트를 먼저 쓴다(win32-x64 성공, 해시 실패, 이름).
3. `u3-whisper-runtime.mjs` 와 `main.mjs` 를 구현한다.
4. Rosetta 를 설치한다. 그다음 `pnpm --filter @openfilm/desktop release --platform=win --arch=x64 --official` 로 설치 파일을 끝까지 만든다. `win-unpacked/resources/runtime/whisper` 에 exe, DLL, LICENSE 가 있는지 본다. 설치 파일 이름과 크기를 적는다.
5. Mac 회귀를 확인한다. `release --unsigned` 다음 Mac 앱에서 `runtime/whisper/whisper-cli` 가 그대로 있는지 본다(빌드 재사용 가능).
6. `pnpm run verify`.
7. (이 세션) diff 대조, 병합. 그다음 배포 직전 보고.

구현은 orca-cli 로 codex 에게 맡긴다.

## 리스크
- 가장 위험한 단계는 1이다. 공식 zip 이 MSVC 런타임에 의존하면, 설치는 되지만 실기기에서 실행이 실패할 수 있다. import 표 검사로 막는다. 실기기 확인은 못 한다.
- zip 안 폴더 구조가 버전마다 다를 수 있다. 엔트리 이름을 고정하고 테스트한다.
- 택하지 않은 대안: 비공개 prerelease 로 다시 올리기, BLAS/CUDA 빌드, 앱 첫 실행 때 받기.

## 증명
- `node --test apps/desktop/src/u3-whisper-runtime.test.mjs`: exit 0.
- import 표 검사 출력(증거 파일).
- Windows 설치 파일 빌드 로그, 설치 파일 경로·크기, `win-unpacked` 의 whisper 파일 목록.
- Mac 앱의 `runtime/whisper` 목록.
- `pnpm run verify` 가 exit 0 이고 마지막 줄이 `✓ verify passed`.
- 미검증: Windows 실기기 실행, CI 의 Rosetta.

## 롤백
병합을 revert 한다. 그러면 Windows 앱은 다시 「whisper-cli 를 찾지 못했다」고 알린다. Rosetta 는 남는다(지우지 않는다).
