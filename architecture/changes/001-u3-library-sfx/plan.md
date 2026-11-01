# Plan: u3-library-sfx (lite)
Track: lite.

## 검토 목록
- **권리 미확인 효과음을 앱 번들에 넣는다.** 82개 모두 myinstants.com 출처이고 라이선스가 없다. 사용자 답: 「레포 커밋 + 앱 번들」. 그래서 INTENT 제약을 "공개 배포 전에 재배포 권리를 확인한다" 로 고친다. 추천은 공개 배포 전 권리 확인이다. 근거: `u3/src-tauri/resources/library/sfx/*/*.json` 의 `license: "myinstants"`.
- **설정 화면의 keyless 안내 문구가 웹 검색용이다.** "검색이 {name} 으로 간다" 로 나온다. 이 변경에서는 고치지 않는다. 추천은 whisper asr 변경에서 로컬 provider 문구와 함께 고치는 것이다. 이유는 그 변경이 INTENT 열린 질문 「keyless 로컬 provider 표시」의 답이기 때문이다. 근거: `studio/ui/src/i18n/ko.ts:2017`.
- **`sfx` provider 는 하나만 고른다.** ElevenLabs 를 쓰는 사람은 라이브러리를 `--via u3-library` 로 부른다. 추천: 그대로 둔다. 스킬 문서화는 짤 변경에서 u3 스킬과 함께 한다.

## Context
INTENT 기대 결과 1번: 번들 효과음을 `openfilm get sfx` 와 Studio 패널로 찾아 타임라인에 놓는다. 지금 openfilm 의 `sfx` 는 생성형(ElevenLabs)뿐이다. u3 는 효과음 82개를 카테고리 11개로 갖는다. 결정 0003 에 따라 provider·패널로 넣고 코어는 등록 한 줄만 고친다.

## 결정
- 사용자 지시: 「u3 의 핵심(짤방, 효과음, 자막)을 추가한다」, 「다음 작업을 이어서 계속해」.
- 받은 답: 효과음 파일은 레포에 커밋하고 데스크톱 앱 번들에도 넣는다.
- 라이브러리 형식은 u3 그대로다. `u3/library/sfx/<category>/sfx-<id>.mp3` 와 같은 이름의 `.json` 사이드카(id, category, title, source, license, durationSec). 변환하지 않고 폴더째 복사한다.
- 라이브러리 위치: `OPENFILM_U3_LIBRARY` 환경 변수, 없으면 소스 체크아웃의 `<repo>/u3/library`(모듈 경로 기준). 데스크톱 패키지 앱은 `resources/u3-library` 를 그 변수로 넘긴다.
- provider `u3-library`: `keyless: true`, `verbs: ['sfx']`. 생성하지 않고 검색한다. `--prompt` 로 점수를 매겨 1위 파일을 `assets/audio/sfx/<out>.mp3` 로 돌려준다. receipt 에 `{provider, id, title, category, src, dur, candidates: 상위 5}` 를 넣는다. `--sec` 는 쓰지 않고 receipt 에 무시했다고 적는다. 같은 점수면 id 순서로 정해 결정론을 지킨다(0004).
- 점수는 u3 `src/core/sfx.ts` 의 `sfxSituationScore`, `SCENE_SFX_USES`, `MEME_EMOTION_SFX` 를 그대로 옮긴다. Jev 재순위는 파이프라인 변경에서 한다.
- Studio 패널 `U3LibraryPanel`: 레이아웃 메뉴에 스위치 하나, 왼쪽 열에 LayersPanel 과 같은 방식으로 마운트한다. 검색, 카테고리 필터, `<audio>` 미리 듣기, 끌기를 한다.
- 끌기는 기존 `saved` 경로와 같은 모양이다. 드래그 항목에 `u3Library: <id>` 를 싣는다. `dropAsset` 이 먼저 서버에 놓기를 요청해 프로젝트 경로를 받고, 그 경로로 기존 삽입을 한다. 같은 파일이 이미 `assets/audio/sfx/` 에 같은 크기로 있으면 다시 복사하지 않고 그 경로를 쓴다.

