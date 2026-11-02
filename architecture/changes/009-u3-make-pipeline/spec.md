# Spec: u3-make-pipeline
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
- **다시 실행할 때**: make 가 만든 클립만 바꾼다. make 클립에는 속성 `data-u3-make` 를 붙이고, 다시 실행하면 이 속성이 있는 클립만 지우고 새로 만든다. id 접두어로 구별하지 않는다(사람 파일 `make-up.mp4` 의 id 가 `make-up` 이 될 수 있다). 결정 0013.
- **원본 소리**: 그대로 둔다(u3 와 같다). 짤 클립은 소리를 끈다(`volume` 0, film.html 의 `muted`).
- **임베딩과 결정론**: 순위 방식은 실행 시작에 한 번 정하고 실행 내내 같다. 임베딩 모듈·검증된 모델·색인이 모두 있고 docHash 가 맞으면 `embedding`, 하나라도 없으면 `rule`. 실행 중 임베딩 호출이 실패하면 그 실행 전체를 `rule` 로 처음부터 다시 계산한다(섞지 않는다). 결정론의 입력은 「장면표 + 라이브러리 + 순위 방식」이고, receipt 에 방식과 이유를 적는다. 결정 0012.
- **전환 효과**: 넣지 않는다(u3 기본값 없음).

## 요구사항
1. `openfilm get make --scenes <json>` 은 장면표 파일(프로젝트 안 경로)을 읽어 film.html 을 만든다. 장면표 형식은 u3 `CodexScript` 의 영상 장면과 같다: `{ title?, scenes: [{ inputIndex, startSec, endSec, caption, subCaption?, reaction, memeBefore, memeAfter, sfxCategory }] }`. `inputs: ["assets/…mp4", …]` 로 inputIndex(1부터)가 가리키는 원본 영상을 적는다.
2. 형식이 틀리면 film 을 바꾸지 않고 장면 번호와 이유를 모두 적은 오류를 낸다. 검사: 파일 존재, `0 ≤ startSec < endSec ≤ 원본 길이`, reaction 은 14감정 또는 null, sfxCategory 는 10분류 또는 null, reaction 이 null 이면 짤 앞·뒤가 모두 false.
3. 장면은 빈틈 없이 이어 붙인다. 같은 원본의 맞닿은 장면(경계 차이 0.05초 이내)은 영상 클립 하나로 합친다(u3 레포 결정 0013). 원본 영상은 무대를 채우도록(cover, 가운데) 놓는다. 무대 크기는 film 의 것을 그대로 쓴다.
4. 장면마다 자막 클립 하나를 둔다. 메인은 caption, 서브는 subCaption. 별표는 이스케이프하지 않는다(장면표는 에이전트가 쓰므로 `*강조*` 를 그대로 쓴다).
5. 짤(u3 `resolveScriptMemes`·`chooseMissingInputMemes` 의 Jev 없는 경로):
   - 질의는 `{ query: caption, reaction }`(서브 자막은 넣지 않는다).
   - reaction 이 있는 장면: 앞만 true 면 앞, 뒤만 true 면 뒤, 둘 다 false 면 뒤, 둘 다 true 면 1위를 앞·2위를 뒤(2위가 없으면 뒤 하나).
   - 길이 `min(짤 길이, 2초, 장면 길이)`. 앞이면 장면 시작, 뒤면 장면 끝에 맞춘다. 가운데, 무대 폭 60%, 소리 끔. 겹치지 않는 가장 아래 짤 트랙에 둔다.
   - 같은 짤을 두 번 쓰지 않는다. 제외 목록은 make 클립을 지운 뒤 남은 film 의 짤과 이번 실행에서 고른 짤이다.
   - 짤이 없는 원본: 그 원본의 장면 자막으로 각각 검색하고, 후보가 있는 마지막 장면 끝에 그 장면의 1위 짤을 둔다(u3 레포 결정 0013).
   - 후보가 없으면 짤 없이 만들고 receipt 에 센다. 크기·길이를 모르는 짤은 후보에서 뺀다. 짤 라이브러리가 아예 없으면 `fetch-library.mjs` 를 안내하는 오류를 낸다.
6. 효과음(u3 `resolveSceneSfx`·`pickSfxFile`): 분류는 sfxCategory, 없으면 그 장면 짤의 감정, 그것도 없으면 장면 reaction 에서(`MEME_EMOTION_SFX`). 파일은 그 분류 목록(id 순)에서 `fnv1a(<장면표 sha256 앞 16자>#<0부터 센 장면 번호>)` 로 고른다. 길이 `min(1.5초, 파일 길이)`, 장면 시작에 둔다. 겹치면 겹치지 않는 가장 아래 효과음 트랙에 둔다. u3 의 도입 알림 효과음은 넣지 않는다.
7. 트랙 순서(위에서 아래): 자막, 짤 트랙들, 원본 영상, 효과음 트랙들. make 트랙이 이미 있으면 그 트랙을 다시 쓰고, 없으면 그 자리에 새로 만든다. make 클립이 `locked` 트랙에 있으면 아무것도 바꾸지 않고 오류를 낸다. 클립이 모두 지워진 트랙은 기존 규칙대로 없어진다.
8. 같은 장면표·라이브러리·모델 유무로 두 번 실행하면 같은 film.html 이다.
9. 결과(receipt)에 장면 수, 길이, 고른 짤·효과음 id, 순위 방식(embedding|rule)을 적는다.
10. u3 skill `u3-make` 가 장면표 형식, 규칙(u3 `formatScriptInputGuide` 와 `DEFAULT_SCRIPT_PROMPT` 의 형식 규칙), 받아쓰기 `.vtt` 를 읽는 법, `get make` 사용법을 설명한다.

