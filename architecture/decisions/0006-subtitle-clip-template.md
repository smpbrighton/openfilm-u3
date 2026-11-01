# 0006 자막 레이어 하나는 템플릿 페이지 하나이고, 클립별 값은 component props 다

Status: accepted
Source: changes/003-u3-subtitle-clips/spec.md

## 맥락
결정 0005 는 자막 한 줄을 웹 페이지 클립으로 만든다. 클립마다 메인·서브 글, 강조, 효과, 색, 크기가 다르고, 레이어마다 스타일이 다르다. openfilm 의 component props 는 같은 src 를 쓰는 클립마다 다른 값을 갖는다.

## 결정
- 레이어 하나는 프로젝트의 `scenes/u3-subtitle-<layer>.html` 하나다. 레이어 스타일은 그 파일 `:root` 의 CSS 변수다.
- 클립별 값은 `data-props` 로 선언한 component props 다. 메인·서브는 text, 효과·색·크기·강조색은 var 다.
- 강조 `*단어*` 는 페이지가 원본 글 요소의 변화를 받아 다시 그린다.

## 결과
- 새 인스펙터 없이 기존 props 편집으로 클립을 고친다.
- 레이어 전체 스타일은 Studio 에서 한 번에 바꾸지 못한다. 파일을 고친다.
