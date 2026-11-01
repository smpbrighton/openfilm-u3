# Plan: u3-meme-embed (lite)
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
- 색인: u3 `src-tauri/resources/library/meme-embed/bge-m3.{f32,json}`(2195×1024, 8.99MB)을 비공개 Release asset `library-meme-embed-1` 로 올리고 `fetch-library.mjs` 가 고정 해시로 `u3/library/meme-embed/` 에 받는다. 읽을 때 각 항목의 `docHash` 가 지금 사이드카의 `memeDoc` 해시와 다르면 그 항목은 규칙 점수로만 본다.
- 모델: `Xenova/bge-m3` 고정 revision 파일(u3 `models.ts` 의 `BGE_REVISION`·`BGE_FILES` sha256)을 `~/.openfilm/u3/models/` 에 받는다. 받기는 u3 패널의 「정확한 검색 켜기(2.1GB)」 버튼과 `POST /api/u3/models/bge-m3`, 진행은 `GET` 으로 본다. Range 이어받기, 해시 확인.
- 실행: `@huggingface/transformers`(4.3.1)와 `onnxruntime-node`(1.22.0 고정)는 데스크톱 앱 의존성이다. Studio 서버는 `OPENFILM_U3_EMBED_MODULES`(데스크톱이 넘기는 node_modules 경로)로 동적 import 한다. 없으면 규칙 점수(npx 사용자). 질의 임베딩은 `pooling: 'cls', normalize: true`, 내적 top 40.
- 순위: 모델이 있으면 후보 = bge 상위 40 ∪ 규칙 상위 10(u3 `mergeCandidates`, bge 먼저). 없으면 지금 규칙. `get meme` 과 패널 검색 둘 다 같은 함수를 쓴다. 같은 입력·같은 모델은 같은 결과(0004).
- 패키징: `release.mjs` 의 `asarUnpack` 에 `onnxruntime-node`·`@huggingface/transformers`, Mac 서명·공증 대상 확인.
### 순서
1. **실측 먼저**: Electron 44 utilityProcess 에서 onnxruntime-node 가 로드되고 질의 하나가 임베딩되는지 dev 앱으로 확인. 실패하면 멈추고 보고한다(이 변경은 그 결과에 달렸다).
2. 색인 asset·fetch. 3. 임베딩 모듈·순위 합치기·테스트. 4. 받기 라우트·패널 버튼. 5. 패키징 설정.
### 바꿀 파일
`studio/server/u3-meme-embed.mjs`(new, +test: 가짜 embedder), `studio/server/u3-library.mjs`(순위 함수), `providers/u3-library.mjs`, `U3LibraryPanel.tsx`, `lib/u3-library.ts`, `apps/desktop/package.json`, `apps/desktop/src/main.mjs`, `apps/desktop/scripts/release.mjs`, `u3/scripts/fetch-library.mjs`, `u3/library/README.md`.
### 증명
- `node --test`: 색인 크기 검사, docHash 불일치 항목 제외, 합치기 순서, 모델 해시 불일치 거부, 모듈 없을 때 규칙으로.
- 실제: 모델 받은 dev 앱에서 「황당한 표정」 검색 결과가 규칙 결과와 다르고 같은 질의는 같은 결과. 받기 전에는 지금과 같다.
- 미검증: Windows, 공증된 패키지 빌드.
- `pnpm run verify`.
### 롤백
병합 revert. 모델 파일은 남는다. 데스크톱 의존성 제거.

## 구현에서 달라진 것
- gate는 이 worktree의 `pnpm dev:desktop`으로 실행했다. Electron 44.9.3의 실제 Studio utilityProcess에서 ONNX Runtime 1.22.0을 불러왔다. 「황당한 표정」은 1,024차원, norm 0.9999997954600229로 나왔다. 임시 계측은 최종 코드에서 제거했다. 증거는 `.dev/u3-meme-embed-evidence/`에 있다.
- 색인은 비공개 prerelease `library-meme-embed-1`의 `u3-library-meme-embed-1.tar`다. 9,123,840 bytes이며 SHA-256은 `4523572bb88d231d662a7d1ceac09a6543cfdab1a8761fd81cc4e6f9b45ca39a`다. 올리기 전에 tag 부재와 비공개 저장소를 확인했다. `.gitignore`에 받은 색인 경로를 추가했다.
- 모델의 일곱 파일 크기와 해시를 고정했다. 받기는 별도 비동기 작업이며 GET으로 진행을 확인한다. 네트워크 중단 시 `.part`를 남겨 다음 POST에서 Range로 잇는다. 준비된 파일도 SHA-256을 확인한다. 같은 query 벡터는 최대 32개까지 캐시해 pagination에서 재사용한다.
- 기존 `listMemes`는 폴더 수정 시각만 캐시했다. 사이드카 내용만 바뀌면 현재 docHash를 검사하지 못했다. 실패 테스트를 먼저 커밋한 뒤 사이드카 크기·mtime·ctime도 캐시 조건에 넣었다.
- ONNX Runtime이 Transformers 아래에서도 1.22.0 하나로 해석되도록 루트 `package.json`의 pnpm override와 lockfile을 갱신했다. desktop 의존성은 Transformers 4.3.1과 ONNX Runtime 1.22.0으로 정확히 고정했다.
- Transformers가 text 작업에서도 Sharp를 import한다. release의 optional 제외 설치를 유지하면서 해당 플랫폼의 Sharp native package를 직접 포함한다. Sharp와 `@img`도 asar에서 푼다. Mac afterPack은 ONNX binding·dylib와 Sharp native 파일을 확인한다. electron-osx-sign의 파일 탐색이 이 unpacked binary를 서명 대상으로 찾는 것을 소스로 확인했다. 같은 npm 설치 옵션으로 만든 Mac arm64 stage에서 두 runtime import를 확인했다.
- 패널의 새 버튼과 상태 문구는 승인된 한국어 문구를 사용한다. i18n 파일은 이 변경의 파일 목록에 없어 수정하지 않았다. 다른 언어에서도 새 문구는 한국어다.
- 사용자의 작업 경계에 따라 merge·push·다른 worktree 수정은 하지 않는다. Windows와 공증된 패키지 빌드는 검증하지 않는다. impl-report.md는 요청대로 커밋하지 않는다.
- 최종 검증은 대상 node 테스트 56건·typecheck·architecture lint를 통과했다. `pnpm run verify`는 마지막에 한 번 실행해 exit 0, 마지막 줄 `✓ verify passed`였다(openfilm 1,566건, shared 20건, desktop 403건 통과, 실패 0건, 건너뜀 7건).
