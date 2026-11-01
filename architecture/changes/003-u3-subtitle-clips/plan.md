# Plan: u3-subtitle-clips (from spec.md)

## 검토 목록
- **0009 를 0010 으로 대체했다(critic I1 채택).** `subtitles.json` 을 끄지 않고 `captions.mjs` `filmCaptions` 한 곳에서 u3 자막 클립 film 의 Studio cue 를 내지 않는다. 사용자에게 보이는 동작: 그 film 에서 CC 토글을 켜도 Studio 자막이 나오지 않는다. 추천: 받아들인다. 이유: 사람의 상태 파일을 건드리지 않고 한 곳에서 지킨다. 근거: `architecture/decisions/0010-no-studio-cues-with-subtitle-clips.md`.
- **앞을 자른 클립은 효과가 없다(critic n5 일부 채택).** 추천: 받아들인다. 고치려면 호스트 계약을 바꿔야 한다. 근거: spec 우려 사항 6.
- **구현은 codex 가 한다(사용자 지시 「구현은 /orca-cli 를 이용해서 codex에게 지시해」).** `orca agent launch --agent codex --worktree path:<003 워크트리>` 로 이 plan 을 넘기고, 이 세션은 결과를 기다려 diff 대조·검증·수동 확인·병합을 한다.
- **1단계가 실패하면 강조 방식을 바꾼다.** observer 재그리기가 render 첫 프레임에 별표를 남기면, spec 우려 사항 2 의 대안(미리 만든 강조 HTML text 항목)으로 바꾸고 이 plan 을 같은 커밋에서 고친다.

## Context
INTENT 기대 결과 3·4번: 자막 한 줄이 페이지 클립이고, `.vtt` 를 가져오면 cue 마다 클립이 생긴다. spec(accepted, critic 반영)과 결정 0006–0008, 0010 을 구현한다.

## 바꿀 파일
`packages/openfilm` 기준. 저장소 루트의 `u3/` 는 따로 적는다.
- `u3/library/pages/u3-subtitle.html` (new): 템플릿. `#main-src`·`#sub-src`·`#main`·`#sub`, `window.film`, MutationObserver, 효과 CSS 식, 레이어 `:root` 변수, `#sub:empty`, 배율 clamp.
- `u3/library/pages/fonts/` (new): u3 `assets/fonts` 의 Pretendard(400·700), GmarketSansTTFBold, TmonMonsori 와 라이선스 파일.
- `u3/library/README.md`: pages 절.
- `studio/server/u3-subtitles.mjs` (new) + `.test.mjs`: vtt 읽기(단어·화자 태그 제거), 별표 이스케이프, 겹침 정리, 레이어 파일·폰트 복사, 클립 목록(id `u3sub-<layer>-<n>`, `data-props`, text override), 같은 레이어 클립 교체, 레이어 트랙 찾기·만들기. film.html 쓰기는 `ops.mjs` 의 기존 op 를 쓴다.
- `studio/server/u3-library.mjs`: `pagesDir()`(라이브러리 아래 `pages`) 하나.
- `studio/server/get.mjs`: `VERBS.subtitles`, `runGet` 로컬 분기 한 줄(`call` 옆), catalog 예외 한 줄. `get.test.mjs` 는 verb 목록 단언만 고친다.
- `studio/server/captions.mjs`: `filmCaptions` 첫머리 한 줄(u3 자막 클립 있으면 빈 cue). + 테스트 한 건(`captions.test.mjs` 또는 `u3-subtitles.test.mjs`).
- `src/skills.mjs`, `src/skills-cli.mjs`, `studio/server/server.mjs`(install/remove 분기), `studio/ui/src/components/SkillsLibrary.tsx`, `studio/ui/src/lib/project-sources.ts`: 소스 `u3`. `skills.test.mjs` 에 u3 소스 테스트.
- `u3/skills/u3-subtitles/SKILL.md`, `u3/skills/u3-media/SKILL.md` (new). 형식은 공식 skill 과 같게(필요하면 `openfilm.json`).
- `apps/desktop/scripts/release.mjs`: extraResources 에 `u3/skills`. `apps/desktop/src/main.mjs`: `OPENFILM_U3_SKILLS`.
- `MANUAL.md:84`: u3 예외 한 문장.
- `architecture/INTENT.md`: 변경 후보 표에서 3번 제거, 열린 질문 「자막 클립 인스펙터 UX」「skill 등록」「`.vtt` 명령 형태」 제거.

