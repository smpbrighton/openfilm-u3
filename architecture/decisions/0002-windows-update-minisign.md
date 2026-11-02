# 0002 데스크톱 업데이트는 electron-updater 에 GitHub Releases 피드와 minisign 검증을 연결한다

Status: superseded-by 0011
Origin: 커밋 abb112e 의 u3/CONCEPT.md 「방향 결정」 표(사람이 작성). 검증 가능 여부는 커밋 855540d 의 u3/CHECK-windows-update.md 로 확인했다
Source: apps/desktop/src/updates.mjs apps/desktop/scripts/release.mjs

## 맥락
openfilm 의 Windows 빌드는 코드 서명이 없고 `app-update.yml` 에 `publisherName` 이 없다. 그래서 지금 Windows 업데이트는 HTTPS 와 `latest.yml` 의 sha512 만으로 받는다. u3 는 minisign 서명으로 업데이트를 검증한다.

electron-updater 6.8.9 는 minisign 을 직접 지원하지 않는다. 그러나 `autoUpdater.verifyUpdateCodeSignature` 가 공개 속성이고, `app-update.yml` 에 `publisherName` 이 있으면 다운로드 직후 그 함수를 부른다(`NsisUpdater.js` 22-29, 52-56, 84-99행). electron-builder 26.15.3 은 `publish[0].publisherName` 을 인증서 없이 그대로 `app-update.yml` 에 쓴다(`PublishManager.js` 193-208행).

## 결정
- Windows `publish[0]` 에 표식 `publisherName: ['u3-minisign']` 를 넣는다.
- `autoUpdater.verifyUpdateCodeSignature` 를 u3 검증기로 바꾼다. 검증기는 설치 파일의 `.minisig` 를 피드에서 받아 앱에 넣은 공개키로 검증한다. trusted comment 의 버전이 업데이트 버전과 다르면 거부한다. 검증은 Node `crypto` 의 Ed25519 와 Blake2b-512 로 한다.
- 피드는 smpbrighton 계열 GitHub Releases 의 `releases/latest/download` 다. 타깃별 채널 이름으로 flat asset 을 읽는다.
- 릴리스 흐름은 u3 와 같다. draft, 두 플랫폼 확인, 공개 순서이고 긴급 `--mac-only` 가 있다.
- Mac 은 Squirrel.Mac 의 Developer ID 서명 검증을 그대로 쓴다.

## 결과
- 코드 서명 인증서 없이 Windows 업데이트를 서명 검증한다.
- electron-updater 7 은 `publisherName` 이 없으면 업데이트를 거부한다. 표식이 있으므로 영향이 없다. 업그레이드 때 표식과 `win.verifyUpdateCodeSignature` 를 다시 확인한다.
- 6.8.9 의 `doInstall` 은 설치 직전에 다시 검증하지 않는다. 다운로드 폴더의 파일 교체 위협은 OS 사용자 권한 경계에 맡긴다.