## 대조
- 0003(코어 미수정): 코어 파일은 등록 수준만 고친다. `ProjectView.tsx`(상태 1줄, 마운트 블록, `dropAsset` 분기 5줄), `ProjectLayoutMenu.tsx`(항목 1개, prop 2개), `resource-drag.ts`(필드 1개), `server.mjs`(라우트 2줄), `providers/index.mjs`(import·OWN 1개씩), `main.mjs`(env 1줄), `release.mjs`(extraResources 1항목).
- 0004(결정론): 같은 prompt 는 같은 파일을 고른다. 테스트로 확인한다.
- 진행 중인 다른 변경: 없음.

## 바꿀 파일
`packages/openfilm` 기준.
- `studio/server/u3-library.mjs` (new): 라이브러리 위치 결정, 사이드카 읽기(목록 캐시는 mtime 기준), 점수·정렬, 라우트 두 개.
  - `GET /api/u3/library/sfx?q=&category=` → `{dir: 있음|없음, items: [{id, category, title, durationSec}]}`
  - `GET /api/u3/library/file?id=` → 오디오 바이트(`audio/mpeg`). id 는 라이브러리 안 경로만 허용한다.
  - `POST /api/projects/:id/u3/library/place {id}` → `{path}`. 기존 `files.mjs` `bringIn(root, 'assets/audio/sfx', [abs], 'copy')` 를 쓴다.
- `studio/server/u3-library.test.mjs` (new): 임시 폴더에 가짜 mp3·json 을 만들어 시험한다.
- `studio/server/providers/u3-library.mjs` (new): provider. 파일 읽기와 점수는 `u3-library.mjs` 를 쓴다. 경로는 `common.mjs` `landing('audio/sfx', out, 'mp3')`.
- `studio/server/providers/u3-library.test.mjs` (new).
- `studio/server/providers/index.mjs`: import 1줄, `OWN` 에 1개.
- `studio/server/providers/index.test.mjs`, `studio/server/get.test.mjs`: provider 목록·`services()` 문장 단언에 `u3-library` 를 더한다.
- `studio/server/server.mjs`: 전역 `parts[0] === 'u3'` 1줄, 프로젝트 모듈 라우트 1줄(`markersRoute` 와 같은 모양).
- `studio/ui/src/components/U3LibraryPanel.tsx` (new): 패널.
- `studio/ui/src/lib/u3-library.ts` (new) + `u3-library.test.ts` (new): 목록 필터와 드래그 항목 만들기 순수 함수.
- `studio/ui/src/lib/resource-drag.ts`: `u3Library?: string` 필드.
- `studio/ui/src/components/ProjectView.tsx`: `useKeptFlag('openfilm.project.u3library', false)`, 왼쪽 열 마운트, `dropAsset` 분기.
- `studio/ui/src/components/ProjectLayoutMenu.tsx`: 스위치 항목 1개.
- `studio/ui/src/i18n/en.ts`, `ko.ts`: `u3Library` 키(제목, 검색, 전체, 없음 안내, 레이아웃 이름). 다른 언어는 영어로 대체된다.
- `apps/desktop/scripts/release.mjs`: `extraResources` 에 `{ from: <repo>/u3/library, to: 'u3-library' }`.
- `apps/desktop/src/main.mjs`: 패키지 앱이고 `resources/u3-library` 가 있으면 `OPENFILM_U3_LIBRARY` 를 Studio 환경에 넣는다.
- `u3/library/sfx/**` (new): u3 `src-tauri/resources/library/sfx` 복사, 164개 파일.
- `u3/library/README.md` (new): 출처(myinstants.com), 권리 미확인 상태, 형식.
- `architecture/INTENT.md`: 제약 한 줄 수정, 변경 후보 표에서 1번 제거.

## 순서
1. 라이브러리 파일 복사와 README.
2. `u3-library.mjs` 의 순수 부분(읽기, 점수)과 테스트.
3. provider 와 테스트, `index.mjs` 등록, 기존 목록 테스트 수정.
4. 서버 라우트와 테스트.
5. UI 순수 함수와 테스트, 패널, ProjectView·레이아웃 메뉴·드래그 연결, i18n.
6. 데스크톱 `release.mjs`·`main.mjs`.
7. INTENT 수정, 검증 명령, Studio 수동 확인.

