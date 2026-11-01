# 0009 자막 클립이 있는 film 에서는 Studio 자막을 끈다

Status: superseded-by 0010
Source: changes/003-u3-subtitle-clips/spec.md

## 맥락
Studio 자막(오버레이, 번역, SRT, burn-in, NLE 자막 트랙)은 `.vtt` 와 `.film/subtitles.json` 을 쓴다. 자막 클립은 film 안에 그려진다. 둘을 함께 켜면 자막이 두 번 보인다.

## 결정
- 자막 클립이 하나라도 있으면 `subtitles.json` 의 `on` 을 `false` 로 둔다.
- 기존 `.vtt` 와 `subtitles.json` 은 지우지 않는다.
- 번역, SRT 내보내기, burn-in, NLE 자막 트랙은 자막 클립을 다루지 않는다.

## 결과
- 자막 클립 film 에서는 그 기능들을 쓸 수 없다. 필요하면 자막 클립에서 SRT 를 만드는 변경을 따로 둔다.
