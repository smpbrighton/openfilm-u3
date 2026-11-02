# minisign 시험 fixture

`minisign 0.12`로 만든 가짜 설치 파일과 공개키, plain `.minisig`다. 실제 제품에 쓰지 않는다. `minisign -G -W`로 이 폴더에서 일회용 키를 생성한 뒤 `-S -W`와 `-S -W -l`로 두 형식을 서명했다. trusted comment는 `timestamp:1`, `version:0.2.8`, `file:OpenFilm-Setup-x64.exe`를 탭으로 구분한다. 개인키는 서명 직후 삭제했다.

결정 0011에 따라 `legacy.minisig`만 정상 업데이트 fixture다. `prehashed.minisig`는 앱과 릴리스 검사에서 `ED`를 거부하는지 확인하는 fixture다.
