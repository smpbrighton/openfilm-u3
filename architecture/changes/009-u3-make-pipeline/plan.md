# Plan: u3-make-pipeline (from spec.md)

## 검토 목록
- **원본 영상은 무대를 채운다(cover, 가운데)(critic n9 일부 채택).** 무대 크기는 film 의 것을 그대로 쓰고, make 가 세로 1080×1920 으로 바꾸지 않는다. 사용자에게 보이는 동작: 가로 원본을 세로 film 에 넣으면 양옆이 잘린다. 추천: 받아들인다. 이유: 숏폼은 화면을 채우는 것이 일반적이고, 무대 크기는 사람이 정할 일이다. 근거: spec 요구사항 3.
- **실행 중 임베딩이 실패하면 실행 전체를 규칙 순위로 다시 계산한다(critic I3).** 사용자에게 보이는 동작: 그 실행의 짤은 모두 규칙 순위이고 receipt 에 이유가 적힌다. 추천: 받아들인다. 근거: 결정 0012.
- **구현은 codex 가 한다(orca-cli).** 이 세션은 diff 대조·검증·수동 확인·병합을 한다.

## Context
INTENT 의 변경 후보 「u3-make-pipeline」. 에이전트가 쓴 장면표로 `openfilm get make` 가 완성 film 을 만든다. spec(accepted, critic 반영)과 결정 0012·0013 을 구현한다.

## 바꿀 파일
`packages/openfilm` 기준.
- `studio/server/u3-subtitles.mjs`: cue 쓰기 부분을 `writeSubtitleClips(root, cues, { layer, escape, attrs })` 로 떼어 낸다(cue `{ startMs, endMs, main, sub }`). `importSubtitles` 는 이것을 부르고 동작은 그대로다. `make` 로 시작하는 레이어 거부. 테스트 추가.
- `studio/server/u3-make.mjs` (new): `readScenes` 검사, `rankMode`(실행 시작에 한 번), `planFilm`(순수: 영상 합치기·cover box, 자막 cue, 짤 선택·시각·box·트랙, 효과음 분류·파일·트랙), `applyMake`(`changeProjectFilm`: `data-u3-make` 클립 제거 → locked 검사 → 삽입). u3 `src/core/sfx.ts`(`resolveSceneSfx`, `pickSfxFile`, `fnv1a`), `src/core/script-memes.ts`(`resolveScriptMemes`, `chooseMissingInputMemes` Jev 없는 경로), `src/core/timeline/from-script.ts`(합치기·시각), `overlay-layers.ts`(가장 아래 빈 트랙)를 옮긴다. 짤 box 는 `studio/ui/src/lib/u3-library.ts` `u3MemeBox` 와 같은 식을 서버에 둔다.
- `studio/server/u3-make.test.mjs` (new): spec 검증 기준 2 의 모든 사례. 가짜 라이브러리(001·002 테스트의 `fakeLibrary`·`addMemes` 방식)와 가짜 probe.
- `studio/server/u3-library.mjs`: `rankMemes` 가 순위 방식을 밖에서 받을 수 있게(필요하면) 인자 하나.
- `studio/server/get.mjs`: `VERBS.make`(options `scenes` 필수), `runGet` 로컬 분기 한 줄(`subtitles` 옆), catalog 로컬 예외 세 곳에 `make`. `get.test.mjs` 의 로컬 verb 단언만 고친다.
- `u3/skills/u3-make/SKILL.md` (new) (+ 다른 u3 skill 과 같은 메타 파일). `src/skills.test.mjs` u3 목록 기대값에 `u3-make`.
- `MANUAL.md`·`bin/openfilm.mjs` 의 get 목록에 make 한 줄.
- `architecture/INTENT.md`: 변경 후보 표에서 6번 제거, 열린 질문 「파이프라인 범위」 제거.

