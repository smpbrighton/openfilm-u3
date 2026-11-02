# 007-u3-updates-release 구현 보고서

## 상태

이 worktree의 대상 테스트·typecheck·architecture lint·전체 verify가 통과했다. plan의 Electron `ED` 지원 증명은 충족하지 못했다. 배포 준비 완료로 보고하지 않는다.

로컬 macOS의 Electron 44.9.3 내장 Node 24.22.0은 Ed25519 검증을 통과했지만 `blake2b512`를 지원하지 않았다. Electron fixture 테스트 11건 중 4건이 실패했다. Node `crypto`만 사용하는 plan에서는 대체 해시 구현을 추가할 수 없어 이 제약을 유지했다. Windows job의 Electron 검증 게이트도 유지했다. Windows 실기기 결과는 확인하지 않았다.

작업 경로는 `/Volumes/X31/workspace/smp_workspace/openfilm-u3-007-u3-updates-release`다. 브랜치는 `007-u3-updates-release`다. 기존 커밋을 다시 작성하지 않았다. 이번 이어받기에서는 구현 코드와 테스트를 변경하지 않았다.

## 커밋

아래 커밋을 유지했다. 마지막 `2316b13`이 이번 이어받기의 추가 커밋이다.

```text
b7e3486 007-u3-updates-release: plan
09525b2 test(desktop): define minisign update rejection cases
59a8e5f feat(desktop): verify Windows updates with minisign
d2242e3 feat(release): gate public desktop releases on platform fragments
c7e654d fix(release): block installers when Electron cannot verify signatures
2316b13 docs(release): Electron prehash 배포 차단과 검증 결과를 기록한다
```

기존 `09525b2`가 실패 사례를 구현 전에 커밋한 테스트다. 이번 추가 커밋은 `Co-Authored-By: Codex <noreply@openai.com>`으로 끝난다.

## 구현과 차이

- 기존 구현은 Windows minisign payload·trusted comment·버전 검증, 빈 공개키 거부, 타깃별 flat 피드, draft 생성·플랫폼 fragment 확인·공개 게이트를 포함한다.
- plan의 파일 목록에 없던 `apps/desktop/scripts/u3-release.mjs`와 `.test.mjs`가 fragment·피드·서명·업로드 자산 재검증을 담당한다. 기존 커밋의 변경이다.
- fixture는 설치 파일의 `src/`에 포함하지 않도록 `apps/desktop/fixtures/u3-minisign/`에 둔다. 시험 개인키는 없다.
- Electron `ED` 검증 실패를 `u3/RELEASE.md`에 명시했다. 키와 secrets 등록만으로 배포 차단을 해제할 수 없다. 대체 해시 구현과 새 의존성은 추가하지 않았다.
- `plan.md`에 「구현에서 달라진 것」을 추가했다.
- 이어받은 `architecture/INTENT.md`의 변경 후보 행 삭제를 확인하고 커밋했다. 이번 변경이 답하는 Windows 업데이트 관련 열린 질문은 현재 INTENT에 없었다. 다른 열린 질문은 유지했다.
- 공개 레포 `smpbrighton/u3-studio-releases`와 한 페이지 README는 이미 있었다. PUBLIC 상태·설명·피드 안내를 조회했다. 레포를 다시 만들거나 수정하지 않았다.

## 검증 명령

별도 표기가 없으면 worktree 루트에서 실행했다. 같은 코드에 대해 전체 verify는 마지막에 한 번 실행했다. 문서 수정 후 architecture lint와 `git diff --check`를 다시 확인했다.

