# 0008 u3 skill 은 skills.mjs 의 네 번째 소스 u3 로 등록한다

Status: accepted
Source: changes/003-u3-subtitle-clips/spec.md

## 맥락
openfilm 의 skill 소스는 project, mine, official 이다. official 폴더는 `pnpm skills:sync` 가 통째로 바꾸므로 u3 skill 을 둘 수 없다.

## 결정
`SKILL_SOURCES` 에 `u3` 를 더한다. 위치는 `OPENFILM_U3_SKILLS`, 없으면 체크아웃의 `u3/skills` 다. 데스크톱은 번들 리소스를 그 변수로 넘긴다. u3 소스는 읽기 전용이다.

## 결과
- CLI 와 데스크톱에서 같은 경로로 u3 skill 이 보인다.
- skill 소스를 다루는 코어 파일 몇 곳이 바뀐다(결정 0003 의 등록 한 줄을 넘는다).
