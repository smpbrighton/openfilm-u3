# Plan: u3-rebrand (lite)
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
- 이름은 한 곳: `apps/desktop/src/flavor.mjs` 의 `productName` 을 `u3 Studio`(Preview·Dev·Bench 는 접미사), `bundleId` 를 `ai.brightongroup.u3studio`(+`.preview`/`.dev`/`.bench`). Studio UI 는 `studio/ui/src/lib/brand.ts`(new) 의 `PRODUCT = 'u3 Studio'`.
- 표시 문구: `i18n/index.ts` 의 `t()` 가 값을 돌려주기 전에 `OpenFilm Studio` → `u3 Studio`, 단어 `OpenFilm` → `u3 Studio` 로 바꾼다. 명령 `openfilm`(소문자), 경로·환경 변수는 건드리지 않는다. chat 의 locales 도 같은 방식. 하드코딩: `SettingsModal.tsx` 의 `OpenFilm ${version}`, 창 제목 html 5곳, `release.mjs` 의 `NAME`·`appId`·`productName`·exe 정보·NSIS 바로가기·산출물 이름(`u3-Studio-Setup-x64.exe`), `desktop.yml` 릴리스 제목, `apps/desktop/package.json` `productName`.
- 링크: 설정의 `github.com/openfilm/openfilm`, `openfilm.dev` 는 「OpenFilm 기반」 안내 한 줄로 바꾼다(MIT 고지는 유지).
- 로고: 이 세션이 만든 `apps/desktop/build/logo-1024.png` 에서 `icon.icns`·`icon.ico`·`icon.png`·`icon-dev.*` 를 만든다(`scripts/make-ico.mjs`, `iconutil`). `BrandLogo.tsx` 두 벌과 shell favicon 을 새 SVG 마크로.
- 유지: CLI `openfilm`, npm 이름, `OPENFILM_*`, `~/.openfilm`, `skills/openfilm`(agent-skills 의 이름 판정이 이 단어에 기대고 있다).
### 바꿀 파일
`apps/desktop/src/flavor.mjs`(+test), `apps/desktop/scripts/release.mjs`, `apps/desktop/package.json`, `apps/desktop/build/*`, `apps/desktop/shell/index.html`, `apps/desktop/src/failed.html`·`installing.html`, `packages/openfilm/studio/ui/index.html`, `studio/ui/src/lib/brand.ts`(new), `studio/ui/src/i18n/index.ts`(+test), `components/BrandLogo.tsx`, `components/settings/SettingsModal.tsx`, `apps/desktop/chat/src/components/BrandLogo.tsx`, chat i18n 진입점, `.github/workflows/desktop.yml`, `TRADEMARK` 안내 `u3/README.md`.
### 증명
- `node --test`: `t()` 치환(「OpenFilm Studio」, 「OpenFilm」, `openfilm` 명령은 그대로), flavor 이름·번들 ID.
- dev 앱 스크린샷: 메뉴 막대·창 제목·설정 버전 줄·로고가 u3 Studio. 화면 문구에 남은 「OpenFilm」 검색 결과를 보고서에 붙인다.
- `pnpm run verify`.
### 롤백
병합 revert. 데이터 폴더 이름이 되돌아가므로 그 사이 dev 앱 설정은 새 폴더에 남는다.
