# Spec: u3-subtitle-clips
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
- **인스펙터가 메인·서브·강조·효과 편집을 감당하는가**: 감당한다고 본다. component props 는 film.html 의 클립 속성(`data-props`, `overrides`)이고 클립마다 값을 갖는다. 같은 src 를 쓰는 두 클립도 다른 값을 가진다(`studio/ui/src/lib/component-props.ts`, `ops.test.mjs:94`). 화면 확인은 검증 기준 4번이다.
- **레이어 표현**: 레이어 하나는 템플릿 파일 하나다(`scenes/u3-subtitle-<layer>.html`). 레이어 스타일은 그 파일 `:root` 의 CSS 변수 기본값이다. 결정 0006.
- **`.vtt` 가져오기 형태**: `openfilm get subtitles` 로컬 verb 다. 결정 0007.
- **u3 skill 등록**: `src/skills.mjs` 의 네 번째 소스 `u3` 다. 결정 0008.
- **기존 Studio 자막**: u3 자막 클립이 있는 film 에서는 Studio 자막 cue 를 내지 않는다. `subtitles.json` 은 건드리지 않는다. 결정 0010(0009 대체).
- **등장 효과를 `frame(t)` 로 그릴 수 있는가**: 그렇다. `frame(t)` 는 진행값만 쓰고, 효과 종류는 CSS 변수로 고른다. 호스트가 `frame` 뒤에 override 를 적용해도 캡처 때의 스타일 계산에 반영된다.
- **미리보기와 내보내기가 같은가**: 다음 단계로 넘김. 검증 기준 6번으로 실측한다.

## 요구사항
1. `openfilm get subtitles --src <vtt> [--layer <name>]` 는 cue 하나마다 자막 클립 하나를 film.html 에 더한다. cue 를 다시 자르지 않는다. 클립의 `at` 과 길이는 cue 의 시각이다. `--layer` 가 없으면 레이어 이름은 `layer1` 이다.
2. 같은 `.vtt` 와 같은 film.html 로 두 번 실행하면 같은 film.html 이 된다. 같은 레이어의 기존 가져오기 클립은 바뀌고 늘지 않는다.
3. 레이어는 처음 가져올 때 새 트랙 하나를 만들고, 이후 같은 레이어는 그 트랙을 쓴다. 겹치는 cue 는 앞 cue 의 끝을 다음 cue 의 시작으로 줄인다.
4. 자막 클립 하나는 메인 글과 서브 글을 가진다. Studio 인스펙터에서 두 글을 고친다. 서브가 비면 서브 줄이 보이지 않는다.
5. 글 안의 `*단어*` 는 강조색으로 그린다. `\*` 는 별표 글자다. 강조색 기본값은 `#FFB020` 이다(u3 0028). `.vtt` 에서 가져온 글의 `*` 는 `\*` 로 바꿔 저장한다(u3 0028).
6. 클립마다 등장 효과(none, pop, rise, shake)를 고른다. 효과는 페이지 시각 0 부터 0.3초 동안이다(u3 `U3Short.tsx:145-148` 과 같은 식).
7. 클립마다 글 색과 크기 배율을 재정의한다. 배율은 페이지가 0.5–2 로 제한한다.
8. 레이어마다 폰트(Pretendard, Gmarket Sans, TmonMonsori), 메인·서브 크기, 글 색, 자막바 여부·색·불투명도, 위치(x, y)가 있다.
9. `openfilm skills` 에 u3 skill 두 개(`u3-subtitles`, `u3-media`)가 「u3」 출처로 나온다. `u3-subtitles` 는 대본·말투·성격·전역 자막 지침을, `u3-media` 는 효과음·짤 사용법(001·002 가 넘긴 것)을 담는다.
10. u3 자막 클립이 있는 film 에서는 Studio 자막(미리보기 오버레이, burn-in, SRT 내보내기, NLE 자막 트랙)이 나오지 않는다. 기존 `.vtt` 와 `subtitles.json` 은 그대로다.
11. 미리보기 프레임과 내보낸 mp4 의 같은 시각 프레임이 같다(허용 오차는 검증 기준 6번).

