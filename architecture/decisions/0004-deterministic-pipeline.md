# 0004 자동 생성 파이프라인은 에이전트가 아니라 결정론적 verb 체인으로 둔다

Status: accepted
Origin: 커밋 abb112e 의 u3/CONCEPT.md 「방향 결정」 표(사람이 작성)
Source: packages/openfilm/studio/server/get.mjs

## 맥락
openfilm 은 코딩 에이전트가 film 을 쓴다. 숏폼 반복 생산은 같은 입력에 같은 결과가 필요하다.

## 결정
대본에서 장면, 짤·효과음 매칭, 자막으로 가는 자동 생성은 결정론적 verb 체인으로 만든다. 에이전트에게 순서를 맡기지 않는다.

## 결과
- 체인의 각 단계는 같은 입력에 같은 결과를 낸다. 테스트로 검증할 수 있다.
- 파이프라인의 범위는 아직 정하지 않았다(INTENT 열린 질문).
