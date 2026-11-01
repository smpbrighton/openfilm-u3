# Plan: u3-whisper-asr (lite)
Track: lite.

## 검토 목록(다섯 변경 공통, 한 번의 plan 승인)
- **사용자 지시**: 「u3 라이브러리는 기본 활성화, 짤은 24개씩 무한 스크롤, 검색도 24건씩, 마우스 오버로 재생」, 「각각 plan.md까지만 작성하고 구현은 orca-cli로 codex에게 맡기자」. 붙여 넣은 글은 보이지 않아, 앞서 낸 남은 변경 후보 목록으로 가정했다.
- **받은 답**: 새 이름 「u3 Studio」, 범위 「표시 + 앱 정체성」(CLI `openfilm`·`OPENFILM_*`·`~/.openfilm` 은 유지), 피드는 「새 공개 레포」.
- **새 공개 레포를 만든다(007).** 이름은 `smpbrighton/u3-studio-releases`. 설치 파일·피드·서명만 올린다. 추천: 이 이름. 이유: 제품 이름과 맞고 코드는 비공개로 남는다.
- **서명 키와 GitHub secret 은 codex 가 만들지 않는다(007).** 코드는 시험용 키로 시험한다. 실제 Windows minisign 키 생성, 공개키 반영, secret 등록은 병합 뒤 이 세션이 사람 확인을 받고 한다. 이유: 개인키를 에이전트 로그에 남기지 않는다.
- **이름 바꾸기는 번역 문자열을 고치지 않고 `t()` 에서 바꾼다(008).** i18n 5개 언어 약 230줄을 고치면 업스트림 병합 충돌이 커진다(결정 0003). 표시 직전에 "OpenFilm Studio"·"OpenFilm" 을 "u3 Studio" 로 바꾼다. 명령 이름 `openfilm` 과 코드 식별자는 바꾸지 않는다.
- **번들 ID·데이터 폴더가 바뀐다(008).** 앱 데이터 위치가 `~/Library/Application Support/u3 Studio` 가 된다. 아직 배포 전이라 옮길 사용자 데이터가 없다고 본다. `~/.openfilm` 프로젝트 상태는 그대로다.
- **로고 초안은 이 세션이 gpt-image 로 만든다(008).** codex 에게 넘기기 전에 `logo-1024.png` 를 워크트리에 넣는다. 교체할 수 있게 한 파일에서 아이콘을 만든다.
- **임베딩 모델 2.1GB 는 사람이 버튼으로 받는다(006).** 요청 안에서 받지 않는다. 받기 전에는 지금의 규칙 점수다(u3 0004).
- **Windows whisper-cli 는 이번에 만들지 않는다(005).** Mac arm64 정적 빌드만 Release asset 으로 둔다. Windows 빌드는 007 의 CI 가 생긴 뒤 따로 한다. Windows 앱에서 u3 Whisper 는 「whisper-cli 를 찾지 못했다」고 알린다.
- **codex 주간 한도.** 지난 실행에서 5% 미만 경고가 있었다. 한도에 걸리면 그 변경은 멈추고, 남은 일은 장부의 next 로 이어간다.

## 실행 순서와 의존
| 물결 | 변경 | 선행 | 겹치는 파일 |
|---|---|---|---|
| 1 | 004 u3-library-ui | 없음 | `U3LibraryPanel.tsx`, `u3-library.mjs` |
| 1 | 005 u3-whisper-asr | 없음 | `release.mjs`, `main.mjs`, i18n |
| 1 | 007 u3-updates-release | 없음 | `release.mjs`, `desktop.yml` |
| 2 | 006 u3-meme-embed | 004 병합 | 004 와 같은 파일 |
| 2 | 008 u3-rebrand | 005·007 병합 | `release.mjs`, `desktop.yml`, i18n |

물결 1 의 셋을 동시에 띄우고, 병합은 한 번에 하나씩 `worktree.sh finish` 로 한다. 물결 2 는 선행이 병합된 뒤 워크트리를 main 위로 rebase 하고 띄운다.

