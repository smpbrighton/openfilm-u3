# u3 library

u3 의 번들 라이브러리다. openfilm-u3 의 provider `u3-library` 와 Studio 의 u3 Library 패널이 읽는다.

## 형식
- `sfx/<category>/sfx-<id>.mp3` 와 같은 이름의 `.json` 사이드카.
- 사이드카 필드: `id`, `kind`(`sfx`), `category`, `file`, `title`, `source`, `license`, `durationSec`.
- u3 의 `src-tauri/resources/library/sfx` 를 변환하지 않고 그대로 복사했다. 카테고리 11개, 효과음 82개.

## 위치
- 환경 변수 `OPENFILM_U3_LIBRARY` 가 있으면 그 폴더를 읽는다.
- 없으면 소스 체크아웃의 이 폴더(`<repo>/u3/library`)를 읽는다.
- 데스크톱 패키지 앱은 `resources/u3-library` 를 그 변수로 넘긴다.

## 권리
- 효과음 82개는 모두 myinstants.com 에서 받은 것이다. 사이드카의 `source` 가 원본 주소다.
- 재배포 권리는 확인하지 않았다(`license: "myinstants"`). 공개 배포 전에 권리를 확인한다.
