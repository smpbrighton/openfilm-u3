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

## 구현에서 달라진 것
- 공개 게이트를 시험할 수 있도록 `apps/desktop/scripts/u3-release.mjs`와 `.test.mjs`를 추가했다. 두 플랫폼 fragment의 버전·소스 commit·파일 목록·해시, 피드의 해시·크기, Windows 서명·서명된 버전을 확인한다. 업로드한 자산을 다시 받아 공개 전에 같은 검증을 실행한다.
- 시험 fixture는 `apps/desktop/fixtures/u3-minisign/`에 둔다. `src/`를 복사하는 설치 파일에 시험 fixture가 들어가지 않게 했다. 시험 개인키는 보관하지 않는다.
- Windows job에 Electron fixture 검증 게이트를 추가했다. 로컬 macOS의 Electron 44.9.3 내장 Node 24.22.0은 Ed25519를 지원하지만 `blake2b512`를 지원하지 않는다. 시스템 Node의 대상 테스트 18건은 통과했지만 Electron 테스트는 11건 중 4건 실패했다. `ED` 지원 증명은 미충족이다. 현재 workflow는 정상 릴리스 공개를 차단한다. Node `crypto`만 허용한 결정에 따라 대체 해시 구현이나 의존성은 추가하지 않았다.
- 공개 레포 `smpbrighton/u3-studio-releases`와 README는 이어받은 시점에 이미 있었다. 공개 상태·설명·README를 확인했으며 다시 만들거나 수정하지 않았다.
- 이번 구현은 이 worktree에서만 수행한다. 사용자 지시에 따라 병합·소스 레포 push·다른 worktree 수정은 수행하지 않는다. 실제 키 생성·공개키 반영·secret 등록·실제 릴리스·Windows 실기기 검증은 수행하지 않는다.

## 결정 대체(세션 검토)
- 사용자 답: 「legacy Ed 서명 사용」. Electron 내장 Node 에 `blake2b512` 가 없어 `ED`(prehash) 를 앱에서 검증할 수 없다(codex 실측, Electron 테스트 11건 중 4건 실패).
- 결정 0002 를 0011 으로 대체한다. 릴리스는 `minisign -S -l` 로 서명하고, 앱은 `Ed` 만 받고 `ED` 는 거부한다. Node 내장 Ed25519 만 쓴다.
- 증명 추가: `ELECTRON_RUN_AS_NODE=1` 로 돌린 minisign·업데이트 검증 테스트가 모두 통과한다. `ED` 서명은 거부된다(막혀야 할 경우).

