# Review: u3-make-pipeline
Author: 확인 불가(opencodex 라우팅 지시는 claude-opus-5-5[1m], harness 표시는 claude-haiku-5-5). Status: draft. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/009-u3-make-pipeline/intent.md`, `spec.md`. 앞선 라운드의 발견은 없다(review.md 가 템플릿 상태였다).
- 지침: `AGENTS.md`, `architecture/INTENT.md`. `architecture/MAP.md` 는 없다.
- 유효 결정: `architecture/decisions/` 의 0001, 0003, 0004, 0005, 0006, 0007, 0008, 0010, 0011, 0012, 0013. 0002·0009 는 superseded 이므로 대조에서 뺐다.
- 진행 중인 다른 변경: `ledger.sh show` 에서 009 외의 변경(001–008)은 모두 `done` 이다. 충돌을 대조할 진행 중 변경이 없다.
- 코드: `packages/openfilm/studio/server/u3-subtitles.mjs`, `u3-library.mjs`, `u3-meme-embed.mjs`, `get.mjs`, `ops.mjs`, `packages/openfilm/src/film-doc.mjs`, `packages/openfilm/SPEC.md`, `packages/openfilm/studio/ui/src/lib/u3-library.ts`, `packages/openfilm/src/skills.test.mjs`, `u3/skills/`.
- spec 이 옮긴다고 한 u3 원본: `/Volumes/X31/workspace/smp_workspace/u3/src/core/sfx.ts`, `script-memes.ts`, `schema.ts`, `timeline/from-script.ts`, `ui/screens/Script.tsx`, u3 결정 `architecture/decisions/0012-overlay-memes-sfx-lanes.md`, `0013-generation-merge-clips-memes.md`.
- 0003·0005·0006·0007(가져오기 경로)·0008·0010 과의 대조에서는 모순을 찾지 못했다. make 자막 id 가 `u3sub-` 로 시작하므로 0010 의 cue 억제가 그대로 적용된다.

## 발견

### Important
1. **id 접두어만으로는 make 클립과 사람 클립을 구별하지 못한다.** 0013 은 "다른 클립은 건드리지 않는다"고 정한다. 그러나 다음 두 경우에 make 를 다시 실행하면 사람이 만든 클립이 지워진다.
   - Studio 와 film 형식은 id 가 없는 클립에 파일 이름으로 id 를 준다. 사람이 `make-up.mp4` 같은 파일을 놓으면 id 가 `make-up` 이 되고, `make-` 접두어 삭제 대상이 된다. 근거: `packages/openfilm/src/film-doc.mjs` `clipIdFor`(280행), `packages/openfilm/SPEC.md` 55행("without it, the file's name"), `studio/server/ops.mjs` insert(108행).
   - `get subtitles` 는 layer 이름에 `make` 와 `make-intro` 같은 대시 이름을 허용한다. `--layer make` 는 make 와 같은 `u3sub-make-<n>` id 와 같은 템플릿 `scenes/u3-subtitle-make.html` 을 쓴다. `--layer make-intro` 의 id `u3sub-make-intro-1` 도 `u3sub-make-` 로 시작하므로 make 가 지운다. 반대로 `get subtitles --layer make` 는 make 의 자막을 바꾼다. 근거: `studio/server/u3-subtitles.mjs` 56행(layer 검사), 67–68행(`prefix`, `sameLayer`), 결정 0007·0013.
   - 두 삭제 기준도 다르다. 0013 은 "`u3sub-make-` 로 시작하는 클립 모두"이고, spec 이 재사용하는 `importSubtitles` 경로는 `^\d+(?:-b)*$` 꼬리만 같은 레이어로 본다. 근거: `u3-subtitles.mjs` 67행, spec 「설계 · 자막」.
2. **짤 중복 제외가 기존 film 을 결정론의 입력으로 만든다.** 요구사항 5 는 "이미 film 에 있는 짤도 제외"한다. 0012 는 결정론의 입력을 장면표·라이브러리·모델 유무 셋으로 정한다. 사람이 더한 짤은 이 셋에 없지만 결과를 바꾼다. 더 큰 문제는 다시 실행할 때다. 앞 실행의 make 짤을 지우기 전에 `memesInFilm` 으로 사용 짤을 세면, 둘째 실행은 첫 실행의 짤을 모두 빼고 다른 짤을 고른다. 그러면 요구사항 8(두 번 실행해도 같은 film.html)과 0012 의 결과가 깨진다. spec 은 제외 목록을 make 클립을 지운 뒤의 film 으로 계산한다고 적지 않았고, `planFilm(scenes, inputs, library, rank)` 시그니처에도 기존 film 이 없다. 근거: spec 요구사항 5·8, 「설계 · 새 모듈」, `studio/server/u3-library.mjs` `memesInFilm`(335행), 결정 0012.
3. **`rankMemes` 의 순위 방식은 "모델 유무"보다 많은 조건으로 바뀌고, 장면마다 다를 수 있다.** 임베딩 순위는 `OPENFILM_U3_EMBED_MODULES`(데스크톱만 넘긴다), 검증된 모델 파일, 라이브러리의 `meme-embed/bge-m3.json` 인덱스, 짤 sidecar 의 docHash 일치가 모두 있을 때만 쓴다. 호출 중 오류가 나면 그 호출만 `null` 을 내고 규칙 순위로 내려간다. 따라서 같은 장면표·라이브러리·모델 유무에서도 `npx openfilm` 이 띄운 Studio 와 데스크톱 Studio 의 결과가 다르고, 한 번의 실행 안에서 장면마다 순위 방식이 섞일 수 있다. 0012 의 "같은 세 입력은 같은 film.html" 과 요구사항 9 의 실행 단위 `embedding|rule` 한 값이 이 동작과 맞지 않는다. 근거: `studio/server/u3-meme-embed.mjs` 183–221행, `apps/desktop/src/main.mjs` 493행, `studio/server/u3-library.mjs` `rankMemes`(161–172행), 결정 0012.

### nit
1. **효과음 트랙 하나에 효과음이 겹칠 수 있다.** 효과음은 장면 시작에 `min(1.5초, 파일 길이)` 로 놓인다. 장면이 1.5초보다 짧으면 다음 장면의 효과음과 겹친다. film 형식은 한 트랙 안의 클립 겹침을 허용하지 않는다. 요구사항 7 은 효과음 트랙을 하나로 적었고, 겹칠 때 트랙을 나누는 규칙이 없다. u3 는 효과음 lane 을 여러 개 둔다. 근거: `packages/openfilm/SPEC.md` 47–48행, spec 요구사항 6·7, u3 `src/core/timeline/sfx-lanes.ts`, u3 결정 0012.
2. **원본마다 짤 하나 보충 규칙이 u3 0013 과 다르다.** spec 은 "그 원본의 마지막 반응 장면 끝에 1위 짤"을 둔다. 그러나 반응 장면에는 이미 짤이 붙으므로, 짤이 없는 원본은 보통 반응 장면이 없는 원본이다. 이 규칙은 그 경우에 둘 장면이 없다. u3 0013 과 `chooseMissingInputMemes` 는 그 원본의 장면 자막으로 검색하고, Jev 가 없으면 후보가 있는 마지막 장면 끝에 1위 짤을 둔다. 이 규칙 그대로 구현하면 intent 의 "원본 영상마다 짤이 하나 이상"을 지키지 못한다. 근거: spec 요구사항 5, `/Volumes/X31/workspace/smp_workspace/u3/architecture/decisions/0013-generation-merge-clips-memes.md`, u3 `src/core/script-memes.ts` 21–67행, u3 `src/ui/screens/Script.tsx` 168–193행.
3. **짤 앞·뒤 플래그의 조합 처리가 spec 과 u3 에서 다르다.** spec 은 "reaction 이 있는 장면에 짤 하나(앞 또는 뒤)"라고만 적는다. u3 `resolveScriptMemes` 는 둘 다 false 이면 뒤로 정하고, 둘 다 true 이면 2위 짤을 하나 더 놓는다. spec 은 `resolveScriptMemes` 를 옮긴다고 적으면서 두 경우의 동작과 검사(요구사항 2) 여부를 정하지 않았다. 근거: spec 요구사항 2·5, 「설계 · 새 모듈」, u3 `src/core/script-memes.ts` 70–109행, u3 `src/core/schema.ts` 257–258행.
4. **효과음 분류의 대체 규칙이 옮길 함수와 다르다.** 요구사항 6 은 sfxCategory 가 없으면 "그 장면 짤의 감정"에서 고른다. spec 이 옮긴다고 한 u3 `resolveSceneSfx` 는 짤이 없으면 장면의 reaction 으로 고른다. 반응은 있지만 짤 후보가 없는 장면에서 결과가 달라진다. 근거: spec 요구사항 6, u3 `src/core/sfx.ts` `resolveSceneSfx`.
5. **다시 실행할 때 트랙 위치와 트랙 상태를 정하지 않았다.** make 트랙에 사람 클립이 함께 있거나 사람 트랙이 사이에 있을 때, 새 make 트랙을 어디에 넣는지 spec 에 없다. 트랙의 클립이 모두 지워지면 트랙이 없어지므로, 사람이 그 트랙에 건 `hidden`·`muted`·`locked` 도 사라진다. SPEC 은 `locked` 트랙을 에이전트가 바꾸지 않는다고 정하지만 `applyOps` 는 이를 막지 않는다. make 가 locked 트랙의 클립을 지울지 정해야 한다. 근거: `studio/server/ops.mjs` 68–69행(`dropEmptyTracks`), `packages/openfilm/SPEC.md` 48–49행, spec 요구사항 7, 결정 0013.
6. **짤 후보·라이브러리·메타데이터가 없을 때의 동작이 없다.** 짤 파일은 git 에 없고 `fetch-library.mjs` 로 받는다. 짤이 없는 라이브러리, 후보가 바닥난 장면, `durationSec`·`width`·`height` 가 null 인 짤과 효과음에서 make 가 실패하는지, 짤 없이 만드는지 정하지 않았다. `u3MemeBox` 는 크기를 모르면 null 을 낸다. u3 0013 은 후보가 없으면 짤 없이 만들고 안내에 센다. 근거: `studio/server/u3-library.mjs` 4–7행·`listSfx`·`listMemes`, `studio/ui/src/lib/u3-library.ts` 84–90행, u3 `src/core/timeline/from-script.ts` 12–15·110행.
7. **`rankMemes` 에 넘길 장면 설명을 정하지 않았다.** `rankMemes(visual)` 는 `{ query, reaction }` 을 받는다. u3 는 `query: scene.caption` 을 쓴다. subCaption 을 넣는지 정하지 않으면 결정론 입력이 구현마다 달라진다. 근거: spec 요구사항 5, `studio/server/u3-library.mjs` 161행, u3 `src/ui/screens/Script.tsx` 152–156행.
8. **u3 skill 목록을 고정한 테스트가 있다.** `skills.test.mjs` 는 u3 skill 목록이 `u3-media`, `u3-subtitles` 둘이라고 단정한다. `u3-make` 를 더하면 이 테스트가 실패한다. AGENTS.md 는 테스트가 실패하면 코드를 고치라고 정하므로, 이 테스트의 기대값 변경을 spec 이나 plan 에 명시해야 한다. 근거: `packages/openfilm/src/skills.test.mjs` 33–34·45행, `AGENTS.md` 「커맨드」.
9. **film 의 무대 크기와 원본 영상의 box 를 정하지 않았다(불확실).** 짤 box 와 자막 템플릿은 film 의 stage 로 계산한다. stage 가 없으면 1920 × 1080 이다. u3 숏폼은 1080 × 1920 세로다. make 가 stage 를 정하는지, 가로 원본을 세로 무대에 어떻게 놓는지 spec 에 없다. 근거: `studio/server/u3-subtitles.mjs` 75–76행, `packages/openfilm/SPEC.md` 43–44행, u3 `src/core/timeline/from-script.ts` 126행.
10. **u3 의 도입 알림 효과음을 뺀다는 말이 없다.** u3 `timelineFromScript` 는 장면 효과음 외에 3초 시점의 intro 알림 효과음을 넣는다. intent 의 제약은 u3 배치 규칙을 따른다고 적지만, spec 은 이 효과음을 범위 밖에도 넣지 않았다. 근거: u3 `src/core/timeline/from-script.ts` 118–122행, intent 「제약」.
11. **"0013" 이 두 결정을 가리킨다.** spec 의 「다시 실행할 때」는 이 레포의 결정 0013 이고, 요구사항 3·5 의 "u3 0013" 은 u3 레포의 결정이다. 근거: spec 「열린 질문에 대한 답」, 요구사항 3·5.
12. **효과음 씨앗의 장면 번호 기준을 정하지 않았다.** `fnv1a(<sha256 앞 16자>#<장면 번호>)` 의 번호가 0부터인지 1부터인지 없다. u3 `pickSfxFile` 은 0부터 세는 index 를 쓴다. 근거: spec 요구사항 6, u3 `src/core/sfx.ts` `pickSfxFile`, `src/core/timeline/from-script.ts` 104행.

## 처리

| # | 발견 | 판단 |
|---|---|---|
| I1 | id 접두어로 사람 클립까지 지움 | 채택 |
| I2 | 다시 실행 때 짤 제외 목록 | 채택 |
| I3 | 순위 방식이 실행 중 섞임 | 채택 |
| n1 | 효과음 겹침 | 채택 |
| n2 | 원본마다 짤 보충 규칙 | 채택 |
| n3 | 짤 앞·뒤 조합 | 채택 |
| n4 | 효과음 분류 대체 규칙 | 채택 |
| n5 | 다시 실행 때 트랙 위치·locked | 채택 |
| n6 | 후보·라이브러리 없음 | 채택 |
| n7 | 짤 질의 | 채택 |
| n8 | skills.test 기대값 | 채택 |
| n9 | 무대·원본 box | 일부 채택 |
| n10 | 도입 효과음 | 채택 |
| n11 | 0013 번호 혼동 | 채택 |
| n12 | 씨앗 장면 번호 | 채택 |

- I1 채택 — 속성 `data-u3-make` 로 소유를 표시한다. `get subtitles` 는 `make` 레이어를 거부한다. 결정 0013 을 고쳤다.
- I2 채택 — 제외 목록은 make 클립을 지운 뒤의 film 기준이다(요구사항 5).
- I3 채택 — 순위 방식을 실행 시작에 한 번 정하고, 실패하면 실행 전체를 rule 로 다시 계산한다. 결정 0012 를 고쳤다.
- n1 채택 — 효과음도 겹치지 않는 가장 아래 트랙.
- n2·n3·n4·n7·n12 채택 — u3 함수 동작 그대로 요구사항에 적었다.
- n5 채택 — make 트랙 재사용, locked 거부(요구사항 7).
- n6 채택 — 후보 없으면 짤 없이, 라이브러리 없으면 오류.
- n8 채택 — 설계에 기대값 변경을 적었다.
- n9 일부 채택 — 무대는 film 의 것을 쓰고, 원본은 cover 로 채운다. 세로 무대를 자동으로 정하지는 않는다(plan 검토 목록).
- n10 채택 — 도입 효과음은 넣지 않는다고 적었다.
- n11 채택 — 「u3 레포 결정 0013」으로 적었다.