| 명령 | 종료 코드 | 요약 |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | Done in 3.5s using pnpm v9.15.9; lockfile unchanged |
| `node --test apps/desktop/src/u3-minisign.test.mjs apps/desktop/src/u3-update-verify.test.mjs apps/desktop/src/update-channel.test.mjs apps/desktop/scripts/u3-release.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `ELECTRON_RUN_AS_NODE=1 pnpm exec electron --test src/u3-minisign.test.mjs src/u3-update-verify.test.mjs` (`apps/desktop`에서) | 1 | tests 11, pass 7, fail 4; Digest method not supported |
| `pnpm typecheck` | 0 | openfilm, shared, desktop: Done |
| `python3 /Volumes/X31/workspace/smp_workspace/smp-plugins/plugins/smp/scripts/lint-architecture.py .` | 0 | architecture 검사 통과: decisions 9건 accepted. |
| `.dev/u3-updates-evidence/actionlint/actionlint -verbose .github/workflows/desktop.yml` | 0 | Found total 0 errors; shellcheck and pyflakes unavailable |
| `minisign -V -p apps/desktop/fixtures/u3-minisign/test.pub -m apps/desktop/fixtures/u3-minisign/installer.bin -x apps/desktop/fixtures/u3-minisign/prehashed.minisig` | 0 | Signature and comment signature verified |
| `minisign -V -p apps/desktop/fixtures/u3-minisign/test.pub -m apps/desktop/fixtures/u3-minisign/installer.bin -x apps/desktop/fixtures/u3-minisign/legacy.minisig` | 0 | Signature and comment signature verified |
| `pnpm run verify` | 0 | openfilm 1555건(1550 통과·5 skip), shared 20건 통과, desktop 422건(419 통과·3 skip); fail 0; ✓ verify passed |
| `git diff --check` | 0 | 공백 오류가 없다. |

`pnpm install --frozen-lockfile`은 첫 실행 명령이었다. 잠금 파일은 바뀌지 않았다. actionlint는 기존 증거 폴더의 1.7.12 실행 파일을 사용했다. `shellcheck`와 `pyflakes`가 없어 해당 외부 검사만 비활성 상태였다. 검사 오류는 0건이었다.

Electron crypto 점검 결과는 다음과 같다. 점검 명령 자체의 종료 코드는 0이다. `blake2b512: false`는 지원 실패를 뜻한다.

```json
{"electron":"44.9.3","node":"24.22.0","ed25519":true,"blake2b512":false}
```

## verify tail

종료 코드는 0이다. 총 1,997건 중 1,989건이 통과했고 8건을 건너뛰었다. 실패는 0건이다. 이 verify는 시스템 Node에서 실행하며, 별도 Electron 실패를 대체하지 않는다.

```text
✔ Quit waits for Studio then re-enters without another shutdown, failure=false (0.128292ms)
✔ Quit waits for Studio then re-enters without another shutdown, failure=true (0.06075ms)
✔ a first launch has the defaults; a saved state comes back; odd values are made sensible (2.509916ms)
✔ a window off every display comes back centered, keeping its size (0.141833ms)
✔ Windows app registrations retain custom folders, quoted paths, spaces and non-ASCII names (2.064291ms)
✔ registrations expand environment paths without treating uninstall commands as locations (0.25675ms)
✔ the registrations are read in the background: the look answers at once, with what was read last (0.240417ms)
✔ registrations older than their age are read again while the old ones are still answered (0.186625ms)
✔ a key that is missing, unreadable or too slow leaves out only its own apps (0.1385ms)
✔ only Windows has the registrations read (0.05525ms)
✔ the first reading is waited for however long it takes, and only that one (20.797458ms)
✔ a program not found before the first reading is looked for again once it is in (0.330083ms)
✔ off Windows a program is looked for once (0.113583ms)
ℹ tests 422
ℹ suites 0
ℹ pass 419
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 12117.09425
✓ verify passed
```

## 증거 경로

증거 폴더는 `/Volumes/X31/workspace/smp_workspace/openfilm-u3-007-u3-updates-release/.dev/u3-updates-evidence`다. 증거 파일은 커밋하지 않았다.

- `checks.json`: 검증 명령·종료 코드·요약을 기록했다. 설치 명령의 요약은 첫 도구 실행 결과에서 옮겼다.
- `targeted-node.log`: 대상 테스트 18건이 통과했다.
- `electron-node.log`: Electron 테스트 7건 통과·4건 실패와 `Digest method not supported`를 기록했다.
- `electron-crypto.json`: 로컬 Electron·Node 버전과 crypto 기능을 기록했다.
- `minisign-prehashed.log`, `minisign-legacy.log`: minisign CLI가 두 fixture의 payload·trusted comment 서명을 검증했다.
- `typecheck.log`, `architecture-lint.log`, `actionlint.log`: 개별 검증 결과다.
- `verify.log`, `verify.exit`: 전체 검증 출력과 종료 코드다.
- `public-repo.json`, `public-readme.md`: 공개 레포와 README를 확인한 자료다.
- `apps/desktop/fixtures/u3-minisign/`: 기존 시험 payload·공개키·`Ed` 및 `ED` 서명이다.

## 하지 못한 것과 범위 제한

- Node `crypto`만 사용한다는 plan을 유지하면서 Electron의 `ED` 검증을 통과시키지 못했다. 이 항목을 통과로 처리하지 않는다. 대체 해시 처리 설계가 남아 있다.
- 실제 Windows 업데이트, 실제 GitHub Actions 릴리스, Mac Developer ID 서명·공증, 설치 파일 패키징은 실행하지 않았다. 정상 릴리스 공개를 하지 않았다.
- 실제 minisign 키를 생성하지 않았다. 공개키를 반영하지 않았다. GitHub secrets와 variables를 등록하지 않았다. `desktop.minisignPublicKey`는 빈 값으로 유지했다.
- 병합과 소스 레포 push를 하지 않았다. 다른 checkout과 worktree를 수정하지 않았다. Jira·위키·장부를 수정하지 않았다.
- 별도 Dev Studio를 시작하지 않았다. 종료할 별도 Dev Studio 프로세스가 없다.

이 보고서는 사용자 지시에 따라 커밋하지 않는다.
