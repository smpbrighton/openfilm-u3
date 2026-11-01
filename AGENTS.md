# openfilm-u3

@architecture/INTENT.md

## 커맨드
- 검증: `pnpm run verify` — 정상 출력 마지막 줄 예시: `✓ verify passed`
- 개발: `pnpm run dev`

작업을 완료로 보고하기 전에 검증 명령을 돌리고 출력을 붙인다. 테스트가 실패하면 테스트가 아니라 코드를 고친다.

## 구조
- `architecture/` 변경 체인. `changes/NNN-slug/{intent,spec,review,plan}.md` · `decisions/`
- 한 줄씩. 디렉토리와 소유하는 것.

## 컨벤션
- 변경은 lite 로 시작한다. lite 는 plan mode 에서 만든 plan.md(`Track: lite.`) 하나로 진행한다(`/smp:plan lite <slug>`). full 신호(기대 결과 미정·미결 설계 선택 셋 이상·accepted 결정을 뒤집음)가 있으면 full 로 간다. 판정 기준은 `/smp:plan` 스킬에 있다.
- full 은 intent.md → spec.md → review.md → plan.md 순서로 커밋된 것만 다음 단계의 입력이다. intent·spec·review 의 `Status: accepted` 는 사람이 `/smp:accept` 로 바꾼다. 모델은 결정 목록을 내고 멈춘다. 모델이 쓰면 훅이 막는다.
- 레포 구조가 필요하면 `architecture/MAP.md` 부터 읽는다.
- 코드로 강제되지 않는 것만 여기에.

## 에이전트가 틀리는 것
- 같은 실수가 두 번째 나오면 여기에 규칙 한 줄.
