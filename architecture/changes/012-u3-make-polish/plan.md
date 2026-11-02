# Plan: u3-make-polish (lite)
Track: lite.

## 검토 목록
- **효과음 시점: 짤이 있는 장면에서는 효과음이 첫 짤이 나타나는 순간에 나온다.** 짤이 없는 장면에서는 지금처럼 장면이 시작할 때 나온다. 사용자에게 보이는 동작: 실제 영상 시험에서 효과음이 짤보다 0.6–2.0초 먼저 나왔는데, 앞으로는 짤과 같은 순간에 나온다. 추천: 받아들인다. 이유: 반응 효과음은 반응 짤과 함께 들려야 한다. 근거: 009 spec 의 효과음 배치(u3 `from-script.ts` 를 그대로 옮김), 시험 프로젝트 `~/Movies/OpenFilm/Projects/u3-짤효과음-시험/film.html`.
- **u3 로컬 provider(u3 Whisper, u3 Library)는 처음부터 「연결됨」이다.** 사용자가 설정에서 연결을 끊으면 끊긴 상태가 유지된다. 사용자에게 보이는 동작: 채팅 에이전트의 `get asr --via u3-whisper` 가 설정 없이 동작한다. 받아쓰기 provider 를 따로 고르지 않은 사람에게는 u3 Whisper 가 기본 받아쓰기 provider 가 된다. 추천: 받아들인다. 이유: 키가 없고 기기 안에서만 도는 provider 에 「연결」 단계는 의미가 없고, 채팅 시험에서 에이전트가 여기서 막혀 환경 변수로 우회했다.
- **코어 파일 한 줄 변경**: `studio/server/keys.mjs` 의 `providerKey` 에 「`keyless` 이고 `local` 이면 끊지 않은 한 연결됨」을 더한다. 결정 0003 은 코어를 고치지 않는다고 정하지만, 이 판정이 정해지는 곳이 여기 한 곳뿐이다. `local` 플래그는 u3 provider 에만 있어서 업스트림 provider 동작은 바뀌지 않는다. 추천: 받아들인다.
- **개발 모드 앱의 whisper-cli**: `pnpm --filter @openfilm/desktop start` 가 `.dev/runtime/whisper` 에 고정 해시 바이너리를 받는다(`u3-whisper-runtime.mjs` `fetchWhisper` 재사용, gh smpbrighton 인증). 받지 못하면 경고만 내고 앱은 뜬다. 개발 모드 앱의 `main.mjs` 는 그 경로를 `OPENFILM_U3_WHISPER_CLI` 로 넘긴다. 사용자 배포본에는 영향이 없다.

## 결정
- 사용자: 「재시작해주고 lite 변경 하나로 수정해」. 대상 두 문제는 세션이 앱 채팅 시험에서 찾아 보고했다: 효과음이 짤보다 먼저 나옴, 로컬 whisper 가 「연결 안 됨」으로 막힘.

## 대조
- 결정 0012·0013: 장면표·순위 방식은 그대로다. 같은 입력은 같은 film 을 낸다. 효과음 `at` 계산만 바뀐다.
- 결정 0003: 위 검토 목록의 코어 한 줄 외에는 `u3-` 파일과 데스크톱 dev 경로만 바꾼다.
- 진행 중인 010(Windows whisper, 보류)과 `u3-whisper-runtime.mjs` 를 함께 본다. 010 은 그 파일에 win32 타깃을 더할 예정이다. 이 변경은 그 파일을 고치지 않고 import 만 한다. `depends_on` 없음.

