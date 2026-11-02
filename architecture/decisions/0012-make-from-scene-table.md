# 0012 자동 생성은 에이전트가 쓴 장면표를 openfilm get make 가 결정론적으로 배치한다

Status: accepted
Source: changes/009-u3-make-pipeline/spec.md

## 맥락
결정 0004 는 자동 생성을 결정론적 verb 체인으로 정했다. 장면을 고르고 반응 감정을 정하는 일은 판단이 필요하고, openfilm 에서는 코딩 에이전트가 그 역할을 한다. u3 는 Codex 가 장면표 JSON 을 쓰고 앱이 그 표로 타임라인을 만든다.

## 결정
- 에이전트는 받아쓰기를 읽고 u3 `CodexScript` 형식의 장면표를 쓴다.
- `openfilm get make --scenes <json>` 이 장면표로 원본 자르기, 자막 클립, 짤, 효과음을 배치한다. 배치 규칙은 u3 의 `from-script`·`script-memes`·`sfx` 를 따른다.
- 결정론의 입력은 장면표, 라이브러리, 순위 방식이다. 순위 방식(embedding|rule)은 실행 시작에 한 번 정하고 실행 내내 같다. 효과음 씨앗은 장면표의 해시다.

## 결과
- 같은 세 입력은 같은 film.html 을 낸다.
- 모델을 받기 전과 뒤의 짤은 다를 수 있다. receipt 에 순위 방식과 그 이유를 적는다.
