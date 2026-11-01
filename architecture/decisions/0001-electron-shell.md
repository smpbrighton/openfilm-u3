# 0001 데스크톱 셸은 Electron 을 유지한다

Status: accepted
Origin: 커밋 abb112e 의 u3/CONCEPT.md 「방향 결정」 표(사람이 작성). 전제였던 Windows 업데이트 검증은 커밋 855540d 의 u3/CHECK-windows-update.md 로 확인했다
Source: apps/desktop/package.json apps/desktop/src/updates.mjs

## 맥락
u3 는 Tauri 2 앱이고 openfilm 은 Electron 앱이다. 셸을 바꾸면 편집 화면, 내보내기, 채팅 패널을 다시 만들어야 한다. 남은 조건은 Windows 업데이트를 u3 처럼 minisign 으로 검증할 수 있는가였다.

## 결정
셸은 Electron 을 유지한다.

## 결과
- 편집 화면과 내보내기가 같은 Chromium 에서 돈다. 미리보기와 내보내기의 일치는 아직 실측하지 않았다(INTENT 열린 질문).
- 채팅 패널의 Electron IPC 의존을 그대로 쓴다.
- Windows 업데이트 검증은 0002 를 따른다.
