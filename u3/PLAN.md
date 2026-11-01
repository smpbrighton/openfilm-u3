# openfilm-u3 플랜: 짤방 · 효과음 · 자막

CONCEPT.md 의 방향을 변경 단위로 나눈 계획이다. 구현은 하지 않았다. 변경마다 `/smp:plan lite <slug>` 또는 `/smp:intent <slug>` 로 시작하고, 이 문서의 해당 절을 그 변경의 입력으로 인용한다.

전제: Windows 업데이트 검증은 minisign 으로 할 수 있다(`u3/CHECK-windows-update.md`). 셸은 Electron 을 유지한다.

## 코드를 두는 규칙

- 업스트림 코어(`Timeline.tsx`, `ProjectView.tsx`, `film-doc.mjs`, `captions.mjs`)는 고치지 않는다. 고쳐야 하면 한 곳에 한 줄짜리 등록(import 한 줄, 배열에 항목 하나)만 넣는다.
- 패키지 안에 들어가야 하는 코드(provider, 데스크톱 모듈, Studio 패널)는 업스트림 폴더에 `u3-` 접두어 파일로 둔다. 예: `studio/server/providers/u3-library.mjs`, `apps/desktop/src/u3-minisign.mjs`, `studio/ui/src/components/U3LibraryPanel.tsx`. 접두어가 업스트림 병합 충돌을 막는다.
- 패키지 밖에 둘 수 있는 것(스킬, 자막 페이지 템플릿, 라이브러리 파일, 문서)은 `u3/` 아래에 둔다.
- 새 CLI 동사는 `get.mjs` 의 `VERBS`, `providers/contract.mjs` 의 `Verb` 유니언, `providers/index.mjs` 의 `USE_VERBS` 세 곳에 한 줄씩 추가한다. 그 외 로직은 `u3-` 파일에 둔다.

## 변경 목록과 순서

| 순서 | slug | 트랙 | 내용 | 의존 |
|---|---|---|---|---|
| 0 | `verify-command` | plan 없음 | 검증 명령 하나를 정한다 | 없음 |
| 1 | `u3-library-sfx` | lite | 번들 효과음 라이브러리 provider + Studio 라이브러리 패널 | 0 |
| 2 | `u3-library-memes` | lite | 번들 짤 라이브러리, bge-m3 색인, `meme` 동사, 중복 금지, 짤 스킬 | 1 |
| 3 | `u3-subtitle-clips` | full | 자막을 웹 페이지 클립으로 대체, `.vtt` 가져오기, 자막 스킬 | 0 |
| 4 | `u3-whisper-asr` | lite | whisper.cpp 를 keyless 로컬 `asr` provider 로 | 3 |
| 5 | `u3-updates-release` | lite | minisign 검증기, GitHub Releases 피드, 릴리스 흐름 | 0 |
| 6 | `u3-make-pipeline` | full | 대본 → 장면 → 짤·효과음 → 자막의 결정론적 동사 체인 | 2, 3, 4 |

1 → 2 → 3 → 4 는 제품 순서다. 5 는 독립이며 첫 배포 전에 끝낸다. 6 은 범위가 정해지지 않았으므로 별도 intent 에서 정한다.

---

## 0. `verify-command`

`AGENTS.md` 가 `pnpm run verify` 를 적지만 `package.json` 에 없다. 사람이 정한다.

추천: 루트 `package.json` 에 `"verify": "pnpm typecheck && pnpm test"`. 이유: 두 스크립트가 이미 워크스페이스 전체를 돈다(`pnpm -r`). 정상 출력 마지막 줄은 `pnpm test` 의 요약이다. `.smp/config.toml` 의 `verify` 키도 같은 값으로 푼다.

---

## 1. `u3-library-sfx`