## 리스크
- **가장 위험한 단계는 5단계다.** `ProjectView.tsx` 는 3637줄이고 업스트림이 자주 바꾼다. 삽입을 세 곳으로 묶어 병합 충돌 범위를 줄인다.
- 라이브러리 경로 탈출: `file?id=` 와 `place` 가 `../` 로 라이브러리 밖 파일을 읽을 수 있다. 정규화 후 라이브러리 루트 안인지 확인하고, 테스트로 막힌다는 것을 보인다.
- 기존 테스트가 provider 전체 목록과 순서를 단언한다. 그 단언만 고치고 다른 기대값은 바꾸지 않는다.
- 택하지 않은 대안:
  - MediaPool 의 세 번째 scope 로 넣기. MediaPool 내부를 더 많이 고쳐야 한다.
  - 패널에서 「프로젝트에 추가」 버튼만 두기. u3 의 끌어 놓기 동작과 다르다.
  - 사이드카를 `index.json` 하나로 변환하기. u3 와 형식이 갈라진다.

## 증명
- `node --test`:
  - "놀람" → shock 카테고리 1위, "반전" → reveal 또는 shock 1위(u3 점수 규칙).
  - 같은 prompt 두 번이 같은 파일을 고른다.
  - provider 결과 경로가 `assets/audio/sfx/<out>.mp3` 이고 bytes 가 원본과 같다.
  - 라이브러리가 없으면 위치를 알려 주는 오류를 낸다.
  - `file?id=../x`, `place {id:'../x'}` 가 거부된다.
  - 같은 파일을 두 번 place 하면 같은 경로를 돌려준다.
  - UI 순수 함수: 검색·카테고리 필터, 드래그 항목의 `path`·`kind: 'audio'`·`durationMs`.
- `pnpm run verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- Studio 수동(`pnpm dev`, 화면 확인은 Aside):
  - 설정에서 u3 Library 연결, `openfilm get sfx --via u3-library --out boom --prompt 놀람` 이 파일을 만든다.
  - 레이아웃 메뉴로 패널을 열고, 미리 듣고, 타임라인에 끌어 audio 클립이 생기는 것과 재생을 확인한다. 같은 효과음을 두 트랙에 놓는다.
- 데스크톱 패키지 빌드에 `resources/u3-library` 가 들어가는지는 이 변경에서 빌드하지 않는다. 미검증으로 보고하고 릴리스 변경에서 확인한다.

## 롤백
새 파일과 등록 줄만 더한다. 데이터 형식 변경이 없다. 되돌리기는 병합 커밋 revert 하나다. 이미 프로젝트로 복사된 효과음 파일은 일반 assets 파일로 남는다.

## 구현에서 달라진 것
- `studio/ui/src/lib/provider-marks.ts` 에 마크 하나를 더했다. 기존 테스트가 provider 마다 마크를 요구한다.
- `resource-drag.ts` 의 normalize 에 `u3Library` 한 줄을 더했다. 없으면 drop 때 값이 사라진다.
- 패널 폭과 `PaneDivider` 는 `U3LibraryPane` 이 갖는다. `ProjectView.tsx` 의 삽입은 import 2줄, 상태 1줄, 메뉴 prop 1줄, 마운트 1줄, `dropAsset` 분기다.
- API 호출 함수는 `lib/u3-library.ts` 에 둔다.
- 1위 점수가 0 이면 파일을 내지 않고 카테고리 목록을 담은 오류를 낸다. prompt 와 무관한 파일을 넣지 않기 위해서다.
- provider `env` 는 `OPENFILM_U3_LIBRARY_KEY` 다. 라이브러리 위치 변수와 이름을 나눠, 위치를 정하는 것만으로 연결되지 않게 한다. `keysUrl`·`billingUrl` 이 비어 설정 화면의 「키 추가」 버튼이 쓸모없다. whisper asr 변경에서 keyless 문구와 함께 고친다.

## 확인 결과
- 작업자 실행 `pnpm run verify`: exit 0, `✓ verify passed`.
- Studio 수동(Aside): 설정에서 u3 Library 연결됨, 패널 82개 표시, shock 미리 듣기, 같은 효과음을 A1·A2 두 트랙에 놓음(같은 파일 재사용).
- CLI: `get sfx --via u3-library --out boom --prompt 놀람` exit 0, `assets/audio/sfx/boom.mp3`. `--prompt 날씨` exit 1, 카테고리 안내.
- 미검증: 데스크톱 패키지 빌드의 `resources/u3-library`. 릴리스 변경에서 확인한다.
