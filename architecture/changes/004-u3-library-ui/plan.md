# Plan: u3-library-ui (lite)
Track: lite.

## 검토 목록(다섯 변경 공통, 한 번의 plan 승인)
- **사용자 지시**: 「u3 라이브러리는 기본 활성화, 짤은 24개씩 무한 스크롤, 검색도 24건씩, 마우스 오버로 재생」, 「각각 plan.md까지만 작성하고 구현은 orca-cli로 codex에게 맡기자」. 붙여 넣은 글은 보이지 않아, 앞서 낸 남은 변경 후보 목록으로 가정했다.
- **받은 답**: 새 이름 「u3 Studio」, 범위 「표시 + 앱 정체성」(CLI `openfilm`·`OPENFILM_*`·`~/.openfilm` 은 유지), 피드는 「새 공개 레포」.
- **새 공개 레포를 만든다(007).** 이름은 `smpbrighton/u3-studio-releases`. 설치 파일·피드·서명만 올린다. 추천: 이 이름. 이유: 제품 이름과 맞고 코드는 비공개로 남는다.
- **서명 키와 GitHub secret 은 codex 가 만들지 않는다(007).** 코드는 시험용 키로 시험한다. 실제 Windows minisign 키 생성, 공개키 반영, secret 등록은 병합 뒤 이 세션이 사람 확인을 받고 한다. 이유: 개인키를 에이전트 로그에 남기지 않는다.
- **이름 바꾸기는 번역 문자열을 고치지 않고 `t()` 에서 바꾼다(008).** i18n 5개 언어 약 230줄을 고치면 업스트림 병합 충돌이 커진다(결정 0003). 표시 직전에 "OpenFilm Studio"·"OpenFilm" 을 "u3 Studio" 로 바꾼다. 명령 이름 `openfilm` 과 코드 식별자는 바꾸지 않는다.
- **번들 ID·데이터 폴더가 바뀐다(008).** 앱 데이터 위치가 `~/Library/Application Support/u3 Studio` 가 된다. 아직 배포 전이라 옮길 사용자 데이터가 없다고 본다. `~/.openfilm` 프로젝트 상태는 그대로다.
- **로고 초안은 이 세션이 gpt-image 로 만든다(008).** codex 에게 넘기기 전에 `logo-1024.png` 를 워크트리에 넣는다. 교체할 수 있게 한 파일에서 아이콘을 만든다.
- **임베딩 모델 2.1GB 는 사람이 버튼으로 받는다(006).** 요청 안에서 받지 않는다. 받기 전에는 지금의 규칙 점수다(u3 0004).
- **Windows whisper-cli 는 이번에 만들지 않는다(005).** Mac arm64 정적 빌드만 Release asset 으로 둔다. Windows 빌드는 007 의 CI 가 생긴 뒤 따로 한다. Windows 앱에서 u3 Whisper 는 「whisper-cli 를 찾지 못했다」고 알린다.
- **codex 주간 한도.** 지난 실행에서 5% 미만 경고가 있었다. 한도에 걸리면 그 변경은 멈추고, 남은 일은 장부의 next 로 이어간다.

## 실행 순서와 의존
| 물결 | 변경 | 선행 | 겹치는 파일 |
|---|---|---|---|
| 1 | 004 u3-library-ui | 없음 | `U3LibraryPanel.tsx`, `u3-library.mjs` |
| 1 | 005 u3-whisper-asr | 없음 | `release.mjs`, `main.mjs`, i18n |
| 1 | 007 u3-updates-release | 없음 | `release.mjs`, `desktop.yml` |
| 2 | 006 u3-meme-embed | 004 병합 | 004 와 같은 파일 |
| 2 | 008 u3-rebrand | 005·007 병합 | `release.mjs`, `desktop.yml`, i18n |

물결 1 의 셋을 동시에 띄우고, 병합은 한 번에 하나씩 `worktree.sh finish` 로 한다. 물결 2 는 선행이 병합된 뒤 워크트리를 main 위로 rebase 하고 띄운다.

### 결정
- 패널 기본값을 켠다: `ProjectView.tsx` 의 `useKeptFlag('openfilm.project.u3library', true)`. 이미 끈 사람(localStorage `'0'`)은 꺼진 채다.
- 서버 짤 목록에 페이지를 둔다: `GET /api/u3/library/memes?q=&emotion=&offset=&limit=`. `limit` 기본 24, 최대 100. 응답 `{ dir, items, total, next }`(`next` 는 다음 offset 또는 null). 순서: q 없으면 지금처럼 id 순, q 있으면 `matchMemes` 점수>0 순. 감정 거르기도 서버에서 한다.
- 짤 탭: 처음 24개, 목록 끝의 감시 요소를 `IntersectionObserver`(root 는 목록 상자)로 보고 닿으면 다음 24개. 검색어·감정이 바뀌면 처음부터(입력 250ms 지연, 늦게 온 응답은 버린다).
- 마우스 오버 재생: 행마다 작은 영상 칸(가로 64px)을 둔다. 화면 가까이 올 때만 `src` 를 넣고(`MediaPreview.tsx` 의 `useNearViewport` 방식) `preload="metadata"` 로 첫 프레임을 보인다. 마우스가 올라가면 `play()`, 나가면 `pause()` 와 처음으로. 클릭 미리 보기 상자는 없앤다. 끌기는 그대로.
- 효과음 탭은 바꾸지 않는다. `ProjectLayoutMenu.tsx:22` 주석을 「u3 라이브러리(효과음·짤)」로 고친다.
### 바꿀 파일
`packages/openfilm` 기준. `studio/server/u3-library.mjs`(+test), `studio/ui/src/lib/u3-library.ts`(+test: 페이지 합치기·초기화 순수 함수), `studio/ui/src/components/U3LibraryPanel.tsx`, `studio/ui/src/components/ProjectView.tsx`(기본값 한 글자), `ProjectLayoutMenu.tsx`(주석).
### 증명
- `node --test`: limit·offset·total·next, q 순위의 페이지, 감정 거르기, 범위 밖 값 거부.
- Studio(Aside, 새 localStorage): 패널이 처음부터 열림, 짤 24개, 끝까지 스크롤하면 48개, 「놀람」 검색 24개 뒤 스크롤로 더, 마우스 오버로 재생과 정지.
- `pnpm run verify`.
### 롤백
병합 revert. 저장 데이터 변화 없음.