### 결정
- 라이브러리는 코드가 아니라 파일이다. 위치는 `u3/library/sfx/<category>/<name>.wav` 와 사이드카 `u3/library/sfx/index.json`(id, title, category, description, durationSec, license). u3 의 `src/engine/pipeline/library.ts` 가 읽는 구조를 그대로 쓴다. 소스는 u3 `src-tauri/resources/library/sfx`(4.7MB).
- 라이브러리는 provider 다. `providers/u3-library.mjs`, `id: 'u3-library'`, `keyless: true`, `verbs: ['sfx']`. Keenable 이 keyless 선례다. 설정 화면 Providers 에서 한 번 클릭으로 연결한다.
- `sfx` 동사의 의미는 유지한다(`--out --prompt --sec`). 이 provider 는 생성하지 않고 검색한다. `--prompt` 로 index 의 title·category·description 을 점수 매겨 1위를 `assets/audio/sfx/<out>` 에 복사하고 receipt 에 후보 상위 5 를 넣는다. 점수는 u3 `core/sfx.ts` 의 `SCENE_SFX_USES`·`MEME_EMOTION_SFX` 표를 옮긴 규칙 점수다. Jev 재순위는 6 에서 다룬다.
- 라이브러리 위치 탐색: `OPENFILM_U3_LIBRARY` 환경 변수 → 데스크톱 `process.resourcesPath/u3-library` → 레포 `u3/library`. 데스크톱은 `release.mjs` 의 `extraResources` 에 한 항목을 더한다(ffmpeg 와 같은 방식).
- Studio 패널: `components/U3LibraryPanel.tsx`. 미디어 패널(`MediaPool`) 옆 탭 하나. 목록·검색·미리듣기·타임라인으로 끌기. 끌기는 `ResourceDragItem` 을 만들어 기존 `asset-timeline.ts` 의 떨어뜨리기 규칙을 그대로 탄다. 끌어 놓을 때 서버가 파일을 `assets/audio/sfx/` 로 복사한다(새 route `POST /api/u3/library/place`).
- 효과음 트랙 여러 줄은 트랙 종류가 없는 openfilm 모델이 이미 지원한다. 할 일 없음.

### 바꿀 파일
- 새로: `studio/server/providers/u3-library.mjs`(+test), `studio/server/u3-library.mjs`(index 읽기·점수·복사, +test), `studio/ui/src/components/U3LibraryPanel.tsx`, `u3/library/sfx/**`, `u3/library/README.md`(출처·라이선스).
- 한 줄: `providers/index.mjs` 의 `OWN` 배열, `server.mjs` 의 route 등록, `ProjectView.tsx` 의 패널 탭 등록, `apps/desktop/scripts/release.mjs` 의 `extraResources`.

### 증명
- `node --test` 로 provider 가 prompt "놀람" 에 category `shock` 를 1위로 내는 것, `--out` 경로가 `assets/audio/sfx/` 아래인 것.
- Studio 수동: 패널에서 끌어 놓으면 타임라인에 audio 클립이 생기고 재생된다. 같은 파일을 두 트랙에 놓을 수 있다.
- 검증 명령 통과.

### 리스크
- `sfx` 동사의 provider 는 설정에서 하나만 고른다(`use.sfx`). 생성형(ElevenLabs)과 라이브러리를 번갈아 쓰려면 `--via u3-library` 를 쓴다. 스킬에 적는다.

---

## 2. `u3-library-memes`

