# Plan: u3-release-arm64-only (lite)
Track: lite.

## Context
지금 정상 릴리스는 Mac arm64·Mac x64·Windows x64 세 대상을 공개 피드 레포 `smpbrighton/u3-studio-releases` 에 올린다. 사용자는 Intel Mac 을 지원하지 않기로 했다. 이 변경 뒤 릴리스에는 Mac arm64 와 Windows x64 두 대상만 올라간다. Mac x64 앱에는 원래 로컬 whisper 바이너리도 없다(`whisperDownloadable` 은 darwin-arm64 만 참).

## 검토 목록
- **공개 릴리스에서 Mac x64(Intel) 를 뺀다.** 사용자에게 보이는 동작: 릴리스 페이지에 Mac 설치 파일은 Apple Silicon 용 `.dmg`·`.zip` 만 있다. Intel Mac 사용자는 받을 설치 파일이 없다. 아직 공개 릴리스가 한 번도 없어서 기존 Intel 설치본은 없다. 추천: 받아들인다.
- **publish 단계는 Mac x64 피드(`latest-x64-mac.yml`)나 x64 설치 파일이 섞여 있으면 공개하지 않는다.** 지금 `checkRelease` 의 「Unexpected release asset」 검사가 이 경우를 막는다. 테스트로 고정한다. 추천: 받아들인다.
- **로컬 빌드 명령의 `--arch=x64`(Mac)는 남긴다.** `apps/desktop/scripts/release.mjs` 는 업스트림 파일이고(결정 0003), 공개 피드와 관계없다. 추천: 받아들인다.
- 결정 파일은 만들지 않는다. 지원 대상 범위는 INTENT 「제약」에 한 줄로 적는다.

## 결정
- 사용자: 「Mac Intel(x64)은 고려하지 않을거고. window 64랑 mac arm 이렇게 두개만 있으면 돼 하려던 lite 진행하고 순차적으로 진행해」.
- 순서: 013(병합 완료) → 010 B단계(진행 중) → 이 변경. 이 변경은 010 과 파일이 겹치지 않는다. 병합은 010 뒤에 한다.

## 대조
- 결정 0011(Windows minisign 검증): Windows 경로는 바꾸지 않는다.
- 결정 0003: u3 릴리스 파일(`u3-release.mjs`, `desktop.yml` 의 u3 job, `u3/RELEASE.md`)만 바꾼다.
- 010 은 `apps/desktop/src/u3-whisper-runtime.mjs`·`main.mjs`·`u3/README.md` 를 바꾼다. 겹치지 않는다.

## 바꿀 파일
- `.github/workflows/desktop.yml`: Mac job 의 `for arch in arm64 x64` 를 arm64 하나로 바꾼다. step 이름 「Build and notarize both Mac targets」를 「the Mac arm64 target」으로 바꾼다.
- `apps/desktop/scripts/u3-release.mjs` `platformAssets`: mac 채널은 `['latest-arm64-mac.yml']` 하나다. suffix 는 `arm64` 다.
- `apps/desktop/scripts/u3-release.test.mjs`: fixture 대상에서 `x64-mac` 을 뺀다. 새 테스트: 업로드 폴더에 `latest-x64-mac.yml` 과 x64 `.dmg` 가 있으면 `checkRelease` 가 실패한다(정상·mac_only 둘 다).
- `apps/desktop/src/update-channel.mjs` 주석·`update-channel.test.mjs`: 채널 이름 규칙은 그대로다(바꾸지 않음). 확인만 한다.
- `u3/RELEASE.md`: Mac job 설명(「arm64와 x64」→ arm64), 피드 표에서 Mac x64 행 삭제, 「긴급 Mac 릴리스」의 「Mac 두 타깃」→「Mac arm64」, Intel 미지원 한 줄.
- `architecture/INTENT.md` 「제약」: 「공개 릴리스 대상은 Mac arm64 와 Windows x64 다. Intel Mac 은 지원하지 않는다.」

## 순서
1. 테스트를 먼저 고친다(x64 섞임 거부 테스트 추가, fixture 에서 x64 제거). 실패를 확인한다.
2. `u3-release.mjs`, `desktop.yml` 을 고친다.
3. 문서 두 개를 고친다.
4. `node --test apps/desktop/scripts/u3-release.test.mjs`, workflow YAML 파싱 확인(`node -e` 로 js-yaml load), `pnpm typecheck`.
5. `pnpm run verify`.
6. (이 세션) diff 대조, 010 병합 뒤 병합.

구현은 orca-cli 로 codex 에게 맡긴다.

## 리스크
- 가장 위험한 단계는 workflow 수정이다. 실제 실행은 tag push 때만 검증된다. YAML 파싱과 diff 대조로 막는다. 실제 실행은 첫 릴리스에서 확인된다.
- 택하지 않은 대안: x64 를 빌드만 하고 올리지 않기(시간 낭비), `release.mjs` 에서 Mac x64 를 막기(업스트림 파일 변경).

## 증명
- `node --test apps/desktop/scripts/u3-release.test.mjs`: 수정 전 새 테스트 실패, 수정 후 exit 0.
- `desktop.yml` YAML 파싱 성공 출력과 Mac job 의 arch 목록.
- `pnpm run verify` 가 exit 0 이고 마지막 줄이 `✓ verify passed`.
- 미검증: GitHub Actions 실제 실행(첫 tag push 때 확인).

## 롤백
병합을 revert 한다. 공개 릴리스가 없으므로 되돌릴 데이터는 없다.

## 구현에서 달라진 것
- 사용자 지시에 따라 이 worktree에서 구현·검증·커밋까지만 수행한다. 순서 6의 병합은 이 작업에서 수행하지 않는다. 결과는 지정한 외부 보고서에 남긴다.