## 순서
1. **실측 먼저.** 템플릿 초안과 수동 film.html 하나(강조 `*단어*`, pop 클립)를 만들어 `openfilm render` 첫 프레임과 `openfilm look` 0.15초를 본다. 별표가 보이면 대안으로 바꾼다.
2. 템플릿 완성, 폰트, README.
3. `u3-subtitles.mjs` 와 테스트.
4. `get subtitles` 등록과 테스트.
5. `captions.mjs` 한 줄과 테스트.
6. skill 소스 `u3` 와 테스트, skill 두 개.
7. 데스크톱, MANUAL, INTENT.
8. `pnpm run verify`.
9. (이 세션) diff 대조, Studio 수동 확인(Aside), 프레임 비교, 병합.

## 리스크
- **가장 위험한 단계는 1단계다.** override 가 `frame(t)` 뒤에 오므로 강조가 첫 프레임에 늦을 수 있다. 실측으로 정하고 대안을 둔다.
- CSS `sin()` 은 Chromium 111+ 다. Playwright headless 와 Electron 44 는 이보다 새롭다고 보지만 1단계에서 shake 를 함께 그려 확인한다.
- skill 소스 추가는 UI 타입과 서버 분기를 건드린다. 업스트림 병합 충돌 범위가 커진다(spec 우려 사항 5).
- `filmCaptions` 가드가 다른 호출자(번역, NLE)를 막는다. 의도한 동작이다(0010).
- 택하지 않은 대안: subtitle-segments 로 cue 다시 자르기(critic n1), `subtitles.json` 끄기(0009), 효과를 `frame(t)` 의 var 읽기로 그리기(critic n4), skill 을 `mine` 에 복사(spec 우려 사항 5).

## 증명
- `node --test`(spec 검증 기준 2): 두 번 가져오기 동일, cue 수 = 클립 수, 겹침 정리, 별표 이스케이프, 강조 파싱, `filmCaptions` 빈 cue, skill 목록의 u3 두 개.
- `openfilm look` 으로 pop 클립 시작+0.15초의 글 크기 0.9 배 근처(검증 기준 3). 출력 png 경로를 남긴다.
- `openfilm render` 첫 프레임에 별표 없음(검증 기준 5). 프레임 png 경로를 남긴다.
- Studio(Aside): 인스펙터에 메인·서브·효과·색·크기·강조색, 고치면 미리보기 반영(검증 기준 4). CC 를 켜도 Studio 자막 없음.
- 세 시각의 미리보기와 render 프레임 픽셀 차이 평균 2% 이하(검증 기준 6). 측정 스크립트와 값을 남긴다.
- `pnpm run verify` exit 0, `✓ verify passed`.
- 미검증으로 남길 것: 데스크톱 패키지 빌드에서 `u3/skills`·`pages` 가 실리는지.

## 롤백
병합 커밋 revert. 데이터 형식 변경은 film.html 의 자막 클립뿐이다. 되돌리면 그 클립은 일반 페이지 클립으로 남고, `filmCaptions` 가드가 없어져 Studio 자막이 다시 나온다.

## 구현에서 달라진 것
- `get.mjs` catalog 의 로컬 verb 예외는 목록 포함·사용 가능 판정·provider 미연결 안내 분기에 적용했다. 기존 미연결 안내를 유지하면서 `subtitles` 를 항상 표시하려면 세 곳을 구분해야 한다.
- 1단계 render 첫 프레임에서 별표가 보이지 않았다. 강조 방식은 원안의 MutationObserver 를 유지했다.
- 사용자 지시로 이 worktree 의 구현은 1–8단계까지만 수행한다. 9단계의 Studio 수동 확인·프레임 비교·병합은 사용자가 수행한다. push 도 하지 않는다.
- 전체 verify 는 데스크톱 `src/agent-skills.test.mjs:103` 에서 실패했다. 기존 예상 skill 목록에 새 `u3-media`·`u3-subtitles` 가 없다. 이 테스트 파일은 plan 범위 밖이므로 고치지 않았다. 대상 테스트 64건·typecheck·architecture lint 는 통과했지만 전체 verify 통과 조건은 충족하지 못했다.
