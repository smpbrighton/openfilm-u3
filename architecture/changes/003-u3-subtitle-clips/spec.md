# Spec: u3-subtitle-clips
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
- **인스펙터가 메인·서브·강조·효과 편집을 감당하는가**: 감당한다고 본다. openfilm 의 component props 는 클립마다 값을 갖는다. 같은 src 를 쓰는 두 클립도 다른 값을 가진다(`studio/ui/src/lib/component-props.ts`, `ops.test.mjs:94`). 메인·서브는 `text`, 효과는 `var`, 서브 숨김은 `boolean` 으로 둔다. 화면에서의 확인은 검증 기준 4번이다.
- **레이어 표현**: 레이어 하나는 템플릿 파일 하나다(`scenes/u3-subtitle-<layer>.html`). 레이어 스타일은 그 파일 `:root` 의 CSS 변수 기본값이다. 결정 0006.
- **`.vtt` 가져오기 형태**: `openfilm get subtitles` 로컬 verb 다. 결정 0007.
- **u3 skill 등록**: `src/skills.mjs` 의 네 번째 소스 `u3` 다. 결정 0008.
- **기존 Studio 자막**: 자막 클립이 하나라도 있으면 `.film/subtitles.json` 의 `on` 을 `false` 로 둔다. 번역, SRT 내보내기, burn-in, NLE 자막 트랙은 자막 클립을 다루지 않는다. 결정 0009.
- **등장 효과를 `frame(t)` 로 그릴 수 있는가**: 그렇다. 호스트는 클립 로컬 시간 `in + (t − at)` 으로 `frame` 을 부른다(`SPEC.md:90-91`, `src/timeline.mjs:1032-1035`). 0.3초 효과는 t 의 함수다.
- **미리보기와 내보내기가 같은가**: 다음 단계로 넘김. 둘 다 같은 페이지를 Chromium 에서 그리지만 실측하지 않았다. 검증 기준 6번으로 확인한다.

## 요구사항
1. `openfilm get subtitles --src <vtt> [--layer <name>]` 는 cue 마다 자막 클립 하나를 film.html 에 더한다. 클립의 `at` 과 길이는 cue 의 시각이다.
2. 같은 `.vtt` 와 같은 film.html 로 두 번 실행하면 같은 film.html 이 된다. 같은 레이어의 기존 가져오기 클립은 바뀌고 늘지 않는다.
3. 자막 클립 하나는 메인 글과 서브 글을 가진다. Studio 인스펙터에서 두 글을 고친다. 서브가 비면 서브 줄이 보이지 않는다.
4. 글 안의 `*단어*` 는 강조색으로 그린다. `\*` 는 별표 글자다. 강조색 기본값은 `#FFB020` 이다(u3 0028).
5. 클립마다 등장 효과(none, pop, rise, shake)를 고른다. 효과는 클립 시작부터 0.3초 동안이다(u3 `U3Short.tsx:145-148` 과 같은 식).
6. 클립마다 글 색과 크기 배율(50–200%)을 재정의한다.
7. 레이어마다 폰트(Pretendard, Gmarket Sans, TmonMonsori), 메인·서브 크기, 글 색, 자막바 여부·색·불투명도, 위치(x, y)가 있다. 레이어는 트랙 하나에 놓인다.
8. `openfilm skills` 에 u3 skill(`u3-subtitles`)이 「u3」 출처로 나온다. 에이전트는 이 skill 로 대본·말투·성격·전역 자막 지침을 읽는다.
9. 자막 클립이 있는 film 에서 Studio 자막 오버레이는 꺼진다. 기존 `.vtt` 와 `subtitles.json` 은 지우지 않는다.
10. 미리보기 프레임과 내보낸 mp4 의 같은 시각 프레임이 같다(허용 오차는 검증 기준 6번).

