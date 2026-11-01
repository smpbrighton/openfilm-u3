# Plan: u3-library-memes (lite)
Track: lite.

## 검토 목록
- **범위를 나눈다.** 이 변경은 규칙 점수 짤 검색, `meme` verb, 패널 짤 탭, 중복 금지만 다룬다. bge-m3 임베딩과 onnxruntime 은 새 변경 `u3-meme-embed` 로 뺀다. 이유: 짤 전체를 한 번에 하면 full 신호(작업량이 크고 구성 요소가 여럿)에 해당한다. u3 결정 0004 도 모델 전에는 규칙 점수로 순위를 정한다. INTENT 변경 후보 표에 `u3-meme-embed` 를 더한다.
- **짤 212MB 는 GitHub Release asset 이다(사용자 답).** 비공개 레포의 prerelease `library-memes-1` 에 tar 하나로 올린다. 받기에는 `gh` 인증이 필요하다. 레포의 `u3/library/memes/` 는 gitignore 한다. 근거: INTENT 열린 질문 「짤 라이브러리 212MB 위치」.
- **배치 지침은 skill 이 아니라 verb help 에 쓴다.** "위쪽 트랙, 가운데, 화면 폭 60%, 2초 이하, 소리 없음, 원본 영상마다 하나 이상"을 `openfilm get meme --help` 문장에 넣는다. skill 등록 방식(INTENT 열린 질문)은 자막 클립 변경에서 정한다. 추천 이유: 지금 skill 을 넣으면 등록 방식을 먼저 정해야 한다.
- **패널에서 끈 짤은 가운데 60% 폭으로 놓는다(u3 0016).** 기존 미디어 끌기는 화면에 꽉 차게 놓는다. u3 분기에서만 box 를 직접 계산한다.
- **짤도 권리가 확인되지 않았다.** 출처는 giphy·tenor 이다. INTENT 제약대로 공개 배포 전에 확인한다.

## Context
INTENT 기대 결과 2번: `openfilm get meme` 이 프롬프트에 맞는 짤을 위쪽 트랙의 작은 클립으로 낸다. 같은 짤이 한 프로젝트에서 두 번 쓰이지 않는다. 효과음 변경(001)이 만든 `u3-library` provider·패널·라우트를 확장한다.

## 결정
- 사용자 지시: 「다음 작업을 이어서 계속해」. 받은 답: 짤 라이브러리는 GitHub Release asset.
- 라이브러리 형식은 u3 그대로다. `u3/library/memes/<emotion-ascii>/<id>.mp4` + `<id>.json`(id, emotion, situations, description, durationSec, width, height, importedAt, tagsConfirmed, sourceUrl). 2,195쌍, 14 감정.
- 받기: `u3/scripts/fetch-library.mjs` (new). 고정된 태그·파일명·sha256 으로 `gh release download` 하고, 해시를 확인한 뒤 `u3/library/memes` 에 푼다. 이미 같은 해시면 건너뛴다. 업로드 절차는 `u3/library/README.md` 에 적는다.
- 업로드: 구현 중 한 번 한다. 소스 u3 `src-tauri/resources/library/memes` 를 이름 정렬 tar 로 묶고 `gh release create library-memes-1 --prerelease --repo smpbrighton/openfilm-u3` 로 올린다. 비공개 레포라 외부 공개가 아니다.
- 점수는 u3 `src/core/meme-match.ts` 를 그대로 옮긴다. `scoreMeme`, `descriptionScore`, `matchMemes`(exclude, recent −6, 동점은 importedAt 내림차순 다음 id). 1위 점수가 0 이면 감정 목록을 담은 오류를 낸다(001 과 같다).
- verb `meme`: `dir: 'assets/video/memes'`, options `out`(필수), `prompt`(필수, 장면 설명), `reaction`(선택, 14 감정 중 하나). provider `u3-library` 의 `verbs` 가 `['sfx', 'meme']` 가 된다. 결과는 `assets/video/memes/<out>.mp4`, index row `{src, kind:'video', w, h, dur, hasAudio:false, from:{mode:'library', provider, id, prompt}}`, receipt 에 후보 상위 5.
- 중복 금지: provider 가 `ctx.read('film.html')` 를 `film-doc.mjs` `readFilmFile` 로 읽어 video 클립 src 를 모은다. 그 파일 크기와 같은 라이브러리 짤만 내용 해시로 비교해 같은 것을 exclude 한다. 이름이 바뀐 복사본도 잡는다. `src/seekable.mjs` `filmVideos` 의 순회 방식을 따른다.
- 패널: `U3LibraryPanel` 에 효과음·짤 탭. 짤 탭은 감정 필터, 검색, 클릭 시 `<video muted loop>` 미리 보기, 끌기. 목록 라우트는 `GET /api/u3/library/memes?q=&emotion=`, 파일은 기존 `file?id=` 를 종류별로 넓힌다. place 는 `assets/video/memes` 로 복사한다.
- 패널 끌기의 box: `lib/u3-library.ts` 의 순수 함수가 무대 폭 60%, 가운데, 짤 비율로 계산한다. `dropAsset` 의 u3 분기가 짤이면 그 box 로 insert 한다.