## 바꿀 파일
- `packages/openfilm/studio/server/u3-make.mjs` `planFilm`: 장면에 짤이 있으면 효과음 `at` 을 그 장면의 첫 짤 `at`(before 면 장면 시작, after 면 `cursor + length - memeDur`)으로 둔다. receipt `sfx[].at` 도 같은 값.
- `packages/openfilm/studio/server/u3-make.test.mjs`: 짤 before/after/없음 각각의 효과음 시각, 결정론(두 번 같은 결과).
- `packages/openfilm/studio/server/keys.mjs` `providerKey`: `provider.keyless && provider.local && !off` 이면 `{ key: '', source: 'file' }`.
- `packages/openfilm/studio/server/keys.test.mjs` 또는 providers 테스트: 기본 연결, 끊으면 null, 업스트림 keyless(keenable)는 그대로 연결 안 됨.
- `apps/desktop/scripts/start.mjs`: 시작 전에 `fetchWhisper(.dev/runtime/whisper)` (이미 있고 해시가 맞으면 건너뜀). 실패하면 경고.
- `apps/desktop/src/main.mjs`: 패키지가 아니면 `.dev/runtime/whisper/whisper-cli` 가 있을 때 `OPENFILM_U3_WHISPER_CLI` 로 넘긴다.
- `u3/skills/u3-make/SKILL.md`: 효과음 시점 설명이 있으면 맞춘다.

## 순서
1. 실패 테스트를 먼저 쓰고 커밋한다(효과음 시각, 로컬 provider 기본 연결). 그 다음 코드를 고친다. 테스트는 고치지 않는다.
2. dev start 의 whisper 받기와 `main.mjs` 경로.
3. 대상 테스트, `pnpm typecheck`.
4. 실제: 시험 프로젝트 `u3-짤효과음-시험` 의 `scenes.json` 으로 `openfilm get make` 를 다시 실행해 효과음과 짤 시각이 같은지 확인한다(그 프로젝트는 세션이 만든 시험용이다).
5. `pnpm run verify`.
6. (이 세션) 앱 재시작, 채팅으로 받아쓰기가 있는 영상 시험(`u3-채팅-시험` 과 같은 방식)에서 우회 없이 `get asr` 가 되는지 확인, 병합.

구현은 orca-cli 로 codex 에게 맡긴다.

## 리스크
- 가장 위험한 단계는 `providerKey` 변경이다. 연결 판정은 모든 provider 선택(`fill`)에 쓰인다. `local` 이 없는 provider 는 바뀌지 않는다는 테스트로 막는다.
- 효과음과 짤이 같은 시각에 시작하면 효과음이 장면 끝을 넘을 수 있다(효과음 최대 1.5초). 트랙 배치(`placeLowest`)가 겹침을 피한다. 테스트로 확인한다.
- 택하지 않은 대안: 효과음을 짤 시각에 맞추되 짤 없는 장면은 효과음 생략, 설정 화면에서 자동 연결 버튼 제공.

## 증명
- 실패 테스트가 수정 전에 실패하고 수정 후 통과하는 로그.
- 시험 프로젝트 make 다시 실행 결과의 효과음·짤 `at` 표.
- 앱 채팅 시험에서 `get asr --via u3-whisper` 가 환경 변수 없이 성공한 기록.
- `pnpm run verify` exit 0, 마지막 줄 `✓ verify passed`.

## 롤백
병합 revert. 설정 파일은 바꾸지 않으므로 되돌릴 데이터가 없다.

## 구현에서 달라진 것
- `keys.mjs`는 조건 하나만 바꾼다. 기본 연결만 추가하면 연결 해제 API가 로컬 provider를 다시 연결하므로 `providers/index.mjs`의 연결 해제 조건에도 `keyless && local`을 더한다. 같은 파일의 선택·표시 경로는 저장된 받아쓰기 선택이 없을 때만 u3 Whisper를 기본값으로 쓴다. 저장된 선택과 업스트림 keyless provider의 연결 규칙은 유지한다.
- `get.test.mjs`의 연결 없음 사례는 로컬 provider를 명시적으로 끈다. 로컬 받아쓰기 사례는 저장된 키와 선택 없이 실행한다. 실패 테스트를 먼저 커밋한 뒤 이 테스트들을 바꾸지 않고 구현한다.
- 실제 시험은 원본 프로젝트를 이 worktree의 `.dev/projects/u3-sfx-timing`에 복사해서 진행한다. 사용자의 구현 지시에 따라 데스크톱 앱을 실행하거나 재시작하지 않는다. 새 개발 Studio home에서 `say -v Yuna`로 만든 한국어 음성을 받아쓴다. dev start와 같은 `whisperIn`·`fetchWhisper` 호출로 받은 바이너리를 사용한다. 병합과 push는 실행하지 않는다.
