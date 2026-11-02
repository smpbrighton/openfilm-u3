# Plan: u3-blur-fill (lite)
Track: lite.

## Context
`get make` 는 원본 영상을 무대에 cover 로 놓는다. 정사각형·가로 원본을 세로 무대에 놓으면 양옆이 잘린다. 앱 채팅 시험 3(「u3-채팅-시험2」)에서 에이전트가 이 문제를 지적했다. 이 변경은 장면표에 선택 항목 `fit` 을 더한다. `fit: "blur"` 이면 원본 전체가 보이고, 남는 공간은 같은 원본을 흐리게 깔아 채운다. 기본값은 지금과 같은 `cover` 다.

## 검토 목록
- **기본값은 `cover` 그대로다. `blur` 는 장면표의 `fit` 으로만 켠다.** 사용자에게 보이는 동작: `fit` 이 없는 장면표는 지금과 같은 film 을 낸다. 추천: 받아들인다. 이유: 기존 결과와 결정 0012(같은 입력은 같은 결과)를 유지한다. 근거: 009 spec 3항(「cover, 가운데」), `u3/skills/u3-make/SKILL.md:67`.
- **에이전트가 `blur` 를 고르는 기준(skill 지침).** 사용자가 원본 전체를 보이게 하라고 하면 `blur` 를 쓴다. 원본 비율이 무대와 다르고 화면 가장자리에 자막·글자·사람이 있어서 잘리면 안 될 때도 `blur` 를 쓴다. 그 밖에는 `cover` 를 쓴다. 추천: 받아들인다.
- **`fit` 은 장면표 전체에 하나다.** 입력별로 고르지 않는다. 추천: 받아들인다. 이유: 한 영상 안에서 화면 방식이 섞이면 어색하고, 입력별 설정은 지금 필요한 근거가 없다.
- 결정 파일은 바꾸지 않는다. cover 규칙은 009 spec 의 설계였고 결정이 아니다. spec 은 지난 변경의 기록이므로 고치지 않는다. 현재 규칙은 skill 문서에 둔다.

## 결정
- 사용자: 「하려던 lite 진행하고 순차적으로 진행해」. 「하려던 lite」는 세션이 제안한 흐린 배경 옵션(기본값 cover)이다.
- 순서: 013(이 변경) → 010 B단계(Windows whisper) → Mac x64 릴리스 제거(별도 lite). 사용자: 「Mac Intel(x64)은 고려하지 않을거고. window 64랑 mac arm 이렇게 두개만 있으면 돼」.

## 대조
- 결정 0012·0013: 장면표에서 결정론적으로 배치한다. make 는 `data-u3-make` 클립만 소유한다. 새 배경 클립도 `data-u3-make="backdrop"` 을 가진다. 다시 실행하면 그 클립도 교체한다.
- 결정 0003: `u3-make.mjs` 와 그 테스트, u3 skill 만 바꾼다. 코어(`film-doc.mjs`, render)는 바꾸지 않는다. video 클립은 이미 `style` 을 받는다(`film-doc.mjs:124`). render 는 브라우저 화면을 프레임으로 찍으므로 CSS `filter` 가 반영된다(`render.mjs:622`).
- 진행 중 변경 010 은 `apps/desktop` 만 바꾼다. 파일이 겹치지 않는다.

## 바꿀 파일
- `packages/openfilm/studio/server/u3-make.mjs`
  - `readScenes`: `fit` 은 없거나 `"cover"`·`"blur"` 다. 다른 값이면 400(`fit: cover 또는 blur 여야 합니다`). 결과 `SceneTable` 에 `fit`(기본 `cover`)을 넣는다.
  - `containBox(input, stage)` 를 새로 둔다. `coverBox` 와 같은 꼴이고 `Math.min` 을 쓴다.
  - `backdropBox(input, stage, pad)`: cover 상자를 사방 `pad` 만큼 넓힌다. 흐림이 가장자리에서 투명해지는 부분이 무대 밖에 놓이게 한다.
  - `planFilm`: `fit === 'blur'` 이고 원본 비율이 무대 비율과 1% 넘게 다르면, 원본 클립은 `containBox` 를 쓴다. 같은 구간의 배경 클립(`make-backdrop-N`, `volume: 0`, `style: "filter: blur(Bpx) brightness(0.6)"`, `attrs: { 'data-u3-make': 'backdrop' }`)을 원본 트랙 아래 트랙에 놓는다. `B = round(max(stage.w, stage.h) * 0.025)`, `pad = 2B`. 맞닿은 장면을 합칠 때는 배경 클립의 `time` 도 같이 늘린다. 비율이 같으면 배경 클립을 만들지 않고 cover 를 쓴다.
  - 트랙 순서: subtitle, meme…, source, backdrop, sfx…. `Role` 에 `backdrop` 을 더하고 `roleOf` 가 그것을 인식한다.
  - receipt 에 `fit` 을 넣는다.
