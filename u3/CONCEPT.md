# openfilm-u3 컨셉

openfilm을 포크해 u3의 핵심 세 가지(짤방, 효과음, 자막)를 추가하는 제품이다. 이 문서는 방향만 정한다. 구현 계획은 다루지 않는다.

## 기반: openfilm

확인한 사실이다.

- 라이선스는 MIT다. 상표는 `TRADEMARK.md`가 따로 정한다.
- 영상은 `film.html` 한 파일이다. 웹 페이지, 영상, 사진, 소리를 트랙 위에 자르고 붙인다.
- 트랙에는 종류가 없다. 어떤 클립이든 어느 트랙에나 올라간다(`lib/asset-timeline.ts`).
- 코딩 에이전트(Codex, Claude Code 등)가 film을 쓰고, Studio가 편집 화면을 보인다.
- 미디어는 `openfilm get <verb>`(`studio/server/get.mjs`)로 사용자가 연결한 서비스에서 가져온다. provider는 `studio/server/providers/*.mjs`에 있고 각자 `verbs`를 선언한다.
- 데스크톱 앱은 Electron이다(`apps/desktop`). 채팅 패널이 Studio 옆에 붙는다.
- 업데이트는 `electron-updater`다. 자동 다운로드와 종료 때 자동 설치를 켜 둔다.
- 타임라인은 직접 구현한 편집기다(`components/Timeline.tsx`). 썸네일, 파형, 페이드, 마커, 리플, 링크를 갖춘다.
- 자막은 film이 아니라 Studio가 그린다(`film-subtitle.mjs`). 원본은 `.vtt`이고 스타일은 film당 하나다.

## 추가하는 세 가지

### 1. 짤방
- 짤은 위쪽 트랙의 작은 영상·이미지 클립이다.
- 번들 짤 라이브러리, bge-m3 색인, Jev의 장면 선택을 `meme` verb와 Studio 패널로 붙인다.
- 같은 원본 영상마다 짤 하나 이상을 넣고, 프로젝트 안에서 짤이 중복되지 않게 한다(u3 [0013]).

### 2. 효과음
- openfilm의 `sfx` verb는 생성형이다. 번들 효과음 라이브러리 검색을 별도 소스로 얹는다.
- 효과음 트랙 여러 줄은 openfilm이 이미 지원한다.

### 3. 자막 (프롬프트와 자동 생성)
- 자막은 openfilm 모델과 충돌한다. 추가가 아니라 대체다.
- **결정**: 자막을 웹 페이지 클립으로 만든다. `.vtt`는 가져오기 소스로만 쓴다.
- 이유: u3 자막은 클립 단위 이동·트림, 레이어 여러 개, 메인·서브 두 줄, 클립별 스타일·강조(`*단어*`)·등장 효과가 필요하다. 클립 모델이 이를 자연스럽게 담는다. 등장 효과와 강조는 `frame(t)`로 구현하기 쉽다(추정).
- 자막 프롬프트(대본, 말투, 성격, 전역 자막 지침)는 `skills/`에 둔다. 코딩 에이전트가 LLM 역할을 하기 때문이다.
- 자동 생성의 받아쓰기는 whisper.cpp를 `asr` provider로 넣어 기존 「자막 만들기」 버튼에 연결한다.

## 방향 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 셸 | Electron 유지 | 편집 화면과 내보내기가 같은 Chromium이다. 채팅 패널의 Electron IPC 의존을 끊지 않는다. |
| 업데이트 | `electron-updater`에 u3의 GitHub Releases 방식을 연결한다 | 동작은 u3와 같다. 피드와 서명과 릴리스 흐름만 교체한다. |
| 변경 위치 | provider, skill, verb, 별도 패널에 모은다. `Timeline.tsx` 같은 코어는 건드리지 않는다 | 업스트림 병합 비용을 낮춘다. |
| 자동 생성 파이프라인 | 에이전트에 맡기지 않고 결정론적 verb 체인으로 둔다 | 에이전트 방식은 같은 입력이 같은 결과를 내지 않는다. 숏폼 반복 생산에 맞지 않는다. |

### 업데이트에서 교체하는 부분
- 피드: `release.mjs`의 `generic` 공급자 URL을 `smpbrighton/u3` 계열 GitHub Releases로 바꾼다.
- 릴리스 흐름: draft → 두 플랫폼 확인 → 공개, 긴급 `--mac-only`, Mac 공증을 Electron 산출물(Mac `dmg`·`zip`, Windows `nsis`)에 맞게 옮긴다.

## 확인하지 못한 것

아래 항목은 구현 전에 확인한다.

1. **Windows 업데이트 검증**: u3는 minisign으로 검증한다. `electron-updater`의 Windows 검증이 코드 서명에 기대는지, minisign을 끼울 수 있는지는 공식 문서로 확인한다. 막히면 셸 선택(Electron 유지)을 다시 따진다.
2. **웹 페이지 클립 인스펙터**: 레이어와 메인·서브 편집 UX를 감당하는지 확인하지 못했다.
3. **로컬 provider**: 지금 provider는 모두 클라우드다. 키 없는 로컬 provider(whisper.cpp)가 설정 화면(Providers)에서 어떻게 보이는지 확인하지 못했다.
4. **미리보기와 내보내기 일치**: Electron이면 같은 엔진이라는 추정이다. 실측하지 않았다.
5. **파이프라인 범위**: 대본 → 장면 → 짤·효과음 매칭 → TTS → 자막 → 장면 검토 중 어디까지 가져올지 정하지 않았다. TTS와 음성 분리는 세 가지 핵심에 들어 있지 않다.

## 운영 규칙

- 이 레포는 비공개다. GitHub fork가 아니라 전체 이력을 가진 복제본이다. 공개 레포의 GitHub fork는 비공개로 둘 수 없다.
- 원격 `upstream`이 openfilm이다. 업스트림 변경은 `git fetch upstream`으로 받는다.
- 공개나 배포 전에 이름과 로고를 바꾼다. `TRADEMARK.md`는 수정한 버전을 "OpenFilm" 또는 혼동되는 이름으로 부르는 것을 금지한다. 비공개 개발 중에는 해당하지 않는다.
- u3 전용 파일은 `u3/` 아래에 둔다. 업스트림 파일과 충돌하지 않게 하기 위해서다.