### 결정
- provider `studio/server/providers/u3-whisper.mjs`: `keyless: true`, `verbs: ['asr']`, `models: { asr: [{ id: 'large-v3-turbo-q5_0', name: 'whisper large-v3-turbo' }] }`, `env: 'OPENFILM_U3_WHISPER_KEY'`, `keysUrl: ''`, 새 필드 `local: true`.
- 실행 파일: `OPENFILM_U3_WHISPER_CLI`, 없으면 PATH 의 `whisper-cli`. 없으면 「whisper-cli 를 찾지 못했다」.
- 모델: u3 와 같은 고정 URL·sha256. `ggml-large-v3-turbo-q5_0.bin`(574,041,195 B, sha256 `394221709c…ffa7e2`), VAD `ggml-silero-v6.2.0.bin`(sha256 `2aa269b785…f7fb6987`). 위치 `~/.openfilm/u3/models/`(`OPENFILM_U3_MODELS` 로 바꿈). 처음 쓸 때 `.part` 이어받기 → 크기·sha256 확인 → rename. 진행은 `ctx.say`. 해시가 다르면 지우고 실패.
- 음성: provider 가 `ctx.root`+`args.src` 를 ffmpeg 로 16 kHz mono pcm wav 로 바꿔 임시 폴더에 둔다(u3 `whisper.ts:47` 과 같다). `ctx.read` 의 48MB 상한을 피한다.
- 인자: u3 와 같다 `-m model -f wav -l ko -sns --vad -vm vad -ml 1 -sow -ojf -of prefix`. JSON segment 하나가 단어 하나. 빈 글과 `[_…_]` 는 버린다. 결과 `index: [{ src, dur, text, words: [{token,start,end}], transcribed: true }]`, `files: []`.
- 「로컬」 표시: provider `local: true` 면 설정 화면은 「키 추가」를 숨기고 안내를 `settings.providers.local`(「이 컴퓨터에서 돌고 키가 필요 없습니다. 파일은 밖으로 나가지 않습니다.」, en·ko)로 바꾼다. `u3-library` 에도 `local: true`. INTENT 열린 질문 「keyless 로컬 provider 표시」의 답이다.
- 데스크톱: `apps/desktop/src/u3-whisper-runtime.mjs`(ffmpeg-runtime 구조: 고정 URL·sha256, 받기, 확인). 바이너리는 비공개 Release `whisper-cli-1.9.5` 의 Mac arm64 정적 빌드(`u3/scripts/build-whisper.sh`, u3 에서 옮김, whisper.cpp v1.9.5 sha256 고정). `release.mjs` 2b 단계가 `runtime/whisper` 로 받고, `main.mjs` 가 `OPENFILM_U3_WHISPER_CLI` 를 넘긴다. 빌드·업로드는 codex 가 이 Mac 에서 한다(비공개 레포).
### 바꿀 파일
`providers/u3-whisper.mjs`(+test, u3 `tests/fixtures/whisper-output.json` 옮김), `providers/index.mjs`(OWN), `providers/contract.mjs`(`local?`), `providers/u3-library.mjs`(`local: true`), 목록 단언 테스트(`index.test.mjs`, `get.test.mjs`, `provider-marks`), `studio/ui/src/lib/providers.ts`, `components/settings/ProvidersSection.tsx`, `lib/provider-marks.ts`, i18n `en.ts`·`ko.ts`, `apps/desktop/src/u3-whisper-runtime.mjs`(+test), `apps/desktop/scripts/release.mjs`, `apps/desktop/src/main.mjs`, `u3/scripts/build-whisper.sh`, `u3/library/README.md` 또는 새 `u3/README.md`(바이너리 출처·라이선스 MIT).
### 증명
- `node --test`: JSON 파싱(fixture), 인자 배열, 가짜 runner 로 run 결과, 모델 해시가 틀리면 거부(막혀야 할 경우), CLI 가 없을 때 문장, 데스크톱 runtime 의 해시 불일치 거부.
- 실제(이 Mac): `say -v Yuna` 로 만든 한국어 10초 음성을 프로젝트에 넣고 `openfilm get asr --via u3-whisper --src <파일>` → `.vtt` 에 한국어 단어와 시각. Studio(Aside)에서 설정 → 서비스 → 음성 인식에 u3 Whisper 선택, 「자막 만들기」로 자막 생성.
- 미검증: Windows.
- `pnpm run verify`.
### 롤백
병합 revert. 받은 모델은 `~/.openfilm/u3/models` 에 남는다.

## 구현에서 달라진 것
- 빌드 스크립트는 u3의 Mac arm64 부분만 옮겼다. Tauri 경로 대신 이 worktree의 `.dev/whisper-build/out/`에 바이너리와 LICENSE를 쓴다. `OPENFILM_U3_BUILD_CACHE`로 위치를 바꾼다.
- 비공개 prerelease `whisper-cli-1.9.5`의 asset은 `whisper-cli-darwin-arm64`(8,033,032 B, SHA-256 `355c1791326a6dda1daebdd6a2b06bf127ad085cf021f5bb021bbbd652bed14b`)와 `LICENSE`(1,078 B, SHA-256 `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`)다. runtime 모듈은 비공개 asset을 `gh`로 받는다. `GH_TOKEN` 또는 `smpbrighton` 계정 인증을 사용하며 토큰을 출력하지 않는다.
- 기존 `extraResources`의 `runtime` 항목이 `runtime/whisper`도 포함하므로 항목을 추가하지 않았다. 다운로드 때 바이너리와 LICENSE의 해시를 확인한다. 앱 시작 때는 실행 파일의 존재를 확인한다. 앱 서명이 Mach-O 바이트를 바꾸기 때문이다. Studio와 데스크톱 에이전트의 `openfilm` 명령 모두 실행 파일 경로를 받는다.
- VAD 크기도 885,098 B로 고정했다. 모델 다운로드가 중단되면 `.part`를 보관하고, 완성된 `.part`는 요청 없이 검사한다. 서버가 Range를 무시하면 처음부터 받는다. 잘못된 Range는 거부한다. 같은 모델 경로의 동시 요청은 받기 작업을 공유한다.
- 파서는 u3의 segment offsets를 사용한다. 빈 항목·유효하지 않은 시각·0 길이 항목과 `[_TT_530]` 같은 특수 토큰도 버린다. 음성은 메모리로 읽지 않고 WAV 파일로 변환한다. WAV 길이는 헤더만 읽어 구한다.
- `get.mjs`와 `captions.mjs`는 수정하지 않았다. 기존 ASR landing·skip·force·Studio transcribe 경로를 그대로 사용한다. `get.test.mjs`에 한국어 VTT·skip·force 통합 검증을 추가했다.
- 실제 검증 모델과 프로젝트는 다른 checkout과 사용자 상태를 건드리지 않도록 이 worktree의 `.dev/u3-whisper-evidence/`에 두었다. 4848 포트가 사용 중이어서 개발 Studio는 64112에서 실행했다. Aside가 4848에서 읽은 것은 인증 오류뿐이며 설정을 바꾸지 않았다. 지정한 Studio에서 로컬 안내·키 없는 재연결·모델 선택·자막 생성을 확인했다.
- Windows 실행과 데스크톱 설치 파일 전체 빌드는 검증하지 않았다. merge·push와 다른 변경의 Jira·wiki 갱신은 이 구현 지시의 범위 밖이므로 수행하지 않는다.
