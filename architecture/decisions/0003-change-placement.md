# 0003 u3 기능은 provider·skill·verb·별도 패널에 모으고 업스트림 코어는 고치지 않는다

Status: accepted
Origin: 커밋 abb112e 의 u3/CONCEPT.md 「방향 결정」 표와 「운영 규칙」(사람이 작성)
Source: packages/openfilm/studio/server/providers/index.mjs packages/openfilm/studio/server/get.mjs

## 맥락
이 레포는 openfilm 의 비공개 복제본이고 원격 `upstream` 에서 변경을 받는다. 코어 파일을 고칠수록 병합 비용이 커진다.

## 결정
- 기능은 provider(`studio/server/providers/`), skill, `openfilm get` verb, 별도 Studio 패널로 넣는다.
- `Timeline.tsx` 같은 코어는 고치지 않는다.
- u3 전용 파일은 `u3/` 아래에 둔다.

## 결과
- 업스트림 병합 충돌이 등록 한 줄 수준으로 줄어든다.
- 패키지 안에 있어야 하는 코드(provider, 데스크톱 모듈, Studio 컴포넌트)는 `u3/` 에 둘 수 없다. 그 코드의 배치 규칙은 INTENT 열린 질문이다.
