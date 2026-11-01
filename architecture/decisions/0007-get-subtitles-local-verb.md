# 0007 .vtt 가져오기는 openfilm get subtitles 로컬 verb 다

Status: accepted
Source: changes/003-u3-subtitle-clips/spec.md

## 맥락
에이전트가 배우는 미디어 명령은 `openfilm get` 하나다. 가져오기는 provider 도 네트워크도 필요 없다. `get.mjs` 에는 provider 를 거치지 않는 `call` 분기 선례가 있다.

## 결정
`openfilm get subtitles --src <vtt> [--layer <name>]` 를 만든다. provider 선택 전에 로컬로 처리한다. 같은 입력과 같은 film.html 은 같은 결과를 낸다.

## 결과
- 명령 체계가 하나로 유지된다.
- catalog 와 runGet 에 로컬 verb 예외가 한 줄씩 생긴다.