### 결정
- 라이브러리 파일: `u3/library/memes/<emotion>/<name>.mp4` + `index.json`(u3 `MemeMeta`: id, emotion, situations, description, tagsConfirmed, durationSec, width, height). 소스는 u3 `resources/library/memes`(212MB). 레포 크기 때문에 **git LFS 또는 별도 release asset** 중 하나를 정한다. 추천: 별도 GitHub Release `library-<n>` prerelease 에 두고 빌드 때 받는다. 이유: u3 0033 이 리소스 Release 를 같은 방식으로 두고 있고, 레포 clone 이 가벼워진다.
- 색인: u3 `engine/pipeline/meme-embed.ts` 를 `studio/server/u3-meme-embed.mjs` 로 옮긴다. 벡터 파일(`bge-m3.f32` + `.json`, 8.7MB)은 라이브러리와 함께 배포하므로 **사용자 기기에서 라이브러리 색인을 다시 만들지 않는다**. 질의 임베딩만 기기에서 만든다. 그 모델(`Xenova/bge-m3`, 2.1GB)은 처음 쓸 때 받는다. 받기 전에는 u3 `core/meme-match.ts` 의 규칙 점수로 순위를 정한다(u3 0004 과 같다).
- 의존성: `@huggingface/transformers` 와 `onnxruntime-node` 를 `openfilm` 패키지가 아니라 **데스크톱 앱**에만 넣는다. `npx openfilm` 사용자에게 네이티브 모듈을 강요하지 않기 위해서다. provider 는 모듈이 없으면 규칙 점수로 내려간다.
- 동사 `meme`: `--out --prompt [--reaction] [--n]`. 1위 짤을 `assets/video/memes/<out>.mp4` 에 복사하고 receipt 에 후보·점수를 낸다. 같은 provider `u3-library` 가 `verbs: ['sfx', 'meme']` 로 서빙한다.
- 중복 금지(u3 0013): provider 는 `film.html` 을 읽어 이미 쓰인 짤 id 를 뺀다. `RunContext.root` 로 film 을 읽을 수 있다. `--allow-repeat` 로 풀 수 있다.
- 배치 규칙(u3 0012): 짤은 위쪽 트랙의 작은 클립이다. 클립의 위치·크기는 `film-doc.mjs` 의 `box`(`pictureRect`)로 정한다. 기본은 가운데, 화면 폭 60%. 이 값은 provider 가 아니라 **스킬**이 에이전트에게 지시한다. Studio 패널에서 끌어 놓을 때는 `U3LibraryPanel` 이 `box` 를 채운 클립을 요청한다.
- 스킬 `u3/skills/u3-memes/SKILL.md`: 언제 짤을 넣는지, `openfilm get meme` 사용, 위쪽 트랙·장면 경계·원본 영상마다 하나 이상·중복 금지. 스킬 등록 방식은 3 과 같다(아래).

### 바꿀 파일
- 새로: `studio/server/u3-meme-embed.mjs`(+test), `studio/server/u3-meme-rank.mjs`(규칙 점수·병합, u3 `core/meme-match.ts`·`core/meme-rank.ts` 이식, +test), `u3/skills/u3-memes/`, `u3/library/memes/**` 또는 받기 스크립트 `u3/scripts/fetch-library.mjs`.
- 확장: `providers/u3-library.mjs`(meme 동사), `U3LibraryPanel.tsx`(짤 탭).
- 한 줄: `get.mjs` `VERBS.meme`, `contract.mjs` `Verb`, `index.mjs` `USE_VERBS`, `apps/desktop/package.json` 의존성 두 개.

### 증명
- `node --test`: 규칙 점수가 u3 테스트(`tests/` 의 meme-match)와 같은 결과를 낸다. 색인 파일을 읽어 질의 벡터 없이도 후보를 낸다. 이미 film 에 있는 id 는 후보에서 빠진다.
- 수동: 모델이 없는 상태와 있는 상태에서 각각 `openfilm get meme --prompt "황당함"` 이 파일을 만든다. 데스크톱 빌드에서 onnxruntime 이 로드된다(Mac arm64, Windows x64).
- 검증 명령 통과.

### 리스크
- onnxruntime-node 의 Electron ABI 호환. electron-builder 의 네이티브 모듈 rebuild 가 필요할 수 있다. 1단계에서 데스크톱 빌드로 먼저 확인한다.
- 212MB 라이브러리의 재배포 권리. `u3/library/README.md` 에 출처를 적고 확인되지 않은 항목은 뺀다.

---

## 3. `u3-subtitle-clips` (full)

CONCEPT.md 의 결정("자막을 웹 페이지 클립으로 만든다")을 따른다. full 신호: 새 구성 요소가 여럿이고 인스펙터 UX(CONCEPT 「확인하지 못한 것」 2)가 미정이다. `/smp:intent u3-subtitle-clips` 로 시작한다. 아래는 intent·spec 에 넣을 재료다.

