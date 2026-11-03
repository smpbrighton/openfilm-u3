# Plan: u3-claude-thinking-binding (lite)
Track: lite.

사용자가 `/smp:accept u3-claude-thinking-binding`으로 승인했다. 현재 세션에는 plan mode 도구가 없다. lite 계획만 있는 변경이므로 승인된 이 계획을 커밋한 뒤 구현한다.

## 검토 목록
- 추천: API key로 등록한 Anthropic 모델에 설치된 SDK의 같은 모델이 가진 호환성 정보를 연결한다. SDK가 기존에 제공하는 `thinking` 복구 처리를 사용한다. 이유: 실제 오류 모델은 `claude-opus-5-5`이고, SDK의 이 모델에는 복구 설정이 이미 있다.
- 추천: 무효 `thinking` 블록은 SDK와 API가 제외하도록 한다. 기존 대화와 영상 파일은 유지한다. 이유: 실패한 대화를 다시 열어도 같은 오류를 보내고 있다. 유효하지 않은 추론을 제외하면 모델이 일부 추론을 다시 생성하므로 출력 토큰이 증가할 수 있다.
- 추천: 모델 이름을 알 수 없는 Anthropic 호환 서비스에는 새 호환성 정보를 추정해서 넣지 않는다. 이유: 해당 서비스의 beta 지원 여부를 확인할 수 없다.

## 기대 결과
API key로 연결한 `claude-opus-5-5`가 이미지를 검사한 뒤에도 응답을 마친다. 이 오류로 실패한 기존 대화에서도 후속 요청을 보낼 수 있다.

## 결정
- 사용자: 「claude api key 붙여서 하고있는데 계속 완료 한 다음에 오류가 발생하네」라고 보고하고 `Invalid signature in thinking block` 오류를 제공했다.
- lite로 진행한다. 기존 모델 연결의 버그 수정이며 기대 결과가 정해져 있다.
- SDK와 Anthropic의 요청 형식을 재구현하지 않는다. 설치된 SDK의 모델 호환성 정보와 복구 처리를 연결한다.
- API key 값, 사용자 대화 본문, 이미지 base64는 레포의 테스트 fixture나 문서에 복사하지 않는다. 회귀 테스트는 합성 데이터를 사용한다.

## 확인한 원인
1. `apps/desktop/src/pi-config.mjs`의 `fitImages`는 최근 다섯 개를 넘긴 이미지 결과를 텍스트로 교체한다. 요청 크기 제한도 적용한다.
2. `제목 없음 7/.film/logs/local-sj6jmk14u6.model.jsonl`의 요청 26에서 `/tmp/fc/sheet.png` 결과가 이미지에서 안내 텍스트로 바뀌었다. 직전 요청까지는 같은 이미지가 있었다.
3. 이후 assistant 메시지의 서명된 `thinking` 블록은 유지됐다. API가 대화 내용 불일치로 요청을 거부했다. 다음 사용자 요청도 같은 이력을 보내서 실패했다.
4. 저장된 세션의 모델은 `claude-opus-5-5`, API는 `anthropic-messages`다. `modelsJson`은 사용자 모델에 SDK의 Anthropic 모델 호환성 정보를 연결하지 않는다.
5. 설치된 `pi-ai` 1.1.0의 Anthropic 구현은 `supportsMidConvoEffort`가 있으면 adaptive thinking, `prefix_mismatch_behavior: drop_block`, 필요한 beta를 함께 보낸다.
6. 외부 API를 호출하지 않는 요청 캡처로 차이를 확인했다. 현재 설정에는 `thinking` 복구 설정과 beta가 없었다. 같은 모델에 SDK의 호환성 정보를 연결하면 두 설정이 모두 생성됐다.

공식 근거:
- https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting
- https://platform.claude.com/docs/en/build-with-claude/preserved-thinking

## 대조
- 결정 0003: 새 동작은 `u3-` 접두어 모듈에 모은다. `pi-agent.mjs`는 해당 모듈을 연결하는 부분만 변경한다. 영상 편집 코어는 변경하지 않는다.
- 진행 중인 다른 변경은 없다. 장부의 001–014는 모두 `done`이다.
- 이미지 수와 크기 제한은 필요하다. 이 제한을 제거하면 큰 요청이 HTTP 413으로 실패할 수 있다.

