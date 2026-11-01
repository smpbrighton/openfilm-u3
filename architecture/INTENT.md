# openfilm-u3 INTENT

> 제품 수준의 현재 상태 문서다. 변경 요청은 `changes/NNN-slug/intent.md`에 쓴다. 날짜·경위·이력은 쓰지 않는다. 결정의 정본은 `decisions/`다.

## 문제
u3 의 핵심 세 가지(짤방, 효과음, 자막)는 Tauri 앱 u3 안에만 있다. openfilm 의 편집기(Studio)와 코딩 에이전트 흐름에서는 이 셋을 쓸 수 없다. openfilm-u3 는 openfilm 을 복제해 이 셋을 더한다.

## 기대 결과
- 번들 효과음을 `openfilm get sfx` 와 Studio 라이브러리 패널로 찾아 타임라인에 놓는다.
- `openfilm get meme` 이 프롬프트에 맞는 짤을 위쪽 트랙의 작은 클립으로 낸다. 원본 영상마다 짤이 하나 이상 있고, 한 프로젝트 안에서 같은 짤이 두 번 쓰이지 않는다.
- 자막 한 줄이 웹 페이지 클립 하나다. 클립마다 이동·트림, 메인·서브 두 줄, 스타일, `*단어*` 강조, 등장 효과를 고친다. 레이어를 여러 개 둔다.
- `.vtt` 를 가져오면 cue 마다 자막 클립이 생긴다. 같은 입력은 같은 결과를 낸다.
- API 키 없이 whisper.cpp 로 「자막 만들기」가 동작한다(Mac arm64, Windows x64).
- Windows 업데이트가 minisign 서명을 검증한다. 서명이 깨진 설치 파일은 설치되지 않는다.

## 영향 범위
- 사용자: openfilm 데스크톱 앱과 `npx openfilm` CLI 사용자.
- Studio 서버: provider(`studio/server/providers/`), `openfilm get` verb, 자막 가져오기.
- Studio UI: 라이브러리 패널, 자막 클립 인스펙터.
- skill: 짤 배치 규칙, 자막 프롬프트(대본·말투·성격·전역 지침).
- 데스크톱 앱: 업데이트 검증, 릴리스 흐름, 번들 리소스(라이브러리, whisper.cpp).
- 외부: smpbrighton 계열 GitHub Releases, whisper.cpp 바이너리, Hugging Face 모델(bge-m3, whisper ggml).

## 제약
- openfilm 은 MIT 다. `TRADEMARK.md` 는 수정본을 "OpenFilm" 또는 혼동되는 이름으로 부르는 것을 금지한다. 공개나 배포 전에 이름과 로고를 바꾼다.
- 레포는 비공개 복제본이다. 원격 `upstream` 이 openfilm 이고 `git fetch upstream` 으로 변경을 받는다. 병합 비용을 낮게 유지한다(0003).
- 데스크톱은 Electron 44, electron-updater 6.8.9, electron-builder 26.15.3 이다.
- 크기: 짤 라이브러리 212MB, bge-m3 모델 2.1GB, whisper 모델 574MB. 모델은 앱에 넣지 않는다.
- 번들 짤·효과음·폰트의 재배포 권리는 공개 배포 전에 확인한다.

## 결정
- 데스크톱 셸은 Electron 을 유지한다 — [0001](decisions/0001-electron-shell.md)
- 업데이트는 electron-updater 에 GitHub Releases 피드와 minisign 검증을 연결한다 — [0002](decisions/0002-windows-update-minisign.md)
- u3 기능은 provider·skill·verb·별도 패널에 모으고 코어는 고치지 않는다 — [0003](decisions/0003-change-placement.md)
- 자동 생성 파이프라인은 결정론적 verb 체인이다 — [0004](decisions/0004-deterministic-pipeline.md)
- 자막은 웹 페이지 클립이고 `.vtt` 는 가져오기 소스다 — [0005](decisions/0005-subtitles-as-page-clips.md)
- 자막 레이어 하나는 템플릿 페이지 하나이고, 클립별 값은 component props 다 — [0006](decisions/0006-subtitle-clip-template.md)
- `.vtt` 가져오기는 `openfilm get subtitles` 로컬 verb 다 — [0007](decisions/0007-get-subtitles-local-verb.md)
- u3 skill 은 `skills.mjs` 의 네 번째 소스 `u3` 로 등록한다 — [0008](decisions/0008-u3-skill-source.md)
- u3 자막 클립이 있는 film 에서는 Studio 자막 cue 를 내지 않는다 — [0010](decisions/0010-no-studio-cues-with-subtitle-clips.md)

## 열린 질문
항목마다 추천과 이유를 적는다.

- **패키지 안 코드의 배치**: 추천은 업스트림 폴더에 `u3-` 접두어 파일로 두고 등록은 한 줄만 넣는 것이다. 0003 의 `u3/` 규칙을 패키지 경계 안에서 지키는 방법이다.
- **bge-m3·onnxruntime 의존성 위치**: 추천은 데스크톱 앱에만 둔다. `npx openfilm` 사용자에게 네이티브 모듈을 강요하지 않는다. 모듈이 없으면 규칙 점수로 순위를 낸다.
- **keyless 로컬 provider 표시**: whisper.cpp provider 가 설정 화면에서 어떻게 보이는지 확인하지 않았다. Keenable 이 keyless 선례이므로 그 화면으로 먼저 확인한다.
- **미리보기와 내보내기 일치**: 같은 Chromium 이라는 추정이다. 자막 클립 변경에서 미리보기 프레임과 내보낸 mp4 프레임을 비교한다.
- **파이프라인 범위**: 대본, 장면, 짤·효과음 매칭, TTS, 자막, 장면 검토 중 어디까지 넣을지 정하지 않았다. 추천은 TTS 와 음성 분리를 빼는 것이다. 세 가지 핵심 밖이다.
- **새 이름과 로고**: 공개나 배포 전에 정한다.

변경 후보와 트랙. 변경별 설계 재료는 `git show 855540d:u3/PLAN.md` 에 있다.

| 순서 | slug | 트랙 | 선행 |
|---|---|---|---|
| 4 | u3-whisper-asr | lite | 3 |
| 5 | u3-updates-release | lite | 첫 배포 전 |
| 6 | u3-make-pipeline | full | 2, 3, 4 |
| 7 | u3-rebrand | lite | 공개 전 |
| 8 | u3-meme-embed | full | 2 |

## 지도
변경 `changes/` · 결정 `decisions/` · 지도 `MAP.md`
