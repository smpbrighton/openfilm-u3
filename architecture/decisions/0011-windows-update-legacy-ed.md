# 0011 Windows 업데이트 서명은 minisign legacy Ed 서명만 받는다

Status: accepted
Source: changes/007-u3-updates-release/plan.md apps/desktop/src/u3-minisign.mjs

## 맥락
0002 는 Windows 업데이트를 minisign 으로 검증하고, 검증은 Node `crypto` 의 Ed25519 와 Blake2b-512 로 한다고 정했다. Electron 44.9.3 내장 Node 24.22.0 은 `ed25519` 는 지원하지만 `blake2b512` 는 지원하지 않는다(007 실측, `{"ed25519":true,"blake2b512":false}`). 최신 minisign 의 기본 서명은 Blake2b-512 prehash(`ED`)라서 앱 안에서 검증할 수 없다.

## 결정
- 릴리스는 Windows 설치 파일을 `minisign -S -l`(legacy, `Ed`)로 서명한다. 서명은 파일 전체에 대한 Ed25519 다.
- 앱은 `Ed` 서명만 받고 `ED` 서명은 거부한다. 검증은 Node 내장 `crypto` 의 Ed25519 만 쓴다. 외부 해시 라이브러리를 넣지 않는다.
- 나머지(publisherName 표식, 피드, trusted comment 버전 비교, fail-closed)는 0002 그대로다.

## 결과
- Electron 에서 업데이트 서명을 검증할 수 있다. 새 의존성이 없다.
- 검증할 때 설치 파일 전체를 메모리로 읽는다(수백 MB).
- 0002 를 대체한다.
