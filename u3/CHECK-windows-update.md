# 확인: Windows 업데이트 검증에 minisign 을 끼울 수 있는가

CONCEPT.md 「확인하지 못한 것」 1번의 답이다. 결론은 **끼울 수 있다** 이고, 셸 선택(Electron 유지)은 바뀌지 않는다.

## 결론

- electron-updater 는 minisign 을 직접 지원하지 않는다. Windows 검증의 기본 구현은 PowerShell `Get-AuthenticodeSignature` 로 코드 서명을 본다.
- 그러나 검증 함수는 공개 속성이다. `autoUpdater.verifyUpdateCodeSignature` 에 우리 함수를 넣으면 다운로드한 설치 파일을 그 함수가 검증한다. 반환이 `null` 이면 통과, 문자열이면 거부(`ERR_UPDATER_INVALID_SIGNATURE`)다.
- 조건이 하나 있다. 빌드 산출물 `app-update.yml` 에 `publisherName` 이 있어야 그 함수가 불린다. 없으면 검증을 건너뛴다. 지금 openfilm 의 Windows 빌드는 코드 서명이 없고 `publisherName` 도 없다. 즉 **현재 Windows 업데이트는 HTTPS 와 `latest.yml` 의 sha512 만으로 받는다.**
- `publisherName` 은 코드 서명 인증서 없이도 넣을 수 있다. electron-builder 가 `publish[0].publisherName` 값을 그대로 `app-update.yml` 에 쓴다. 값은 표식 문자열이면 된다. 기본 검증기를 쓰지 않으므로 실제 서명자 이름과 맞을 필요가 없다.

따라서 u3 방식(minisign 공개키를 앱에 넣고 릴리스 파일을 개인키로 서명)을 Electron 에서 그대로 쓸 수 있다. Mac 은 Squirrel.Mac 이 Developer ID 서명을 검증하므로 그대로 둔다.

## 근거

확인한 버전은 레포가 쓰는 것과 같다. `apps/desktop/package.json` 은 `electron-updater 6.8.9`, `electron-builder 26.15.3` 이다.

electron-updater 6.8.9 (`npm pack electron-updater@6.8.9`, `package/out/NsisUpdater.js`):

| 위치 | 내용 |
|---|---|
| `NsisUpdater.js:16` | 기본 검증기는 `windowsExecutableCodeSignatureVerifier.verifySignature` (PowerShell) |
| `NsisUpdater.js:22-29` | `verifyUpdateCodeSignature` getter/setter. 타입 `(publisherName: string[], path: string) => Promise<string \| null>` |
| `NsisUpdater.js:52-56` | 다운로드 직후 `verifySignature(destinationFile)` 를 부른다. 문자열이 오면 임시 폴더를 지우고 `ERR_UPDATER_INVALID_SIGNATURE` 를 던진다 |
| `NsisUpdater.js:84-99` | `app-update.yml` 의 `publisherName` 이 `null` 이면 `null` 을 반환한다(검증 없음). 있으면 배열로 만들어 `_verifyUpdateCodeSignature` 에 넘긴다 |
| `AppUpdater.js:565` | 다운로드에 `latest.yml` 의 `sha512` 를 넘긴다. 파일 해시는 별도로 검사한다 |

electron-builder 26.15.3 (`npm pack app-builder-lib@26.15.3`):

| 위치 | 내용 |
|---|---|
| `out/publish/PublishManager.js:193-208` | `app-update.yml` 은 `publish[0]` 설정에 `updaterCacheDirName` 을 더한 것이다. Windows 에서 `publisherName` 이 없고 `win.verifyUpdateCodeSignature !== false` 이면 서명 인증서에서 이름을 구한다. 인증서가 없으면 `publisherName` 은 들어가지 않는다 |
| `scheme.json:451` | publish 설정에 `publisherName: string[] \| null` 이 있다 |
| `scheme.json:8792` | `win.verifyUpdateCodeSignature` (기본 `true`) |

이 레포:

| 위치 | 내용 |
|---|---|
| `apps/desktop/scripts/release.mjs:31` | "Not code-signed yet (no Windows certificate)" |
| `apps/desktop/scripts/release.mjs:180` | `publish: [{ provider: 'generic', url: FEED, channel: 'latest' }]` — `publisherName` 없음 |
| `apps/desktop/src/updates.mjs:48-50` | `autoUpdater` 에 채널만 설정한다. 검증기를 바꾸지 않는다 |
| `.github/workflows/desktop.yml:171-173` | 타깃마다 피드 파일 이름을 바꿔 GitHub Release 에 올린다(`latest.yml` → `latest-win-x64.yml`). `openfilm.dev/download/…` 가 거기로 redirect 한다 |

u3 (`/Volumes/X31/workspace/smp_workspace/u3`):

| 위치 | 내용 |
|---|---|
| `architecture/decisions/0021-auto-update.md` | tauri-plugin-updater, minisign 키, 공개키는 설정 파일에, 피드 `releases/latest/download/latest.json` |
| `architecture/decisions/0033-release-flow.md` | Windows 설치 파일을 minisign 서명, trusted comment 에 버전, draft → 두 플랫폼 확인 → 공개, `--mac-only` |
| `scripts/release.sh:52-55` | minisign 서명 파일 파서(Python) |

minisign 검증에 필요한 원시 연산은 Node 내장 `crypto` 에 있다. 이 Mac 의 Node 24 에서 `blake2b512` 해시와 `ed25519` 키를 확인했다. Electron 44 내장 Node 에서는 구현 단계의 시험으로 다시 확인한다. 이 Mac 에 `minisign` CLI 는 없다(시험 fixture 를 만들 때 `brew install minisign` 이 필요하다).

## 설계 방향(구현은 PLAN.md)

1. `release.mjs` 의 Windows `publish[0]` 에 `publisherName: ['u3-minisign']` 를 넣는다. `app-update.yml` 에 표식이 생겨 검증기가 불린다.
2. `updates.mjs` 에서 `autoUpdater.verifyUpdateCodeSignature` 를 u3 검증기로 바꾼다. 검증기는 다운로드한 `.exe` 와 같은 이름의 `.minisig` 를 피드에서 받아 앱에 넣은 공개키로 검증한다. trusted comment 의 버전이 `update-available` 의 버전과 다르면 거부한다.
3. 피드는 `smpbrighton` 계열 public 레포의 GitHub Releases 다. generic provider 는 `${url}/${channel}.yml` 을 읽으므로 타깃별 채널 이름(`latest-win-x64`, `beta-win-x64`, Mac 은 `latest-arm64` → 파일 `latest-arm64-mac.yml`)으로 flat asset 을 읽는다. redirect 서버가 필요 없다.
4. Mac 은 바꾸지 않는다.

## 남은 위험

- electron-updater 7 / electron-builder 27(master 브랜치)은 `publisherName` 이 없으면 업데이트를 거부(fail-closed)하고, 기본 검증기는 DN 형식 이름만 받는다. 우리 검증기는 이름을 쓰지 않으므로 영향이 없다. 업그레이드 때 `win.verifyUpdateCodeSignature` 와 표식 값만 다시 본다.
- 6.8.9 의 `doInstall` 은 설치 직전에 다시 검증하지 않는다. 다운로드 폴더의 파일이 바뀌는 위협은 OS 사용자 권한 경계에 맡긴다. u3 (tauri-plugin-updater) 도 다운로드 시점에 검증한다.
