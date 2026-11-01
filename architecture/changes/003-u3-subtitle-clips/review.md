# Review: u3-subtitle-clips
Author: 확인 불가(하네스 표시는 claude-haiku-5-5, opencodex 라우팅 표기는 claude-opus-5-5[1m]이고 둘이 다르다). Status: draft. Round: 1.

## 대조한 것
- 변경: `architecture/changes/003-u3-subtitle-clips/intent.md`, `spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 결정: `architecture/decisions/0001`~`0009` 전부(모두 accepted)
- 지도: `architecture/MAP.md` 없음
- 다른 변경: 장부(`ledger.sh show`)의 001 `u3-library-sfx`, 002 `u3-library-memes` 는 stage done 이고 워크트리가 없다. 진행 중인 다른 변경은 없다. 두 변경의 `plan.md` 는 이 워크트리의 `architecture/changes/` 에서 읽었다.
- 코드(`packages/openfilm` 기준): `SPEC.md`, `MANUAL.md:84`, `src/overrides.mjs`, `src/timeline.mjs:1025-1041,1191-1209,1298-1304`, `studio/ui/src/lib/component-props.ts`, `studio/server/ops.mjs`, `studio/server/ops.test.mjs:89-97`, `studio/server/get.mjs`(`runGet`, `catalog`, `offered`), `studio/server/subtitle-segments.mjs`, `studio/server/film-subtitle.mjs`, `studio/server/captions.mjs`, `studio/ui/src/lib/use-film-subtitles.ts`, `studio/ui/src/lib/use-subtitle-style.ts`, `src/skills.mjs`, `skills/long-to-short/SKILL.md`, `apps/desktop/scripts/release.mjs`, `apps/desktop/src/main.mjs`
- u3 원본: `u3/src/remotion/U3Short.tsx:145-148`, `u3/architecture/decisions/0028-caption-clip-style.md`, `u3/src/core/schema.ts:112`

## 발견

### Important
1. **설계가 결정 0009 의 조건을 유지하지 못한다.** 0009 는 "자막 클립이 하나라도 있으면 `subtitles.json` 의 `on` 을 `false` 로 둔다" 이다. spec 은 `get subtitles` 실행 뒤 한 번만 `on: false` 를 쓴다. 기존 코드는 세 경로로 `on` 을 다시 `true` 로 만든다.
   - Studio 의 「자막 만들기」 성공 뒤 `setStyle({ ...v, on: true })` 를 한다(`studio/ui/src/lib/use-film-subtitles.ts:98`). 결정 0005 는 whisper asr 을 이 버튼에 연결하고, 후속 변경 004 `u3-whisper-asr` 가 그 경로를 쓴다.
   - Studio 는 `subtitles.json` 을 프로젝트를 열 때와 history 복원 때만 읽는다(`use-subtitle-style.ts:52`). Studio 가 열린 동안 CLI 가 쓴 `on: false` 는 화면에 반영되지 않는다. 사람이 스타일을 바꾸면 메모리의 `on: true` 가 파일을 덮어쓴다(`use-subtitle-style.ts:54-66`). MANUAL 은 에이전트가 Studio 를 열어 둔 채로 작업하라고 한다(`MANUAL.md:78`).
   - CC 토글(`use-film-subtitles.ts:84`)이 막히지 않는다.
   결과로 자막이 두 번 그려지고 burn-in 도 된다(`film-subtitle.mjs:686` 는 `on` 만 본다). 이 조건을 지키려면 Studio UI 코어(`use-film-subtitles.ts`)를 고쳐야 하므로 결정 0003 의 「코어는 등록 수준」과도 맞물린다. 또 `subtitles.json` 은 "에이전트가 건드리지 않는 사람의 상태" 로 정의되어 있다(`film-subtitle.mjs:45`, `captions.mjs:291`). 에이전트가 부르는 verb 가 이 파일을 쓰는 것은 그 정의와 어긋난다. 근거: `architecture/decisions/0009-studio-subtitles-off-with-clips.md`, `0005`, `0003`, 위 코드 경로.

### nit
1. **「cue 하나에 클립 하나」와 「subtitle-segments 규칙으로 cue 자르기」가 서로 어긋난다.** 요구사항 1 과 검증 기준 2("cue 수와 클립 수가 같다")는 cue 하나에 클립 하나다. 설계는 `.vtt` 를 `subtitle-segments.mjs` 규칙으로 자른다. 그 규칙은 한 줄을 절·길이(16 cells)·쉼으로 여러 자막으로 나눈다(`subtitle-segments.mjs:1-36`). 또 자르기가 `*단어*` 쌍 사이에서 일어나면 강조 표기가 깨진다. 규칙 4 의 "괄호·따옴표 안에서 자르지 않는다" 에 별표는 없다. 근거: `spec.md` 요구사항 1·설계 「가져오기」·검증 기준 2, `studio/server/subtitle-segments.mjs`.
2. **데스크톱 앱과 패키지 CLI 에서 템플릿 원본의 위치가 정해지지 않았다.** `get subtitles` 는 `u3/pages/u3-subtitle.html` 과 `u3/pages/fonts/` 를 프로젝트로 복사한다. spec 은 `u3/skills` 만 `extraResources` 와 `OPENFILM_U3_SKILLS` 로 넘긴다. `u3/pages` 는 번들에도 환경 변수에도 없다. 001 은 라이브러리를 `OPENFILM_U3_LIBRARY` 로 넘겼다(`apps/desktop/scripts/release.mjs:174`, `apps/desktop/src/main.mjs:487`). 이대로면 패키지 앱에서 `get subtitles` 가 템플릿을 찾지 못한다. 근거: `spec.md` 설계 「템플릿 페이지」·「skill」의 데스크톱 항목.
3. **`data-props` 와 클립별 글은 클립 속성인데, spec 은 페이지 구조 안에 둔다.** `data-props` 는 film.html 의 클립(iframe) 속성이다(`component-props.ts:7-10,40`, `ops.test.mjs:89-97`). 메인·서브 글도 클립의 `overrides`(`text` 항목)에 들어간다. spec 은 「템플릿 페이지」 절에 "props 선언(`data-props`)" 을 두고, `get subtitles` 가 클립마다 `data-props` 와 cue 글의 `text` override 를 쓴다는 것을 적지 않는다. 페이지에 선언하면 인스펙터에 props 가 보이지 않는다(요구사항 3). 사람이 미디어에서 레이어 파일을 직접 끌어 만든 클립에도 props 가 없다. 근거: `spec.md` 설계 「템플릿 페이지」 props 선언, `studio/ui/src/lib/component-props.ts`.
4. **효과 var 는 `frame(t)` 뒤에 적용되므로, `frame(t)` 가 읽는 효과 값이 한 프레임 늦거나 기본값이다.** 호스트 순서는 `frame(local)` → `settle` → `override` 다(`src/timeline.mjs:1035-1040`, `1205-1208`). 설계는 `frame(t)` 가 `--u3-anim` 으로 transform 을 정한다. 페이지가 새로 열린 직후의 첫 그리기(`cue`, `wake` 뒤)에서는 override 가 아직 없으므로 레이어 기본 효과로 그린다. 그 시점이 클립 시작, 곧 효과 구간이다. Studio 의 `preview()` 는 `frame` 없이 override 만 다시 적용하므로(`timeline.mjs:1298-1304`), 인스펙터에서 효과를 바꿔도 정지 화면의 transform 은 바뀌지 않는다. MutationObserver 는 `#main-src`·`#sub-src` 만 본다. 검증 기준 5 는 별표만 보고 효과 첫 프레임은 보지 않는다. 근거: `spec.md` 설계 「효과」, 결정 0006.
5. **왼쪽을 자른 클립에서는 효과가 클립 시작에 나오지 않는다.** 요구사항 5 는 "클립 시작부터 0.3초" 다. 호스트는 `in + (t − at)` 을 넘기므로(`SPEC.md:90-91`), Studio 에서 앞을 0.3초 넘게 자르면 효과 구간이 사라진다. split 의 오른쪽 조각도 같다. u3 는 클립의 로컬 프레임 0 부터 센다(`U3Short.tsx:145`). intent 기대 결과는 "다른 클립처럼 옮기고 자른다" 이다. 근거: `spec.md` 요구사항 5·열린 질문 답 「frame(t)」.
6. **겹치는 cue 와 트랙 선택이 정해지지 않았다.** SPEC 은 한 트랙의 클립이 겹치지 않는다고 한다(`SPEC.md:47-48`). `.vtt`(받아쓰기 결과, 화자 여럿)의 cue 는 겹칠 수 있다. `ops.mjs` 의 insert 는 겹침을 검사하지 않고, 트랙을 주지 않으면 같은 종류(page)의 마지막 트랙에 넣는다(`ops.mjs:124-129`). spec 은 "레이어는 트랙 하나에 놓인다" 만 쓰고, 어느 트랙을 만들거나 고르는지와 겹침을 어떻게 처리하는지를 쓰지 않는다. 기존 SRT 내보내기는 겹침을 잘라 낸다(`film-subtitle.mjs:713`). 근거: `spec.md` 요구사항 7·설계 「가져오기」.
7. **우려 사항 2 의 대안이 동작하지 않는다.** 대안은 "호스트의 override 적용 뒤 `filmHost.settle` 단계에서 다시 그린다" 이다. `settle` 은 override 보다 먼저 불린다(`timeline.mjs:1037,1040`, `SPEC.md:208`). 그래서 settle 에서는 override 된 글을 볼 수 없다. 추정: MutationObserver 콜백은 같은 event loop 의 microtask 이므로 `draw` 의 promise 후속보다 먼저 돈다. 이 추정은 실측하지 않았다. 근거: `spec.md` 우려 사항 2.
8. **공식 skill `long-to-short` 도 Studio 가 자막을 그린다고 한다.** 우려 사항 1 은 `MANUAL.md:84` 만 다룬다. 숏폼 skill 은 "transcript ... from which Studio draws the subtitles" 라고 쓴다(`skills/long-to-short/SKILL.md:27-28`). 공식 폴더는 `pnpm skills:sync` 가 바꾸므로 고칠 수 없다(결정 0008 맥락). u3 skill 이 이 지침보다 앞선다는 문장이 spec 에 없다. 근거: `spec.md` 우려 사항 1·설계 「skill」.
9. **받아쓰기 글의 별표 처리가 정해지지 않았다.** u3 0028 은 "codex·whisper 가 낸 글의 별표는 이스케이프해 저장한다" 이다. spec 의 `get subtitles` 는 `.vtt`(받아쓰기 결과 포함)의 `*` 를 그대로 강조로 읽는지 `\*` 로 바꾸는지 쓰지 않는다. 근거: `spec.md` 요구사항 4, `u3/architecture/decisions/0028-caption-clip-style.md`.
10. **검증 기준 3 이 pop 효과를 보이지 못한다.** `openfilm look scenes/u3-subtitle-main.html 0.15` 는 페이지만 그리고 클립 override 가 없다. 효과는 클립별 var 이므로 레이어 기본값이 pop 이 아니면 크기 0.9 배가 나오지 않는다. 또 `--layer` 를 주지 않았을 때의 레이어 이름(검증 기준이 쓰는 `main`)이 요구사항에 없다. 레이어 이름 `main` 과 글 줄 「메인」이 같은 말을 두 뜻으로 쓴다. 근거: `spec.md` 요구사항 1·검증 기준 3.
11. **서브 숨김과 크기 범위가 설계에 없다.** 열린 질문 답은 "서브 숨김은 boolean" 이지만 props 목록에 boolean 이 없고, 요구사항 3 은 "서브가 비면 보이지 않는다" 이다. 크기 배율 50–200%(요구사항 6)는 `var` 자유 입력이라 범위를 막지 않는다. 페이지가 값을 제한하는지 spec 에 없다. 근거: `spec.md` 열린 질문 답 「인스펙터」·요구사항 3·6·설계 props 선언.
12. **우려 사항 1 이 `SPEC.md:124-125` 를 넓게 읽는다.** 그 문장은 `.vtt` 에서 만든 editor 자막을 호스트가 그리지 않는다는 뜻이다. 페이지 클립이 글을 그리는 것을 금지하지 않는다. 그래서 SPEC 과의 충돌은 없고, 충돌은 `MANUAL.md:84` 와 `long-to-short` skill 에만 있다. 근거: `SPEC.md:124-125`, `spec.md` 우려 사항 1.
13. **001·002 가 넘긴 u3 skill 문서화가 이 spec 에 없다.** 001 은 "스킬 문서화는 짤 변경에서 u3 스킬과 함께 한다", 002 는 "skill 등록 방식은 자막 클립 변경에서 정한다" 고 넘겼다. 이 spec 은 등록 방식을 정하지만 skill 은 `u3-subtitles` 하나이고, 효과음·짤 지침을 skill 로 옮기는지는 쓰지 않는다. 근거: `architecture/changes/001-u3-library-sfx/plan.md` 검토 목록 3, `architecture/changes/002-u3-library-memes/plan.md` 검토 목록 3.