## 설계
### 자막
- `u3-subtitles.mjs` 에서 cue 를 받는 부분을 떼어 `writeSubtitleClips(root, cues, { layer, escape })` 로 낸다. cue 는 `{ startMs, endMs, main, sub }`. `importSubtitles` 는 이 함수를 부른다(동작 그대로). make 는 레이어 `make` 로 부른다.
### 새 모듈 `studio/server/u3-make.mjs`
- `readScenes(root, path)` 검사, `planFilm(scenes, inputs, library, rank)` 순수 함수(배치 계산), `applyMake(root, plan)` 쓰기(`changeProjectFilm`). 효과음 `resolveSceneSfx`·`pickSfxFile`·`fnv1a` 는 u3 `core/sfx.ts` 를 옮긴다. 짤 선택은 u3 `resolveScriptMemes`·`chooseMissingInputMemes`(Jev 없는 경로)를 옮긴다.
- 짤 box 는 `u3MemeBox` 와 같은 식(서버에 같은 함수를 둔다).
- 원본 길이는 `probe` 로 잰다.
### verb
- `get subtitles --layer` 는 `make` 로 시작하는 레이어 이름을 거부한다(make 전용).
- `get.mjs`: `VERBS.make`(options `scenes` 필수), `runGet` 의 로컬 분기에 `make` 한 줄, catalog 의 로컬 예외에 `make` 추가.
### skill
- `u3/skills/u3-make/SKILL.md`(new): 장면표 예시 JSON, 규칙, 순서(받아쓰기 → 장면표 → `get make` → `look`), 다시 실행하면 make 클립의 손 편집이 사라진다는 경고.
- `src/skills.test.mjs` 의 u3 skill 목록 기대값에 `u3-make` 를 더한다(목록이 바뀌는 의도된 변경).

## 결정
- 자동 생성은 에이전트가 쓴 장면표를 `openfilm get make` 가 결정론적으로 배치한다. 결정론의 입력은 장면표·라이브러리·모델 유무다 — [0012](../../decisions/0012-make-from-scene-table.md)
- make 는 자기 클립(`make-`, `u3sub-make-`)만 소유하고, 다시 실행하면 그것만 바꾼다 — [0013](../../decisions/0013-make-owns-its-clips.md)

## 우려 사항
1. **모델 유무에 따라 결과가 달라진다.** 같은 장면표라도 모델을 받기 전과 뒤의 짤이 다르다. 정책 소유자: 제품 책임자. 추천: 받아들이고 receipt 에 순위 방식을 적는다. 이유: 규칙만 쓰면 006 의 정확한 검색을 버린다.
2. **효과음 고르기가 u3 와 다르다.** u3 는 프로젝트 id 로 씨앗을 정하지만, 여기서는 장면표 해시를 쓴다. 같은 장면표면 같은 효과음이고, 장면표를 고치면 모든 효과음이 바뀔 수 있다. 정책 소유자: 제품 책임자. 추천: 받아들인다. 이유: 폴더 이름이나 Studio id 는 CLI 결정론의 입력으로 불안정하다.
3. **사람이 make 클립을 고친 뒤 다시 실행하면 그 고침이 사라진다.** 정책 소유자: 제품 책임자. 추천: 받아들이고 skill 과 receipt 에 경고한다. 고친 클립을 지키려면 id 를 바꾸라고 쓴다(003 자막과 같은 방식).
4. **사진 장면은 빠진다.** u3 는 사진 입력도 받는다. 추천: 이번에는 영상만. 사진은 따로 변경한다.

## 검증 기준
1. `pnpm run verify` exit 0, `✓ verify passed`.
2. `node --test`: 장면표 검사 오류(모든 경우), 맞닿은 구간 합치기, 짤 앞·뒤 네 조합, 짤 시각과 길이, 짤 중복 금지(다시 실행해도 같은 짤), 원본마다 하나, 후보 없음, 효과음 분류·파일·길이·겹침 트랙, 트랙 순서, 같은 입력 두 번이 같은 film.html, 다시 실행이 `data-u3-make` 클립만 바꾸고 `make-up` 같은 사람 클립을 남김, locked 트랙 거부, 순위 방식이 실행 중 섞이지 않음.
3. 실제: 원본 영상 둘과 받아쓰기로 에이전트가 쓴 장면표(테스트용으로 손으로 써도 된다)를 `get make` 로 만들고 `openfilm look` 연락표(contact sheet)로 자막·짤·효과음 자리를 확인한다. `openfilm render` 가 끝까지 돈다.
4. Studio(Aside): 만든 film 을 열어 트랙 순서와 짤 위치·소리 꺼짐을 확인한다.