### 설계 초안
- 자막 한 줄(메인·서브 포함)은 페이지 클립 하나다. 페이지는 템플릿 `u3/pages/subtitle.html` 하나이고 프로젝트에 복사된다(`scenes/u3-subtitle.html`). 모든 자막 클립이 같은 페이지를 `src` 로 쓴다.
- 클립마다 다른 값(메인 글, 서브 글, 강조 단어, 등장 효과, 색·크기 재정의)은 **component props** 로 둔다. openfilm 은 페이지 클립의 `data-props` 와 override 로 이 기능을 이미 갖는다(`studio/ui/src/lib/component-props.ts`: text·image·boolean·var). 인스펙터가 props 를 편집한다. 이것이 「확인하지 못한 것」 2 의 답 후보다. spec 단계에서 Studio 에서 실제로 열어 확인한다.
- 레이어(u3 0016): 레이어 = 스타일이 다른 템플릿 복사본(`scenes/u3-subtitle-main.html`, `-sub.html`). 레이어 스타일(폰트·크기·색·자막바)은 그 페이지의 CSS 변수다. `type: 'var'` props 로 Studio 에서 바꾼다. 트랙은 레이어마다 하나다. 트랙에 종류가 없으므로 강제는 스킬과 패널이 한다.
- 강조 `*단어*`(u3 0028): 페이지 스크립트가 텍스트 prop 을 파싱해 `<em>` 으로 그린다. 등장 효과(튀어나옴·떠오름·흔들림 0.3초)는 `frame(t)` 에서 클립 로컬 시간으로 그린다. CONCEPT 의 "추정" 을 spec 단계에서 `openfilm look` 으로 실측한다.
- 폰트: Pretendard·G마켓 산스·티몬체(u3 `assets/fonts`)를 `u3/pages/fonts/` 에 두고 프로젝트에 복사한다. 라이선스 파일을 함께 둔다. `project-fonts.mjs` 가 프로젝트 폰트를 다루므로 거기 규칙을 따른다.
- `.vtt` 가져오기: 새 동사 `subtitles`(`--src <transcript.vtt> [--layer main|sub]`). 결정론이다. transcript 의 cue 를 `subtitle-segments.mjs` 규칙으로 자르고 cue 마다 페이지 클립을 film.html 에 추가한다. 이 동사는 provider 가 아니라 Studio 서버 안의 로컬 작업이다(`studio/server/u3-subtitles.mjs`). `get.mjs` 의 provider 선택을 타지 않도록 `VERBS` 에 `local: true` 같은 분기를 한 줄로 둔다. 대안: `openfilm u3 subtitles` 별도 하위 명령. spec 에서 정한다. 추천은 `get` 안의 로컬 동사다. 이유: 에이전트가 배우는 명령 체계가 하나로 유지된다.
- 기존 Studio 자막(overlay·`.film/subtitles.json`)은 지우지 않는다. 자막 클립이 하나라도 있으면 `subtitles.json` 의 `on` 을 `false` 로 둔다. 번역·내보내기(SRT) 같은 기존 기능은 자막 클립에서는 동작하지 않는다. intent 의 영향 범위에 적는다.
- 스킬: `u3/skills/u3-subtitles/SKILL.md`(대본·말투·성격 프롬프트, 전역 자막 지침, 클립 배치 규칙). u3 0037 의 원격 기본 프롬프트는 가져오지 않는다. 스킬 파일이 그 역할이다.
- 스킬 등록: openfilm 의 스킬 소스는 project·mine·official 셋이고 official 은 `packages/openfilm/skills` 를 업스트림에서 통째로 복사한다(`scripts/sync-skills.mjs`). u3 스킬을 거기 두면 sync 가 지운다. 선택지: (a) `src/skills.mjs` 에 네 번째 소스 `u3` 를 추가하고 `u3/skills` 를 읽는다, (b) 데스크톱 앱 시작 때 `mine` 폴더에 복사한다. 추천 (a). 이유: `npx openfilm` 과 데스크톱 양쪽에서 같은 경로로 동작하고 변경이 `SKILL_SOURCES` 한 줄과 경로 함수 하나다. 패키지 `files` 에 `u3/skills` 경로를 더한다.

### 증명(spec 에서 확정)
- `openfilm look scenes/u3-subtitle.html 0.15` 가 등장 효과 중간 프레임을 그린다.
- `openfilm get subtitles --src assets/vo/1.vtt` 뒤 film.html 의 페이지 클립 수가 cue 수와 같다. 두 번 실행해도 같은 결과다(결정론).
- Studio 에서 클립을 고르면 인스펙터에 메인·서브·강조·효과 props 가 보이고 고치면 미리보기에 반영된다.
- 내보낸 mp4 의 한 프레임과 미리보기 프레임을 비교한다(CONCEPT 「확인하지 못한 것」 4 의 실측).

---

## 4. `u3-whisper-asr`