## 순서
1. `writeSubtitleClips` 분리와 테스트(기존 테스트 그대로 통과).
2. `u3-make.mjs` 의 `readScenes` 와 검사 테스트.
3. `planFilm` 순수 함수와 테스트(합치기, 짤, 효과음, 트랙, 결정론).
4. `applyMake`, 다시 실행, locked, 사람 클립 보존 테스트.
5. 순위 방식 고정과 실패 시 rule 재계산 테스트(가짜 embedder).
6. verb 등록, skill, 문서, INTENT.
7. 실제: 원본 영상 둘(짤 라이브러리의 긴 mp4 두 개를 원본으로 써도 된다)과 손으로 쓴 장면표로 `get make`, `openfilm look` 연락표, `openfilm render`.
8. `pnpm run verify`.
9. (이 세션) diff 대조, Studio 수동 확인(Aside), 병합.

## 리스크
- **가장 위험한 단계는 4단계다.** film 전체를 바꾸는 쓰기라서 사람 클립을 지우면 되돌리기 어렵다. 소유 표시(`data-u3-make`)만 지우고, `make-up` 같은 사람 클립을 남기는 테스트를 먼저 둔다.
- 결정론: 정렬 순서(id, importedAt), 부동소수 시각 반올림을 한 곳에서 정한다. 같은 입력 두 번 비교 테스트로 확인한다.
- u3 코드를 옮기며 동작이 바뀔 수 있다. u3 테스트(`from-script.test.ts`, `script-memes.test.ts`, `sfx.test.ts`)의 사례를 옮겨 같은 결과를 확인한다.
- 택하지 않은 대안: id 접두어로 소유 구별(critic I1), 장면마다 순위 방식 섞기(critic I3), 무대를 세로로 바꾸기, 사진 장면.

## 증명
- `node --test`: spec 검증 기준 2 전부.
- 실제: `get make` 결과의 `openfilm look` 연락표 PNG 경로, `openfilm render` mp4 경로, receipt(순위 방식, 고른 짤·효과음). 같은 장면표로 두 번 실행한 film.html 의 sha256 이 같다.
- Studio(Aside): 트랙 순서, 짤 위치·소리 꺼짐, 자막 메인·서브.
- `pnpm run verify` exit 0, `✓ verify passed`.
- 미검증으로 남길 것: 임베딩 순위 실제 실행(모델이 있는 기기에서만), Windows.

## 롤백
병합 revert. make 가 만든 film 은 일반 클립으로 남는다(`data-u3-make` 속성만 남는다).


## 구현에서 달라진 것
- make는 자막과 다른 클립을 한 번의 `changeProjectFilm`에서 쓴다. 이를 위해 `writeSubtitleClips` 아래의 `subtitleClips`와 `prepareSubtitlePage`를 함께 공유한다. make가 자막 writer의 별도 film 쓰기를 호출하지 않는다. 기존 VTT 가져오기는 `writeSubtitleClips`를 호출한다.
- `data-u3-make` 값에 subtitle·meme·source·sfx 역할을 적어 기존 트랙과 hidden·muted 플래그를 다시 쓴다. 속성 값이 빈 문자열인 클립도 make 소유로 취급한다. 사람 클립과 새 클립이 겹치면 새 트랙을 만들고 사람 클립을 보존한다. 사람 클립과 id가 겹치면 생성 id에 `-b`를 붙인다.
- 짤 사이드카의 길이 1.067초가 실제 길이 1.066667초보다 길어 `look`이 실패했다. 실패 테스트를 먼저 커밋했다. 선택한 짤·효과음만 probe하여 실제 길이로 제한하고, 미디어 끝은 film.html의 밀리초 정밀도에서 내림한다. 원본 컷의 끝도 내림하며 자막·receipt 시각을 같은 길이로 계산한다. 합친 원본 구간이 실제 원본 길이를 넘거나 밀리초로 표현할 수 없는 구간이면 film 쓰기 전에 오류를 낸다.
- 순위를 계산하는 동안 film이 바뀌면 기존 film을 덮어쓰지 않고 재실행을 요청한다. 순위의 제외 목록과 쓰기 대상이 달라지는 것을 방지한다.
- u3 skill의 기존 형식에는 별도 메타 파일이 없어 `SKILL.md`만 추가했다. 구현·증거·개발 상태는 지정된 worktree 안에만 두었다. 병합·push와 다른 worktree 정리는 실행하지 않는다.