## 바꿀 파일
- `apps/desktop/src/u3-pi-anthropic.mjs` (new): SDK의 Anthropic 모델 카탈로그에서 같은 모델을 찾는다. 해당 API key provider의 모델에 호환성 정보를 연결하고 runtime에 반영한다. 사용자 모델 이름, 주소, key 환경변수, context 길이와 effort 선택은 보존한다. Auto provider와 thinking provider에 같은 처리를 적용한다.
- `apps/desktop/src/u3-pi-anthropic.test.mjs` (new): 현재 BYOK 설정과 실제 SDK로 요청을 생성하는 회귀 테스트를 작성한다. 기본 Auto, 명시적 effort, 저장된 대화 이력, 이미지 제외 이후 요청을 검사한다. 다른 API와 알 수 없는 모델에는 정보를 추가하지 않는지 검사한다.
- `apps/desktop/src/pi-agent.mjs`: 모델 runtime을 만든 뒤 첫 세션을 열기 전에 새 모듈을 연결한다. 재개한 세션도 같은 runtime 모델을 사용하게 한다.
- `apps/desktop/package.json`: 기존 릴리스 절차에 따라 patch 버전을 `1.0.2`로 올린다. 검증한 소스의 `v1.0.2` tag로 Mac arm64와 Windows x64 배포를 실행한다.
- 이 `plan.md`: 승인과 구현 결과, 검증 증거를 기록한다.

## 순서
1. 계획을 승인받은 뒤 커밋한다.
2. 현재 코드 경로로 SDK 요청을 캡처하는 회귀 테스트를 작성한다. `drop_block`과 beta 누락 때문에 실패하는지 확인하고 테스트를 먼저 커밋한다.
3. 새 모듈과 `pi-agent.mjs` 연결을 구현한다. 테스트의 기대값은 바꾸지 않는다.
4. 같은 회귀 테스트를 실행한다. 기존 `pi-config.test.mjs`도 실행한다.
5. `pnpm run verify`를 실행한다. 종료 코드와 마지막 출력을 기록한다.
6. diff를 이 계획과 대조한다. 검증 통과 뒤 커밋, 병합, push를 진행한다. 배포 전에는 기존 릴리스 절차를 확인한다.

## 리스크
- 가장 위험한 변경은 custom provider에 호환성 정보를 연결하는 부분이다. SDK의 실제 요청을 캡처해 body와 beta를 함께 검사한다. 기존 beta를 덮어쓰지 않는지도 검사한다.
- `drop_block`은 실패한 대화를 복구하지만 이전 이미지 제외 자체를 없애지는 않는다. 이미지가 제외되는 요청에서는 추론 일부를 다시 생성할 수 있다. 요청마다 모든 `thinking`을 삭제하는 처리는 추가하지 않는다.
- API key 모델이 카탈로그의 이름과 다른 별칭을 사용하면 자동으로 호환성 정보를 연결할 수 없다. 현재 보고된 `claude-opus-5-5`는 카탈로그와 일치한다.
- 택하지 않은 대안: 이미지 제한 제거, 모든 모델에 beta 강제 적용, 모든 `thinking` 제거, 같은 실패 요청의 반복 재시도다. 각각 요청 크기 초과, 서비스 호환성 저하, 추론 손실, 오류 반복을 만든다.

## 증명
- 회귀 테스트: 수정 전에는 필요한 body와 beta 누락으로 실패한다. 수정 후에는 같은 테스트가 exit 0이다.
- 실제 SDK 요청 캡처: `thinking.type`은 `adaptive`다. `thinking.block_binding.prefix_mismatch_behavior`는 `drop_block`이다. `anthropic-beta`에는 `thinking-binding-controls-2026-08-01`이 있다.
- 호환성 테스트: 다른 API와 알 수 없는 모델의 요청에는 Anthropic beta를 추가하지 않는다. 이미지 제외와 요청 크기 제한의 기존 테스트가 통과한다.
- 전체 검증: `pnpm run verify`가 exit 0이고 마지막 줄이 `✓ verify passed`다.
- 실제 Anthropic 서버의 서명 검증은 로컬 요청 캡처로 증명할 수 없다. 구현 뒤 실서비스 확인을 실행하지 않으면 미검증으로 남긴다. 사용자의 실제 대화나 영상 파일은 자동으로 수정하지 않는다.