### 결정
- provider `providers/u3-whisper.mjs`, `id: 'u3-whisper'`, `keyless: true`, `verbs: ['asr']`. 기존 「자막 만들기」 버튼(`ProjectView.tsx` → `POST subtitles/transcribe` → `use.asr` 의 provider)은 바꾸지 않는다. 설정에서 이 provider 를 `asr` 로 고르면 버튼이 그대로 동작한다. 이것이 「확인하지 못한 것」 3 의 답이다. 화면에서 keyless provider 가 어떻게 보이는지는 Keenable 로 지금 확인할 수 있다.
- 실행 파일: whisper.cpp `whisper-cli` 정적 빌드(Mac Metal, Windows CPU). 데스크톱은 `release.mjs` 2b 단계에서 ffmpeg 와 같이 `runtime/whisper` 에 넣는다. 새 모듈 `apps/desktop/src/u3-whisper-runtime.mjs` 는 `ffmpeg-runtime.mjs` 의 구조(핀 고정 sha256, 받기, PATH)를 따른다. 소스 빌드 사용자는 PATH 의 `whisper-cli` 를 쓴다.
- 모델 `ggml-large-v3-turbo-q5_0.bin`(574MB)은 앱에 넣지 않는다. 처음 `asr` 를 부를 때 `~/.openfilm/u3/models/` 에 받는다. provider 의 `say` 로 진행을 알린다.
- 출력: `-ml 1 -sow` 로 단어 시각을 받아 openfilm 의 transcript 형식(WebVTT, 단어 timestamp 태그)으로 쓴다. `transcripts.mjs` 의 `writeTranscript` 가 받는 형식에 맞춘다. 언어는 `--language` 옵션, 기본 `ko`.

### 바꿀 파일
- 새로: `providers/u3-whisper.mjs`(+test), `apps/desktop/src/u3-whisper-runtime.mjs`(+test), `u3/docs/whisper-build.md`(정적 빌드 절차, u3 0007 에서 옮김).
- 한 줄: `providers/index.mjs` `OWN`, `release.mjs` 2b 단계.

### 증명
- `node --test`: whisper 출력 샘플을 transcript VTT 로 바꾸는 순수 함수 테스트.
- 수동: 10초 한국어 녹음에 「자막 만들기」 → 자막이 생긴다. Windows x64 에서도 같다.

### 리스크
- whisper.cpp 바이너리 재배포와 빌드 재현. u3 가 이미 두 플랫폼 빌드를 갖는다(`architecture/changes/049-windows-build`). 그 산출물을 release asset 으로 재사용한다.

---

## 5. `u3-updates-release`

근거는 `u3/CHECK-windows-update.md` 다.

### 결정
- `apps/desktop/src/u3-minisign.mjs`: minisign 서명 파일 파서와 Ed25519·Blake2b-512 검증. Node `crypto` 만 쓴다. u3 `scripts/release.sh` 의 Python 파서를 옮긴다.
- `apps/desktop/src/u3-update-verify.mjs`: `verifyUpdateCodeSignature` 구현. 피드 URL + `<설치파일명>.minisig` 를 받아 검증하고 trusted comment 의 버전을 `update-available` 의 버전과 비교한다. 실패 사유 문자열을 돌려준다(URL 을 포함하지 않는다. `update-controller.mjs` 의 로그 규칙).
- `updates.mjs`: `autoUpdater.verifyUpdateCodeSignature = …` 한 줄. 공개키는 `product.official.json` 의 `desktop.minisignPublicKey` 에 둔다(빌드에 들어가는 파일이다).
- `release.mjs`: Windows `publish[0]` 에 `publisherName: ['u3-minisign']`. 피드 URL 은 `product.official.json` 의 `desktop.updates` 를 `https://github.com/smpbrighton/<repo>/releases/latest/download` 로 바꾼다.
- `update-channel.mjs`: 채널 이름을 타깃별로 만든다. generic provider 는 `${channel}.yml` 을 읽고 Mac 에서만 `-mac` 을 뒤에 붙인다(electron-updater 6.8.9 `providers/Provider.js` `getCustomChannelName`). 그래서 Windows 는 `latest-win-x64` → `latest-win-x64.yml`, Mac 은 `latest-arm64` → `latest-arm64-mac.yml` 이다. `desktop.yml` 171-173행의 이름 바꾸기 중 Windows 는 이미 맞고 Mac 은 `latest-mac-arm64.yml` 이므로 `latest-arm64-mac.yml` 로 고친다. redirect 서버 없이 GitHub flat asset 을 읽는다.
- 릴리스 흐름: `.github/workflows/desktop.yml` 을 u3 0033 으로 옮긴다. draft → Mac·Windows 두 job → Windows job 이 설치 파일을 minisign 서명(개인키는 보호된 environment secret) → publish job 이 두 fragment 를 확인하고 draft 를 공개. `--mac-only` 는 workflow input 으로 둔다. Mac 공증은 openfilm 흐름을 그대로 쓴다(이미 Developer ID·notarytool).
- Mac 업데이트 검증은 바꾸지 않는다.

