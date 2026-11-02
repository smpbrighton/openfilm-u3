# 0013 make 는 자기 클립만 소유하고 다시 실행하면 그것만 바꾼다

Status: accepted
Source: changes/009-u3-make-pipeline/spec.md

## 맥락
make 를 다시 실행하는 일은 장면표를 고친 뒤에 흔하다. 사람이 make 뒤에 더한 클립(타이틀, 다른 효과)은 지켜야 한다.

## 결정
- make 가 만드는 클립에는 속성 `data-u3-make` 를 붙인다. id 로 구별하지 않는다.
- 다시 실행하면 그 속성이 있는 클립만 지우고 새로 만든다. 다른 클립은 건드리지 않는다.
- make 클립이 locked 트랙에 있으면 아무것도 바꾸지 않는다.
- `get subtitles` 는 `make` 로 시작하는 레이어 이름을 받지 않는다.

## 결과
- 사람이 make 클립을 고친 내용은 다시 실행하면 사라진다. 지키려면 그 클립의 `data-u3-make` 를 지운다.