## 설계
### 템플릿 페이지
- 원본: `u3/library/pages/u3-subtitle.html`, 폰트와 라이선스는 `u3/library/pages/fonts/`. 001 이 만든 `OPENFILM_U3_LIBRARY` 와 데스크톱 번들(`resources/u3-library`)이 그대로 싣는다.
- 프로젝트로 복사: `get subtitles` 가 레이어 파일 `scenes/u3-subtitle-<layer>.html` 이 없으면 원본을 복사하고, 폰트를 `scenes/fonts/` 에 복사한다. 이미 있으면 덮어쓰지 않는다(사람이 고친 레이어 스타일을 지킨다).
- 페이지 구조: `#main-src`, `#sub-src` 는 숨긴 원본 글 요소다. `#main`, `#sub` 는 보이는 요소다. `window.film = { width, height, ready, frame(t) }`, `duration` 없음. 클립 길이는 src 의 `#t=0,<len>` 이다(`SPEC.md:53-55`). `ready` 에서 세 폰트를 `document.fonts.load` 한다.
- 강조: `frame(t)` 와 `MutationObserver` 가 둘 다 `#main-src`·`#sub-src` 를 읽어 `#main`·`#sub` 를 다시 그린다. `*단어*` 는 `<span class="em">` 이다. 호스트가 `frame` 뒤에 override 로 글을 바꾸므로(`src/timeline.mjs:1035-1040`), observer 가 캡처 전에 도는지가 가장 큰 위험이다(우려 사항 2).
- 효과: `frame(t)` 는 `--u3-p = clamp(t/0.3, 0, 1)` 만 쓴다. 효과 종류는 클립 var `--u3-pop`, `--u3-rise`, `--u3-shake`(0 또는 1)이고, transform 은 CSS 식 하나다: `scale(calc(1 - 0.2*var(--u3-pop)*(1 - var(--u3-p)))) translateY(calc(24px*var(--u3-rise)*(1 - var(--u3-p)))) translateX(calc(6px*var(--u3-shake)*(1 - var(--u3-p))*sin(calc(var(--u3-p)*3turn))))`. override 가 `frame` 뒤에 와도 캡처 때 계산된다.
- 레이어 스타일: 레이어 파일 `:root` 의 `--u3-font`, `--u3-main-size`, `--u3-sub-size`, `--u3-color`, `--u3-bar`, `--u3-bar-color`, `--u3-bar-opacity`, `--u3-x`, `--u3-y`.
- 서브 숨김: `#sub:empty { display: none }`. 크기: `clamp(0.5, var(--u3-scale), 2)`.
- 클립 상자: 무대 전체(`box` 없음).

### 클립 속성(`get subtitles` 가 클립마다 쓴다)
- `data-props`: `메인`(text, at `#main-src`), `서브`(text, at `#sub-src`), `튀어나옴`·`떠오름`·`흔들림`(var `--u3-pop`·`--u3-rise`·`--u3-shake`), `색`(var `--u3-color`), `크기`(var `--u3-scale`), `강조색`(var `--u3-em`).
- `overrides`: cue 글을 `#main-src` 의 text 항목으로. 서브는 빈 값.
- id: `u3sub-<layer>-<n>`.

### 가져오기 `get subtitles`
- `studio/server/u3-subtitles.mjs` (new): `.vtt` 읽기(transcripts 형식의 단어 태그·화자 태그는 글에서 뺀다) → 별표 이스케이프 → 겹침 정리 → 클립 목록 → film.html 쓰기. 쓰기는 기존 ops 경로(`studio/server/ops.mjs` insert, 트랙은 `{insert}` 로 새로 만들거나 레이어 트랙 지정)를 쓴다.
- 다시 실행하면 같은 레이어의 `u3sub-` 클립을 지우고 새로 넣는다. skill 에 이 덮어쓰기를 경고한다.
- `get.mjs`: `VERBS.subtitles`(options `src` 필수, `layer` 선택), `runGet` 의 `call` 분기(`:282`) 옆에 로컬 분기 한 줄, catalog(`:539-545`)에서 로컬 verb 를 provider 없이 보이게 하는 예외 한 줄.

### Studio 자막 끄기(결정 0010)
- `captions.mjs` `filmCaptions`(`:223`) 첫머리에 한 줄: film 에 `u3sub-` 클립이 있으면 cue 를 내지 않는다. 오버레이·burn-in·SRT·NLE 가 모두 이 함수의 cue 를 쓴다. 정확한 호출 경로는 plan 에서 확인한다.
- `subtitles.json`, `.vtt`, 「자막 만들기」는 그대로다. 받아쓰기 결과 `.vtt` 는 `get subtitles` 의 입력이 된다.

### skill
- `u3/skills/u3-subtitles/SKILL.md` (new): 대본·말투·성격·전역 자막 지침(u3 `DEFAULT_CAPTION_GUIDE` 의 "한 줄 16자, 초당 12자"), `*단어*` 규칙, `get subtitles` 사용, 레이어 파일 고치기, 다시 가져오면 덮어쓴다는 경고. 공식 `long-to-short` 의 "Studio draws the subtitles" 지침보다 이 skill 이 앞선다고 쓴다.
- `u3/skills/u3-media/SKILL.md` (new): `get sfx --via u3-library`, `get meme`, 짤 배치 규칙.
- `src/skills.mjs`: `SKILL_SOURCES` 에 `u3`, `u3SkillsDir()`(`OPENFILM_U3_SKILLS` 또는 체크아웃의 `u3/skills`), `listSkills`·`usableSkills` 의 places. `skills-cli.mjs` 라벨, `server.mjs` 의 install/remove 분기(u3 는 읽기 전용), UI `SkillsLibrary.tsx`·`project-sources.ts` 타입.
- 데스크톱: `release.mjs` extraResources 에 `u3/skills`, `main.mjs` 에 `OPENFILM_U3_SKILLS`.
- `MANUAL.md:84` 에 한 문장: u3 자막 클립(`get subtitles`)은 예외다.

