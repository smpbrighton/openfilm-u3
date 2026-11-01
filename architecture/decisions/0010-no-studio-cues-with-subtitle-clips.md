# 0010 u3 자막 클립이 있는 film 에서는 Studio 자막 cue 를 내지 않는다

Status: accepted
Source: changes/003-u3-subtitle-clips/spec.md

## 맥락
0009 는 `subtitles.json` 의 `on` 을 `false` 로 써서 Studio 자막을 끄려 했다. 「자막 만들기」 성공, 열린 Studio 의 메모리 상태, CC 토글이 `on` 을 다시 `true` 로 만든다(`studio/ui/src/lib/use-film-subtitles.ts:98`, `use-subtitle-style.ts:52-66`). `subtitles.json` 은 에이전트가 건드리지 않는 사람의 상태다(`film-subtitle.mjs:45`).

## 결정
- `captions.mjs` 의 `filmCaptions` 는 film 에 u3 자막 클립(`u3sub-`)이 있으면 cue 를 내지 않는다.
- `subtitles.json` 과 `.vtt` 는 건드리지 않는다.

## 결과
- 미리보기 오버레이, burn-in, SRT 내보내기, NLE 자막 트랙이 그 film 에서 자막을 내지 않는다. 자막이 두 번 그려지지 않는다.
- 업스트림 코어 `captions.mjs` 에 한 줄이 생긴다.
