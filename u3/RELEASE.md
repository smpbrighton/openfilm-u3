# u3 Studio 릴리스

소스는 비공개 `smpbrighton/openfilm-u3`에 둔다. 설치 파일·업데이트 피드·서명·검증 fragment만 공개 [smpbrighton/u3-studio-releases](https://github.com/smpbrighton/u3-studio-releases)에 올린다. 소스 레포의 `desktop` workflow가 공개를 담당한다. 공개 레포는 README만 준비한 상태다.

## 첫 릴리스 전 준비

실제 키와 GitHub secret은 사람이 등록한다. 이 변경은 실제 키를 만들지 않으며 secret과 variable을 등록하지 않는다. `packages/openfilm/product.official.json`의 `desktop.minisignPublicKey`는 빈 값이다. 빈 키로는 Windows 서명 검증을 통과하지 못한다. workflow도 정상 릴리스의 draft 생성 전에 빈 키를 거부한다. 이름·로고 교체와 번들 리소스의 재배포 권리 확인은 별도 변경이다.

1. 사람이 신뢰하는 Mac에서 `brew install minisign`으로 CLI를 설치한다.
2. 사람이 `minisign -G -p u3-studio-windows.pub -s u3-studio-windows.key`를 실행한다. Windows 전용 키를 생성한다. 암호를 설정한다. Mac 또는 기존 Tauri 앱의 키를 재사용하지 않는다. `-W`는 시험 fixture 전용이다.
3. 사람이 개인키와 암호를 안전한 저장소에 보관한다. 개인키를 레포·채팅·로그·artifact·cache에 넣지 않는다.
4. 사람이 공개키 파일의 두 번째 줄(base64 공개키)을 `desktop.minisignPublicKey`에 반영한다. 공개키 변경을 검토하고 검증한 뒤 빌드한다.
5. 소스 레포에서 보호된 `release` environment를 만든다. 신뢰하는 `v*` tag만 배포하게 제한한다. 필요한 reviewer를 지정한다.
6. `release` environment에 다음 secrets를 등록한다.

| Secret | 값 |
|---|---|
| `U3_WINDOWS_MINISIGN_KEY` | 암호화된 `.key` 파일의 원문 전체다. 추가 base64 포장을 하지 않는다. |
| `U3_WINDOWS_MINISIGN_PASSWORD` | 그 개인키의 암호다. 줄바꿈을 포함하지 않는다. |
| `U3_RELEASES_TOKEN` | 공개 피드 레포에만 Contents 읽기·쓰기를 허용한 fine-grained token이다. 해당 레포에서 workflow가 draft·asset·release를 관리한다. |

7. 기존 `desktop-release` environment에 Mac 서명·공증 secrets를 준비한다. `OPENFILM_SIGN_IDENTITY`, `APPLE_TEAM_ID`, `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`를 사용한다. Mac 공증 절차와 임시 Keychain 삭제는 기존 절차를 유지한다.
8. 소스의 `github.token`이 비공개 라이브러리 asset `library-memes-1`을 읽을 수 있는지 확인한다. 설치 파일 빌드가 이 asset을 받는다. 피드 레포 쓰기 token은 빌드 단계에 전달하지 않는다.

## 정상 릴리스

1. 검증을 통과한 버전 commit에 소스 tag `v<version>`을 만든다. tag 버전은 `apps/desktop/package.json`과 같아야 한다. workflow는 정식 `x.y.z` 버전만 받는다.
2. 소스 tag를 배포하거나 Actions에서 기존 tag를 입력하여 `desktop` workflow를 실행한다. `mac_only`는 끈다.
3. plan job이 소스 tag·commit·공개키를 확인한다. 공개 피드 레포에 draft를 생성한다. draft 본문에는 소스 commit과 `mac_only` 값을 적는다. 이미 공개된 릴리스는 수정하지 않는다.
4. Mac job이 arm64와 x64 앱을 Developer ID로 서명하고 공증한다. 기존 앱·DMG 검증을 유지한다. `mac.fragment.json`이 두 타깃을 묶는다.
5. Windows job이 기존 방식대로 macOS에서 NSIS x64 설치 파일을 만든다. 보호된 `release` environment의 키를 임시 파일에 기록한다. 설치 파일에 plain `.minisig`를 만든다. trusted comment의 `version:<version>`을 서명한다. 개인키는 step 종료 시 삭제한다. `windows.fragment.json`이 설치 파일과 서명을 묶는다.
6. publish job이 두 fragment의 버전·소스 commit·파일 목록·SHA-256을 확인한다. 피드의 SHA-512와 크기, Windows 서명과 서명된 버전도 확인한다. `SHA256SUMS.txt`를 만든다.
7. publish job이 draft에 자산을 업로드한다. 자산을 다시 받아 같은 검증을 실행한다. 실패한 실행의 남은 파일도 확인한다. 모두 통과하면 draft를 latest로 공개한다. 실패하면 이전 latest를 유지한다.

피드 레포의 Git tag는 소스 commit을 가리키지 않는다. 별도 레포이기 때문이다. 소스 commit은 두 fragment와 draft 본문으로 묶는다. 재실행은 같은 tag·소스 commit·`mac_only` 값의 draft만 사용한다. 공개된 릴리스는 새 버전으로 대체한다.

## 긴급 Mac 릴리스

Actions에서 기존 소스 tag와 `mac_only: true`를 지정한다. Mac 두 타깃만 빌드한다. publish job은 Mac fragment만 허용한다. Windows 피드와 설치 파일이 섞이면 공개하지 않는다. 릴리스 노트에 Windows 미포함을 기록한다. Windows 앱은 피드 404를 `unavailable`로 표시한다. 이 릴리스에서는 Windows를 업데이트하지 않는다. 이후 정상 릴리스는 더 높은 버전으로 만든다.

## 피드와 서명

기본 주소는 `https://github.com/smpbrighton/u3-studio-releases/releases/latest/download`다. 타깃별 하위 디렉터리는 없다.

| 타깃 | updater channel | Release asset |
|---|---|---|
| Mac arm64 | `latest-arm64` | `latest-arm64-mac.yml` |
| Mac x64 | `latest-x64` | `latest-x64-mac.yml` |
| Windows x64 | `latest-win-x64` | `latest-win-x64.yml` |

Mac provider가 채널 뒤에 `-mac`을 붙인다. 앱의 beta 선택은 같은 타깃별 `beta-*` 이름을 사용한다. 이번 workflow는 stable 피드만 발행한다. beta 피드가 없으면 업데이트 확인이 `unavailable`로 끝난다. 채널 변경은 downgrade를 허용하지 않는다.

Windows `app-update.yml`에는 `publisherName: ['u3-minisign']` 표식을 넣는다. 인증서 이름이 아니라 electron-updater의 검증 hook을 호출하기 위한 값이다. 앱은 피드의 설치 파일명에 `.minisig`를 붙여 서명을 받는다. 임시 다운로드 경로의 이름은 쓰지 않는다. payload 서명과 trusted comment 서명을 모두 확인한다. 서명된 버전은 `update-available` 버전과 같아야 한다. 오류 문자열에는 URL·호스트 응답·로컬 경로를 넣지 않는다. Mac 업데이트는 기존 Squirrel.Mac 검증을 사용한다.

Tauri의 `.sig`는 minisign 텍스트를 다시 base64로 포장한다. 이 앱의 `.minisig`는 네 줄짜리 원문이다. [minisign 공식 구현](https://github.com/jedisct1/minisign/blob/master/src/minisign.c)의 payload·trusted comment 검증 형식을 따른다.

## 로컬 검증과 남은 확인

`node --test apps/desktop/src/u3-minisign.test.mjs apps/desktop/src/u3-update-verify.test.mjs apps/desktop/src/update-channel.test.mjs apps/desktop/scripts/u3-release.test.mjs`로 보안 경계와 fragment 검증을 실행한다. 시험 fixture는 `apps/desktop/fixtures/u3-minisign/`에 있다. 실제 서명 키가 없으며 앱의 `src/` 패키징에 포함하지 않는다.

Electron 내장 Node에서도 fixture 테스트를 실행해야 한다. Electron의 암호 구현은 시스템 Node와 다르다. 실제 릴리스·Developer ID 공증·Windows 실기기의 이전 버전에서 새 버전으로 업데이트는 실제 키와 secrets 등록 뒤 확인한다. Windows SmartScreen의 첫 설치 경고는 minisign으로 제거되지 않는다. electron-updater는 설치 직전에 파일을 다시 검증하지 않는다. 다운로드 캐시 파일 교체 위협은 결정 0002에 따라 OS 사용자 권한 경계에 맡긴다.