### 바꿀 파일
- 새로: `apps/desktop/src/u3-minisign.mjs`(+test, fixture 는 `brew install minisign` 으로 만든 서명 파일), `apps/desktop/src/u3-update-verify.mjs`(+test, 가짜 fetch).
- 수정: `updates.mjs`(1줄), `update-channel.mjs`(채널 이름 함수), `release.mjs`(publisherName, 피드), `product.official.json`, `.github/workflows/desktop.yml`.

### 증명
- `node --test`: 올바른 서명 통과, 바이트 하나 바꾼 파일 거부, 다른 키 거부, trusted comment 버전 불일치 거부. 보안 경계 변경이므로 **막혀야 할 경우가 막히는 테스트**를 먼저 둔다.
- Windows 실기기: 이전 버전 설치 → 서명된 새 버전으로 업데이트 성공, 서명을 깨뜨린 피드로는 `error` 상태.
- Electron 내장 Node 에서 `blake2b512`·`ed25519` 를 쓰는 것을 데스크톱 테스트로 확인한다.

### 리스크
- 설치 파일 이름이 `OpenFilm-Setup-<arch>.exe` 로 버전을 갖지 않는다. 릴리스마다 같은 이름이므로 `.minisig` 도 같은 이름이다. `releases/latest/download` 가 최신 릴리스를 가리키므로 문제는 없으나, 다른 버전의 서명 파일과 섞이는 것을 trusted comment 의 버전 비교가 막는다.
- 공개·배포 전에 이름·로고를 바꿔야 한다(`TRADEMARK.md`). 이 변경에는 넣지 않는다. 별도 변경 `u3-rebrand` 로 둔다.

---

## 6. `u3-make-pipeline` (full, 나중)

범위를 정하지 않았다(CONCEPT 「확인하지 못한 것」 5). intent 에서 정할 것:
- 입력(영상·대본)에서 장면 나누기 → `meme` → `sfx` → `subtitles` 를 잇는 결정론적 체인을 어디에 둘 것인가. 후보: `openfilm get make` 로컬 동사, 또는 스킬이 에이전트에게 순서를 지시. CONCEPT 의 결정은 "에이전트에 맡기지 않는다" 이므로 로컬 동사가 추천이다.
- Jev 재순위(짤·효과음 적합도). Jev 키는 provider 로 들어간다(`providers/u3-jev.mjs`, `verbs` 없음, 다른 provider 가 설정에서 키를 읽음). 키 저장소는 `keys.mjs` 의 `providers.json` 이다.
- TTS·음성 분리는 세 가지 핵심 밖이다. 넣지 않는다.

---

## 사람이 정할 것

| 항목 | 추천 | 이유 |
|---|---|---|
| 검증 명령 | `pnpm typecheck && pnpm test` | 둘 다 워크스페이스 전체를 이미 돈다 |
| 짤 라이브러리 212MB 위치 | 별도 GitHub Release asset, 빌드 때 받기 | u3 0033 과 같고 clone 이 가볍다 |
| bge-m3·onnxruntime 의존성 위치 | 데스크톱 앱에만 | `npx openfilm` 에 네이티브 모듈을 강요하지 않는다 |
| u3 스킬 등록 | `skills.mjs` 에 네 번째 소스 `u3` | 한 줄 변경, CLI·앱 동일 동작 |
| `.vtt` 가져오기 명령 형태 | `openfilm get subtitles` 로컬 동사 | 에이전트가 배우는 명령 체계가 하나 |
| 코드 접두어 규칙 | 패키지 안은 `u3-` 파일, 밖은 `u3/` | CONCEPT 의 "u3 전용 파일은 u3/" 를 패키지 제약과 함께 지킨다 |
