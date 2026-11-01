# Plan: u3-updates-release (lite)
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
- 결정 0002 그대로. `apps/desktop/src/u3-minisign.mjs`: minisign 공개키·서명 파서, `Ed`(원본)·`ED`(Blake2b-512 prehash) 둘 다, trusted comment 서명 검증, Node `crypto` 만.
- `apps/desktop/src/u3-update-verify.mjs`: `verifyUpdateCodeSignature` 구현. 피드에서 `<설치 파일>.minisig` 를 받아 검증하고 trusted comment 의 `version:` 이 업데이트 버전과 같아야 한다. 실패 문장에 URL 을 넣지 않는다.
- `updates.mjs`: Windows 에서 검증기 교체 한 줄. 공개키는 `product.official.json` 의 `desktop.minisignPublicKey`(이번에는 빈 값, 빈 값이면 업데이트를 받지 않는다 — fail-closed).
- `release.mjs`: Windows `publish[0]` 에 `publisherName: ['u3-minisign']`. 피드 `https://github.com/smpbrighton/u3-studio-releases/releases/latest/download`. `update-channel.mjs` 는 타깃별 채널(`latest-win-x64`, Mac `latest-arm64` → `latest-arm64-mac.yml`).
- `.github/workflows/desktop.yml`: 레포 조건을 `smpbrighton/openfilm-u3` 로. u3 0033 흐름: draft(피드 레포) → Mac·Windows job → Windows 설치 파일 minisign 서명(environment secret `U3_WINDOWS_MINISIGN_KEY`·`_PASSWORD`) → publish job 이 두 fragment 확인 후 공개. `mac_only` input. 피드 레포 쓰기는 secret `U3_RELEASES_TOKEN`. Mac 공증은 지금 흐름.
- 새 공개 레포 `smpbrighton/u3-studio-releases` 를 `gh repo create --public` 으로 만든다(README 한 장).
### 바꿀 파일
`apps/desktop/src/u3-minisign.mjs`(+test), `u3-update-verify.mjs`(+test, 가짜 fetch), `updates.mjs`, `update-channel.mjs`(+test), `scripts/release.mjs`, `packages/openfilm/product.official.json`, `.github/workflows/desktop.yml`, `u3/RELEASE.md`(new: 키 만들기·secret 등록·릴리스 절차).
### 증명
- `node --test`(막혀야 할 경우 먼저): 올바른 서명 통과, 바이트 하나 바꾼 파일 거부, 다른 키 거부, 버전 불일치 거부, 깨진 서명 파일 거부, 공개키 빈 값이면 거부. 시험 키는 `minisign`(brew) 로 만든 fixture.
- Electron 내장 Node 에서 `blake2b512`·`ed25519` 확인(dev 앱 또는 `ELECTRON_RUN_AS_NODE=1` 로 실행).
- `actionlint` 로 workflow 검사(있으면).
- 미검증: 실제 릴리스와 Windows 실기기 업데이트(키·secret 등록 뒤).
- `pnpm run verify`.
### 롤백
병합 revert. 공개 레포는 남는다(지우기는 사람 확인).
