# u3 library

u3 의 번들 라이브러리다. openfilm-u3 의 provider `u3-library` 와 Studio 의 u3 Library 패널이 읽는다.

## 형식
- `sfx/<category>/sfx-<id>.mp3` 와 같은 이름의 `.json` 사이드카.
- 사이드카 필드: `id`, `kind`(`sfx`), `category`, `file`, `title`, `source`, `license`, `durationSec`.
- u3 의 `src-tauri/resources/library/sfx` 를 변환하지 않고 그대로 복사했다. 카테고리 11개, 효과음 82개.
- `memes/<emotion>/<id>.mp4` 와 `<id>.json` 사이드카. 감정 폴더 14개, 짤 2,195개.
- 짤 사이드카 필드: `id`, `emotion`, `situations`, `description`, `durationSec`, `width`, `height`, `importedAt`, `tagsConfirmed`, `sourceUrl`.

## 짤 받기
- `memes/` 는 레포에 없다(212MB, gitignore). 비공개 레포 `smpbrighton/openfilm-u3` 의 prerelease `library-memes-1` 에 tar 하나로 있다.
- `node u3/scripts/fetch-library.mjs` 가 받는다. `gh auth login` 이 필요하다.
- 스크립트는 태그·파일명·sha256 을 고정한다. 해시가 다르면 실패한다. `memes/.fetched` 의 해시가 같으면 건너뛴다.
- 데스크톱 `release.mjs` 가 번들 전에 이 스크립트를 실행한다.

## 짤 올리기
새 판을 올릴 때만 한다. 이전 Release 는 지우지 않는다.
1. u3 의 `src-tauri/resources/library` 에서 파일 목록을 이름순으로 만든다: `find memes -type f | LC_ALL=C sort > list.txt`.
2. tar 를 만든다: `COPYFILE_DISABLE=1 bsdtar -cf u3-library-memes-N.tar --format ustar --uid 0 --gid 0 --uname '' --gname '' --no-mac-metadata --no-xattrs --no-fflags --no-acls -T list.txt`.
3. 해시를 구한다: `shasum -a 256 u3-library-memes-N.tar`.
4. 올린다: `gh release create library-memes-N --prerelease --repo smpbrighton/openfilm-u3 --title ... --notes ... u3-library-memes-N.tar`.
5. `fetch-library.mjs` 의 `MEMES` 에 태그·파일명·sha256 을 적는다.

## 위치
- 환경 변수 `OPENFILM_U3_LIBRARY` 가 있으면 그 폴더를 읽는다.
- 없으면 소스 체크아웃의 이 폴더(`<repo>/u3/library`)를 읽는다.
- 그 폴더에 `sfx/` 나 `memes/` 가 없으면 그 종류는 비어 있다.
- 데스크톱 패키지 앱은 `resources/u3-library` 를 그 변수로 넘긴다.

## 자막 페이지
- `pages/u3-subtitle.html` 은 `get subtitles` 가 레이어마다 복사하는 투명 자막 페이지다.
- `pages/fonts/` 는 Pretendard(400·700), Gmarket Sans Bold, TmonMonsori 와 원본 라이선스 파일을 담는다.
- 레이어 기본값은 복사한 `scenes/u3-subtitle-<layer>.html` 의 `:root` CSS 변수로 고친다. 다시 가져와도 기존 페이지와 폰트를 덮어쓰지 않는다.

## 권리
- 효과음 82개는 모두 myinstants.com 에서 받은 것이다. 사이드카의 `source` 가 원본 주소다.
- 재배포 권리는 확인하지 않았다(`license: "myinstants"`). 공개 배포 전에 권리를 확인한다.
- 짤은 giphy·tenor 에서 받은 것이다. 사이드카의 `sourceUrl` 이 원본 주소다. 재배포 권리는 확인하지 않았다. 공개 배포 전에 권리를 확인한다.
