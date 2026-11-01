---
name: u3-media
description: u3 번들 효과음과 반응 짤을 찾아 숏폼 타임라인에 배치한다.
---

# u3 효과음과 짤

효과음과 짤은 새로 생성하지 않고 `u3-library`에서 찾는다. 라이브러리에는 API 키가 필요 없다. 짤 파일이 없으면 `node u3/scripts/fetch-library.mjs`로 받는다. 이 다운로드에는 `gh auth login`이 필요하다.

## 효과음

```sh
openfilm get sfx --via u3-library --out reaction --prompt "실패해서 허탈한 순간"
```

`--prompt`에는 장면과 반응을 쓴다. 카테고리는 shock, fail, laugh, applause, alarm, impact, bruh, notify, pop, reveal이다. 반환한 `src`와 실제 `dur`를 사용한다. 오디오 클립을 반응 시각에 배치하고 `openfilm look`으로 원본 음성과 믹스를 듣는다. 대사를 가리는 효과음은 줄이거나 뺀다.

## 반응 짤

```sh
openfilm get meme --via u3-library --out surprise --prompt "가격을 보고 깜짝 놀라는 장면" --reaction 놀람
```

`--reaction`은 놀람, 소름, 체념, 억울, 분노, 당황, 웃음, 의심, 귀찮음, 인정, 감동, 뿌듯함, 기대, 부끄러움 중 하나다. 반환한 `src`, `dur`, 크기와 후보를 확인한다. 같은 프로젝트에서 이미 쓴 짤은 다른 파일명으로 복사했어도 다시 고르지 않는다.

원본 영상마다 짤을 하나 이상 배치한다. 짤은 원본 영상보다 위쪽 트랙에 둔다. 화면 가운데에 무대 너비의 60%로 놓고 길이는 2초 이하로 한다. 짤 소리는 끈다. 대상·동작·자막을 가리면 배치 시각과 위치를 고친다. 자막 지침의 창작 기본값보다 이 배치 규칙을 먼저 따른다.

효과음과 짤의 번들 파일을 직접 고치지 않는다. 프로젝트에 복사된 파일을 사용한다. `openfilm look`으로 같은 짤의 중복, 화면 가림, 원본 음성의 가독성을 확인한다.