## 설계
### 템플릿 페이지
- 원본: `u3/pages/u3-subtitle.html` 하나. `u3/pages/fonts/` 에 폰트와 라이선스 파일.
- 프로젝트로 복사: `get subtitles` 가 레이어 파일 `scenes/u3-subtitle-<layer>.html` 이 없으면 원본을 복사한다. 폰트는 `scenes/fonts/` 에 복사한다. 이미 있으면 덮어쓰지 않는다(사람이 고친 레이어 스타일을 지키기 위해서다).
- 페이지 구조: `#main-src`, `#sub-src` 는 숨긴 원본 글 요소다. `#main`, `#sub` 는 보이는 요소다. `window.film = { width, height, ready, frame(t) }`, `duration` 없음. 클립 길이는 src 의 `#t=0,<len>` 으로 정한다(`SPEC.md:53-55`).
- 강조 그리기: 호스트는 `frame(t)` 뒤에 override 로 `#main-src` 의 텍스트 노드를 바꾼다(`src/overrides.mjs:12-54`). 그래서 페이지는 `MutationObserver` 로 `#main-src`·`#sub-src` 의 변화를 받아 `#main`·`#sub` 를 다시 그린다. `*단어*` 는 `<span class="em">` 이 된다. 이 순서가 캡처 전에 끝나는지가 이 설계의 가장 큰 위험이다(우려 사항 2).
- 효과: `frame(t)` 가 `--u3-p = clamp(t/0.3, 0, 1)` 을 계산해 `transform` 을 정한다. pop `scale(0.8+0.2p)`, rise `translateY(24(1−p)px)`, shake `translateX(6(1−p)·sin(6πp)px)`.
- props 선언(`data-props`): `메인`(text, at `#main-src`), `서브`(text, at `#sub-src`), `효과`(var `--u3-anim`), `색`(var `--u3-color`), `크기`(var `--u3-scale`), `강조색`(var `--u3-em`).
- 레이어 스타일: 레이어 파일 `:root` 의 `--u3-font`, `--u3-main-size`, `--u3-sub-size`, `--u3-color`, `--u3-bar`, `--u3-bar-color`, `--u3-bar-opacity`, `--u3-x`, `--u3-y`. Studio 는 클립 단위로만 재정의한다. 레이어 전체를 바꾸는 것은 에이전트가 파일을 고치는 일이다(우려 사항 3).
- 클립 상자: 무대 전체(`box` 없음). 위치는 페이지 안의 `--u3-x`, `--u3-y` 다.

### 가져오기 `get subtitles`
- `studio/server/u3-subtitles.mjs` (new): `.vtt` 읽기 → `subtitle-segments.mjs` 규칙으로 cue 자르기 → 클립 목록 → film.html 쓰기. 쓰기는 기존 ops 경로(`studio/server/ops.mjs` 의 insert)를 쓴다.
- 클립 id 는 `u3sub-<layer>-<n>` 이다. 다시 실행하면 같은 레이어의 `u3sub-` 클립을 지우고 새로 넣는다. 사람이 고친 클립도 지워지므로 `--layer` 를 새로 주거나 클립 id 를 바꾸면 보존된다고 skill 에 쓴다.
- `get.mjs`: `VERBS.subtitles`(options `src` 필수, `layer` 선택), `runGet` 의 `call` 분기(`:282`) 옆에 로컬 분기 한 줄, catalog(`:539-545`)에서 로컬 verb 를 provider 없이 보이게 하는 예외 한 줄.
- 실행 뒤 자막 클립이 있으면 `subtitles.json` 의 `on` 을 `false` 로 쓴다.

### skill
- `u3/skills/u3-subtitles/SKILL.md` (new): 대본·말투·성격·전역 자막 지침(u3 `DEFAULT_CAPTION_GUIDE` 의 "한 줄 16자, 초당 12자"), `*단어*` 규칙, `get subtitles` 사용법, 레이어 파일 고치는 법, 다시 가져오면 덮어쓴다는 경고.
- `src/skills.mjs`: `SKILL_SOURCES` 에 `u3`, `u3SkillsDir()`(`OPENFILM_U3_SKILLS` 또는 체크아웃의 `u3/skills`), `listSkills`·`usableSkills` 의 places. `skills-cli.mjs` 라벨, `server.mjs` 의 install/remove 분기(u3 는 읽기 전용), UI `SkillsLibrary.tsx`·`project-sources.ts` 타입.
- 데스크톱: `release.mjs` extraResources 에 `u3/skills`, `main.mjs` 에 `OPENFILM_U3_SKILLS`.
- `MANUAL.md:84` "never draw subtitles in a page" 에 한 문장을 더한다: u3 자막 클립(`get subtitles`)은 예외다(우려 사항 1).

### 화면
- 새 화면은 없다. 기존 인스펙터의 props 편집을 쓴다. 효과는 `var` prop 이라 글 입력이다(none·pop·rise·shake). 선택 상자가 필요하면 다음 변경으로 넘긴다.