## 처리

| # | 발견 | 판단 |
|---|---|---|
| I1 | 0009 의 `on: false` 가 유지되지 않음 | 채택 |
| n1 | cue 하나 = 클립 하나와 다시 자르기가 어긋남 | 채택 |
| n2 | 데스크톱에서 템플릿 위치 없음 | 채택 |
| n3 | `data-props`·글은 클립 속성 | 채택 |
| n4 | 효과 var 가 `frame` 뒤에 적용됨 | 채택 |
| n5 | 앞을 자른 클립의 효과 | 일부 채택 |
| n6 | 겹치는 cue 와 트랙 | 채택 |
| n7 | settle 대안이 동작하지 않음 | 채택 |
| n8 | 공식 `long-to-short` 지침 | 채택 |
| n9 | 받아쓰기 글의 별표 | 채택 |
| n10 | 검증 기준 3 이 효과를 못 보임, 레이어 이름 | 채택 |
| n11 | 서브 숨김·크기 범위 | 채택 |
| n12 | 우려 1 이 SPEC 을 넓게 읽음 | 채택 |
| n13 | 효과음·짤 skill 문서화 | 채택 |

- I1 채택 — 0009 를 0010 으로 대체했다. `filmCaptions` 한 곳에서 cue 를 내지 않는다. `subtitles.json` 은 건드리지 않는다.
- n1 채택 — cue 를 다시 자르지 않는다(요구사항 1).
- n2 채택 — 템플릿을 `u3/library/pages/` 에 두어 001 의 `OPENFILM_U3_LIBRARY`·번들을 그대로 쓴다.
- n3 채택 — 「클립 속성」 절을 두고 `get subtitles` 가 클립마다 쓴다.
- n4 채택 — 효과 종류를 CSS 변수와 CSS 식으로 고르고 `frame(t)` 는 진행값만 쓴다.
- n5 일부 채택 — 한계를 우려 사항 6 으로 적었다. 고치려면 호스트 계약을 바꿔야 해서 YAGNI 로 고치지 않는다.
- n6 채택 — 레이어마다 새 트랙, 겹친 cue 는 앞 cue 를 줄인다(요구사항 3).
- n7 채택 — 대안을 「미리 만든 강조 HTML 항목」으로 바꿨다.
- n8 채택 — u3 skill 에 우선 문장, 우려 사항 1 에 적었다.
- n9 채택 — `.vtt` 글의 `*` 는 `\*` 로 저장한다(요구사항 5).
- n10 채택 — 기본 레이어 이름 `layer1`, 검증 기준 3 은 film 의 pop 클립으로 본다.
- n11 채택 — `#sub:empty`, `clamp(0.5, …, 2)`.
- n12 채택 — 우려 사항 1 을 MANUAL·`long-to-short` 로 좁혔다.
- n13 채택 — `u3-media` skill 을 더했다(요구사항 9).