## 대조
- 0003: 코어는 등록 수준. 새로 고치는 코어는 `get.mjs`(VERBS·WORDS 항목), `contract.mjs`(Verb union), `providers/index.mjs`(USE_VERBS), UI `providers.ts`·`ProvidersSection.tsx`·`ModelsSection.tsx` 의 verb 목록, `ProjectView.tsx` u3 분기 몇 줄, i18n 키.
- 0004: 같은 입력과 같은 film.html 은 같은 짤을 고른다.
- 001(병합됨): 같은 파일들을 확장한다. 진행 중인 다른 변경 없음.

## 바꿀 파일
`packages/openfilm` 기준.
- `studio/server/u3-library.mjs`: 짤 읽기(사이드카, mtime 캐시), `scoreMeme`·`matchMemes`, 사용 중 짤 찾기, 짤 목록 라우트, file·place 의 종류 확장.
- `studio/server/u3-library.test.mjs`: u3 `tests/core/meme-match.test.ts` 사례(10, 8, 5, 4, 2, 10.5, 0점, descriptionScore 3.6, 동점, exclude·recent) 이식. 사용 중 짤 제외, 경로 탈출 거부.
- `studio/server/providers/u3-library.mjs`(+test): `meme` 처리.
- `studio/server/get.mjs`: `VERBS.meme`(help 에 배치 지침), `WORDS.meme`.
- `studio/server/providers/contract.mjs`: `Verb` 에 `'meme'`, 상단 표 주석.
- `studio/server/providers/index.mjs`: `USE_VERBS` 에 `'meme'`.
- `studio/server/get.test.mjs`: :441 정규식만 고친다.
- `studio/ui/src/lib/providers.ts`, `components/settings/ProvidersSection.tsx`, `components/settings/ModelsSection.tsx`: verb 목록에 `meme`.
- `studio/ui/src/i18n/en.ts`, `ko.ts`: `settings.providers.verbs.meme`, `settings.models.about.meme`, 패널 짤 탭 문자열.
- `studio/ui/src/components/U3LibraryPanel.tsx`: 탭, 짤 목록, 미리 보기.
- `studio/ui/src/lib/u3-library.ts`(+test): 짤 API, 필터, 드래그 항목, 60% box.
- `studio/ui/src/components/ProjectView.tsx`: u3 분기에서 짤 box.
- `MANUAL.md`, `bin/openfilm.mjs` 도움말: get 목록에 memes.
- `u3/scripts/fetch-library.mjs` (new), `u3/library/README.md`, 루트 `.gitignore`(`u3/library/memes/`).
- `apps/desktop/scripts/release.mjs`: 번들 전에 `fetch-library.mjs` 를 실행한다. 실패하면 빌드를 멈춘다.
- `architecture/INTENT.md`: 변경 후보 표에서 2번 제거, `u3-meme-embed` 추가, 짤 위치 열린 질문 제거.

## 순서
1. tar 만들기, sha256, Release 업로드, `fetch-library.mjs`, gitignore, README. 받아서 2,195쌍인지 확인.
2. 서버 짤 읽기·점수·테스트.
3. verb 등록과 provider `meme`, 중복 금지, 테스트.
4. 라우트 확장과 테스트.
5. UI verb 목록·i18n, 패널 짤 탭, 60% box, 테스트.
6. release.mjs, MANUAL·도움말, INTENT.
7. 검증 명령, Studio 수동 확인.

## 리스크
- **가장 위험한 단계는 1단계다.** 레포 밖으로 212MB 를 올린다. 비공개 레포이고 지우면 되돌릴 수 있다. 해시를 고정해 다른 파일이 섞이지 않게 한다.
- 짤 2,195개 사이드카를 요청마다 읽으면 느리다. 001 과 같은 mtime 캐시를 쓴다.
- 중복 검사가 film.html 의 큰 video 파일을 읽는다. 크기가 같은 것만 해시하므로 보통 0–1개다.
- verb 를 더하면 설정 화면 목록이 바뀐다. 다른 언어는 영어로 나온다.
- 택하지 않은 대안: 레포 직접 커밋, Git LFS(사용자 답). 이름에 id 를 넣어 중복을 찾기(이름을 바꾸면 놓친다). skill 로 배치 지침 주기(등록 방식 미정).

## 증명
- `node --test`: u3 meme-match 사례 전부. 같은 prompt 두 번이 같은 짤. film.html 에 이미 쓴 짤(이름 바꾼 복사본 포함)이 빠진다. 0점 prompt 는 오류. `meme` 결과가 `assets/video/memes/<out>.mp4`, bytes 동일. 경로 탈출 거부. 60% box 계산.
- `fetch-library.mjs` 를 빈 폴더에서 실행해 2,195쌍과 해시 일치를 확인한다. 두 번째 실행은 건너뛴다.
- `pnpm run verify` exit 0, `✓ verify passed`.
- Studio 수동(Aside): 설정 Models 에 짤 항목, 패널 짤 탭 2,195개, 미리 보기, 끌어 놓으면 가운데 60% 클립. `openfilm get meme --out a --prompt 황당함` 두 번째 실행이 다른 짤을 고른다.
- 미검증으로 남길 것: 데스크톱 패키지 빌드에 짤이 들어가는지. 릴리스 변경에서 확인한다.

## 롤백
병합 커밋 revert. Release asset 은 `gh release delete library-memes-1` 로 지운다(파괴적이므로 그때 확인을 받는다). 프로젝트로 복사된 짤은 일반 assets 파일로 남는다.