## 결정
- 레이어 하나는 템플릿 파일 하나이고, 클립별 값은 component props 다 — [0006](../../decisions/0006-subtitle-clip-template.md)
- `.vtt` 가져오기는 `openfilm get subtitles` 로컬 verb 다 — [0007](../../decisions/0007-get-subtitles-local-verb.md)
- u3 skill 은 `skills.mjs` 의 네 번째 소스 `u3` 로 등록한다 — [0008](../../decisions/0008-u3-skill-source.md)
- 자막 클립이 있는 film 에서는 Studio 자막을 끄고, 번역·SRT·burn-in 은 자막 클립을 다루지 않는다 — [0009](../../decisions/0009-studio-subtitles-off-with-clips.md)

## 우려 사항
1. **openfilm 규약과 충돌한다.** `SPEC.md:124-125` 는 호스트가 자막을 그림에 그리지 않는다고 하고, `MANUAL.md:84` 는 "never draw subtitles in a page" 다. 결정 0005 는 이를 뒤집는다. 공식 skill 과 MANUAL 을 읽은 에이전트는 자막 클립을 피할 수 있다. 정책 소유자: 제품 책임자. 추천: `MANUAL.md` 에 u3 예외 한 문장을 넣고 SPEC.md 는 두지 않는다. 이유: 에이전트가 읽는 문서는 MANUAL 이고, SPEC 은 film 형식의 규약이라 형식은 그대로다.
2. **강조 그리기의 순서.** override 가 `frame(t)` 뒤에 적용된다. MutationObserver 재그리기가 캡처 전에 끝나지 않으면 첫 프레임에 별표 글이 보인다. 정책 소유자: 엔지니어링. 추천: plan 첫 단계에서 `openfilm look` 과 render 로 실측하고, 실패하면 호스트의 override 적용 뒤 `filmHost.settle` 단계에서 다시 그리는 방법으로 바꾼다.
3. **레이어 스타일을 Studio 에서 한 번에 바꾸지 못한다.** u3 는 레이어 스타일을 한 곳에서 바꾼다. 이 설계는 클립 단위 재정의만 Studio 에서 하고, 레이어 전체는 파일을 고쳐야 한다. 정책 소유자: 제품 책임자. 추천: 이 변경에서는 받아들이고, u3 패널에 「자막 레이어」 편집을 다음 변경으로 둔다.
4. **기존 자막 기능을 잃는다.** 자막 클립 film 에서 번역, SRT 내보내기, burn-in, NLE 자막 트랙이 동작하지 않는다. 정책 소유자: 제품 책임자. 추천: 받아들인다. 숏폼은 번인된 자막 클립으로 충분하다. SRT 가 필요하면 자막 클립에서 SRT 를 만드는 변경을 따로 둔다.
5. **0003 의 「등록 한 줄」을 넘는다.** skill 소스 추가는 7곳을 고친다. 정책 소유자: 엔지니어링. 추천: 받아들인다. 대안(앱 시작 때 `mine` 폴더로 복사)은 사람의 skill 과 섞이고 CLI 에서 동작하지 않는다.
6. **TmonMonsori 라이선스가 OFL 이 아니다.** 별도 문서(pdf, docx)다. 정책 소유자: 제품 책임자. 추천: 이 변경에 넣고 INTENT 제약대로 공개 배포 전에 확인한다.

## 검증 기준
1. `pnpm run verify` 가 exit 0, 마지막 줄 `✓ verify passed`.
2. `node --test`: 같은 `.vtt` 를 두 번 가져오면 film.html 이 같다. cue 수와 클립 수가 같다. `*단어*`·`\*` 파싱 사례. 효과 진행값(t=0, 0.15, 0.3, 1). skill 목록에 `u3` 출처.
3. `openfilm look scenes/u3-subtitle-main.html 0.15` 가 pop 효과 중간 프레임을 그린다(크기 0.9 배).
4. Studio(Aside): 자막 클립을 고르면 인스펙터에 메인·서브·효과·색·크기·강조색이 보이고, 고치면 미리보기에 반영된다.
5. `*강조*` 가 들어간 클립을 `openfilm look`(film 전체)과 render 로 그려 첫 프레임에 별표가 보이지 않는다(우려 사항 2).
6. 같은 film 의 세 시각에서 Studio 미리보기 프레임과 render mp4 프레임을 비교한다. 픽셀 차이 평균이 2% 이하다.