## 구현과 검증
- 새 모듈이 알려진 Anthropic 모델의 SDK 호환성 정보를 연결한다. 알 수 없는 모델과 다른 API는 그대로 둔다. 채팅 프로세스는 세션 생성 전에 이 모듈을 실행한다.
- 회귀 테스트를 제품 코드보다 먼저 커밋했다. SDK의 경로와 tool 결과 직렬화에 맞춰 테스트를 보정한 뒤, 수정 전 코드에서 설정 누락과 400 오류로 두 테스트가 실패하는 것을 다시 확인했다.
- 수정 후 `node --test apps/desktop/src/u3-pi-anthropic.test.mjs apps/desktop/src/pi-config.test.mjs`는 exit 0이다. 16개 테스트가 모두 통과했다.
- 첫 `pnpm run verify`는 Studio UI 두 건으로 exit 1이었다. Layers 항목 표시 대기 시간 초과와 임시 `pageframes` 폴더 삭제의 `ENOTEMPTY`다. 로그는 `/tmp/u3-015-verify.log`다.
- 해당 UI 파일 두 개의 세 테스트를 변경 전 main과 수정 워크트리에서 각각 단독 실행했다. 양쪽 모두 3/3, exit 0이었다. UI 코드와 테스트는 변경하지 않았다. 로그는 `/tmp/u3-015-ui-baseline.log`, `/tmp/u3-015-ui-targeted.log`다.
- `worktree.sh finish`의 두 번째 `pnpm run verify`가 exit 0이었다. 마지막 줄은 `✓ verify passed`다. 전체 2,088개 중 2,080개가 통과했고 조건부 8개를 건너뛰었다. 실패는 없다. 최종 로그는 `/tmp/u3-015-verify-final.log`다.
- 실제 Anthropic 서버 호출은 실행하지 않았다. 로컬 서버와 실제 ACP 프로세스·SDK로 요청 형식을 확인했다.
- 마감용 Jira 검색에서 이 레포에 해당하는 이슈를 찾지 못했다. 다른 제품의 이슈는 수정하지 않는다.
- 설치된 smp 스킬에서 `/smp:wiki ingest`를 찾지 못했다. 변경 근거와 검증 결과는 이 계획에 기록한다.

## 배포와 마감
- 소스 commit `12985453110975a19e2b5e5657fbe8762afa114a`를 main에 병합하고 push했다. `v1.0.2` tag로 배포했다.
- [desktop 실행 41619046662](https://github.com/smpbrighton/openfilm-u3/actions/runs/41619046662)의 plan, mac, windows, publish job이 모두 성공했다.
- [u3 Studio 1.0.2](https://github.com/smpbrighton/u3-studio-releases/releases/tag/v1.0.2)를 latest로 공개했다. Mac arm64와 Windows x64 설치 파일, 업데이트 피드, 서명과 fragment를 포함한 자산 12개가 있다.
- 공개 피드 두 개를 다시 받아 버전 `1.0.2`를 확인했다. 두 fragment의 버전과 source commit도 확인했다. 확인 파일은 `/tmp/u3-015-release-check/`다.
- Windows의 Electron 서명 검증 테스트 12개가 모두 통과했다. 릴리스 fragment 검증도 통과했다. 로그는 `/tmp/u3-015-windows-release.log`다.
- 변경 워크트리와 브랜치를 정리했다. 장부는 `done`이다. 사용자 대화와 영상 파일은 변경하지 않았다.

## 롤백
이 변경의 커밋을 revert한다. SDK가 생성하는 모델 설정은 다음 앱 실행 때 다시 작성한다. 사용자 대화와 영상 파일의 마이그레이션은 없다.