### 화면
- 새 화면은 없다. 기존 인스펙터의 props 편집을 쓴다.

## 결정
- 레이어 하나는 템플릿 파일 하나이고, 클립별 값은 component props 다 — [0006](../../decisions/0006-subtitle-clip-template.md)
- `.vtt` 가져오기는 `openfilm get subtitles` 로컬 verb 다 — [0007](../../decisions/0007-get-subtitles-local-verb.md)
- u3 skill 은 `skills.mjs` 의 네 번째 소스 `u3` 로 등록한다 — [0008](../../decisions/0008-u3-skill-source.md)
- u3 자막 클립이 있는 film 에서는 Studio 자막 cue 를 내지 않는다(0009 대체) — [0010](../../decisions/0010-no-studio-cues-with-subtitle-clips.md)

## 우려 사항
1. **openfilm 에이전트 지침과 충돌한다.** `MANUAL.md:84` 는 "never draw subtitles in a page" 이고, 공식 skill `long-to-short` 는 Studio 가 자막을 그린다고 한다. `SPEC.md:124-125` 는 editor 자막을 호스트가 그리지 않는다는 뜻이라 충돌하지 않는다. 정책 소유자: 제품 책임자. 추천: MANUAL 에 u3 예외 한 문장, u3 skill 에 우선 문장. 공식 skill 은 sync 가 덮으므로 고치지 않는다.
2. **강조 그리기의 순서.** override 가 `frame(t)` 뒤에 적용된다. observer 가 캡처 전에 돌지 않으면 첫 프레임에 별표 글이 보인다. 정책 소유자: 엔지니어링. 추천: plan 첫 단계에서 render 로 실측한다. 실패하면 `get subtitles` 가 강조를 HTML 로 미리 만든 두 번째 text 항목(보이는 `#main`)을 함께 쓰는 방법으로 바꾼다.
3. **레이어 스타일을 Studio 에서 한 번에 바꾸지 못한다.** 클립 단위 재정의만 Studio 에서 하고, 레이어 전체는 파일을 고쳐야 한다. 정책 소유자: 제품 책임자. 추천: 받아들이고, 「자막 레이어」 편집 패널은 다음 변경으로 둔다.
4. **기존 자막 기능을 잃는다.** u3 자막 클립 film 에서 번역, SRT 내보내기, burn-in, NLE 자막 트랙이 동작하지 않는다. 정책 소유자: 제품 책임자. 추천: 받아들인다. 필요하면 자막 클립에서 SRT 를 만드는 변경을 따로 둔다.
5. **결정 0003 의 「등록 한 줄」을 넘는다.** skill 소스 추가는 7곳, Studio 자막 끄기는 `captions.mjs` 한 줄이다. 정책 소유자: 엔지니어링. 추천: 받아들인다.
6. **앞을 자른 클립은 효과가 사라진다.** 페이지는 자기 시각만 알고 클립의 trim 을 모른다. 앞을 0.3초 넘게 자르거나 split 한 오른쪽 조각은 효과가 없다. u3 는 클립 시작부터 센다. 정책 소유자: 제품 책임자. 추천: 받아들인다. 호스트 계약을 바꿔야 고칠 수 있다.
7. **TmonMonsori 라이선스가 OFL 이 아니다.** 정책 소유자: 제품 책임자. 추천: 이 변경에 넣고 공개 배포 전에 확인한다.

## 검증 기준
1. `pnpm run verify` 가 exit 0, 마지막 줄 `✓ verify passed`.
2. `node --test`: 같은 `.vtt` 를 두 번 가져오면 film.html 이 같다. cue 수와 클립 수가 같다. 겹친 cue 는 줄어든다. `.vtt` 의 `*` 는 `\*` 로 저장된다. `*단어*`·`\*` 파싱. u3 자막 클립이 있으면 `filmCaptions` 가 빈 cue 를 낸다. skill 목록에 `u3` 출처 두 개.
3. pop 효과 클립 하나를 둔 film 을 `openfilm look <film> <클립 시작+0.15>` 로 그려 글 크기가 0.9 배 근처다.
4. Studio(Aside): 자막 클립을 고르면 인스펙터에 메인·서브·효과·색·크기·강조색이 보이고, 고치면 미리보기에 반영된다.
5. `*강조*` 가 들어간 클립을 `openfilm render` 로 그려 첫 프레임에 별표가 보이지 않는다(우려 사항 2).
6. 같은 film 의 세 시각에서 Studio 미리보기 프레임과 render mp4 프레임을 비교한다. 픽셀 차이 평균이 2% 이하다.