- `packages/openfilm/studio/server/u3-make.test.mjs`
  - 정사각형 입력, 1080×1920 무대, `fit: "blur"`: 원본 상자 `{x:0,y:420,w:1080,h:1080}`, 배경 상자와 style, `volume: 0`, 트랙 순서.
  - 맞닿은 두 장면을 합칠 때 원본과 배경이 함께 하나로 합쳐진다.
  - 비율이 같은 입력은 `blur` 여도 배경 클립이 없다.
  - `fit` 이 없으면 지금 결과와 같다(기존 테스트 유지).
  - 잘못된 `fit` 은 400 이다.
  - `applyMake` 를 두 번 실행해도 배경 트랙이 하나다. 사람이 만든 클립은 남는다.
  - 같은 입력은 같은 film 을 낸다.
- `u3/skills/u3-make/SKILL.md`: 장면표 예시와 필드 설명에 `fit` 을 더한다. 67행의 cover 설명을 「기본은 cover, `blur` 는 원본 전체 + 흐린 배경」으로 바꾼다. 위 검토 목록의 고르는 기준을 적는다.

## 순서
1. 테스트를 먼저 쓴다(새 기능이므로 실패 확인 후 같은 커밋으로 진행해도 된다).
2. `u3-make.mjs` 를 구현한다.
3. skill 문서를 고친다.
4. 대상 테스트, `pnpm typecheck`.
5. 실제 확인: 세션이 만든 시험 프로젝트 `u3-채팅-시험2` 를 scratch 로 복사한다. 그 `scenes.json` 에 `"fit": "blur"` 를 넣어 `openfilm get make` 를 실행한다. 한 프레임을 이미지로 렌더해서 원본 전체와 흐린 배경이 보이는지 본다. 사용자의 실제 프로젝트는 건드리지 않는다.
6. `pnpm run verify`.
7. (이 세션) diff 대조, 프레임 이미지 확인, 병합.

구현은 orca-cli 로 codex 에게 맡긴다.

## 리스크
- 가장 위험한 단계는 `applyMake` 의 트랙 재사용이다. 새 역할 `backdrop` 이 기존 역할 매칭과 섞이면 다시 실행할 때 트랙이 늘어난다. 두 번 실행 테스트로 막는다.
- 흐림은 렌더 비용을 늘린다. 4K 무대에서 프레임당 시간이 늘어난다. 측정하지 않았다.
- 택하지 않은 대안: 기본값을 blur 로 바꾸기, 입력별 `fit`, 흐린 배경 대신 단색 배경.

## 증명
- `node --test packages/openfilm/studio/server/u3-make.test.mjs`: exit 0.
- 시험 프로젝트 복사본의 렌더 프레임 이미지(원본 전체 + 흐린 배경).
- `pnpm run verify` 가 exit 0 이고 마지막 줄이 `✓ verify passed`.

## 롤백
병합을 revert 한다. revert 뒤에는 `fit: "blur"` 가 든 장면표도 cover 로 처리된다. 지금 `readScenes` 는 모르는 키를 막지 않는다. 이미 만든 film 의 backdrop 클립은 다음 make 실행이 `data-u3-make` 클립으로 지운다.

## 구현에서 달라진 것
- 실제 확인에 지정된 `u3-채팅-시험2`의 `assets/회사-썰.mp4`가 없었다. 그 프로젝트를 `.dev/projects/u3-blur-fill`로 복사한 뒤, 인접 프로젝트 `u3-채팅-시험/assets/회사-썰.mp4`를 복사본에만 보충했다. 보충한 영상의 probe 결과는 기존 캐시와 같은 720×720, 19.1초, 30fps다. 원본 프로젝트는 수정하지 않았다.
- Dev Studio의 프로젝트와 공유 설정도 이 worktree의 `.dev/` 아래로 지정했다. 구현 세션은 최종 작업 지시에 따라 병합과 push를 하지 않는다.
