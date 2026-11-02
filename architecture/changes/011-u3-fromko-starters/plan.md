# Plan: u3-fromko-starters (lite)
Track: lite.

## 검토 목록
- **FROMKO 예시 3개는 「다른 예시」를 눌러도 바뀌지 않고 항상 맨 위에 고정된다.** 그 아래에 기존 5개 묶음이 그대로 돈다. 그래서 첫 화면에는 예시가 8개 보인다. 추천: 받아들인다. 이유: 「위에 더해줘」를 그대로 따르는 방식이고, 묶음을 돌려도 FROMKO 예시가 사라지지 않는다. 택하지 않은 대안: 첫 묶음 안에 섞기(「다른 예시」를 누르면 사라진다).
- **문구(한국어)는 세션이 FROMKO `architecture/INTENT.md` 로 정했다.** 아래 3개다. 고칠 문구가 있으면 승인 때 말해 준다.
  1. 숏츠: 「FROMKO 앱으로 올리브영 상품을 해외에서 주문하는 30초 세로 숏츠」
  2. 안내 영상: 「해외에서 FROMKO로 한국 쇼핑몰 상품을 사는 방법 1분 안내 영상」
  3. 모션그래픽: 「FROMKO 국제 배송비 선결제와 검수 후 정산을 설명하는 모션그래픽」
- 다른 언어(en, ja, zh-CN, es)에는 같은 뜻의 번역을 넣는다. 이름은 「FROMKO」 그대로 쓴다.

## 결정
- 사용자: 「요 항목에 프롬코 관련 숏츠나 안내 영상, 모션그래픽을 만드는 프롬프트 3개를 위에 더해줘 프롬코는(/Volumes/X31/workspace/brighton_workspace/fromko-v2) 여기 이 서비스야」
- FROMKO 사실의 출처: fromko-v2 `architecture/INTENT.md`. 해외 거주자가 한국 쇼핑몰(올리브영 등) 상품을 앱에서 담고 USD 로 결제한다. 국제 배송비는 예상액을 선결제하고, 검수 사진을 본 뒤 차액을 정산한다.

## 대조
- 결정 0003(코어를 고치지 않음): 예시 목록은 새 파일 `u3-starters.ts` 에 둔다. `ProjectStarters.tsx` 에는 import 와 렌더 한 덩어리만 더한다.
- 진행 중인 010(Windows whisper, 보류)과 겹치는 파일은 없다.

## 바꿀 파일
- `apps/desktop/chat/src/components/u3-starters.ts` (new): `U3_STARTERS = ['u3f1','u3f2','u3f3']` 와 아이콘 표(lucide: Smartphone, Globe, Package 같은 것).
- `apps/desktop/chat/src/components/ProjectStarters.tsx`: 회전 묶음 위에 `U3_STARTERS` 를 같은 버튼 모양으로 고정해 렌더한다. 누르면 `onPick(text)` 를 부른다. 기존 동작은 그대로 둔다.
- `apps/desktop/chat/src/i18n/locales/{ko,en-US,ja,zh-CN,es}.ts`: `starter.u3f1`–`u3f3` 키를 더한다.

## 순서
1. `u3-starters.ts` 와 locale 키 5개를 만든다.
2. `ProjectStarters.tsx` 에 고정 목록을 렌더한다.
3. `pnpm --filter @openfilm/desktop typecheck`.
4. 개발 앱을 띄우고 새 프로젝트 화면을 캡처한다. 맨 위 3개를 확인하고, 「다른 예시」를 누른 뒤에도 3개가 남는지 확인한다. 하나를 누르면 입력창에 문구가 들어가는지 확인한다.
5. `pnpm run verify`.
6. (이 세션) diff 대조, 병합, push.

구현은 orca-cli 로 codex 에게 맡긴다.

## 리스크
- 예시가 8개가 되어 채팅 열의 높이가 늘어난다. 작은 창에서는 입력창 위가 스크롤될 수 있다. 4단계의 캡처로 확인한다.
- 업스트림이 `ProjectStarters.tsx` 를 바꾸면 병합 충돌이 날 수 있다. 바꾸는 범위를 한 덩어리로 줄인다.

## 증명
- typecheck exit 0.
- 개발 앱 캡처 두 장: 첫 화면과 「다른 예시」를 누른 뒤의 화면. 문구를 누른 뒤 입력창 값.
- `pnpm run verify` 가 exit 0 이고 마지막 줄이 `✓ verify passed`.

## 롤백
병합을 revert 한다.
