# u3 로컬 음성 인식

Studio에서 u3 Whisper를 연결하고 서비스의 음성 인식 모델을 선택한다. API 키가 필요 없다. 프로젝트 음성은 이 컴퓨터에서 처리한다.

CLI는 연결 후 프로젝트 폴더에서 실행한다.

```sh
openfilm get asr --via u3-whisper --src assets/voice.wav
```

`OPENFILM_U3_WHISPER_CLI`로 실행 파일을 지정한다. 지정하지 않으면 PATH의 `whisper-cli`를 찾는다. Mac arm64 데스크톱 설치 파일은 실행 파일을 포함한다. Windows 바이너리는 아직 배포하지 않는다. 실행 파일이 없으면 `whisper-cli 를 찾지 못했다`고 알린다.

첫 실행에서 아래 모델을 받는다. 기본 위치는 `~/.openfilm/u3/models/`이며 `OPENFILM_U3_MODELS`로 바꾼다. 중단된 `.part`는 이어받는다. 크기와 SHA-256이 맞아야 사용한다. 음성 파일은 모델 다운로드 서버로 보내지 않는다.

| 모델 | 출처 | 크기 | SHA-256 |
|---|---|---|---|
| `ggml-large-v3-turbo-q5_0.bin` | [whisper.cpp 모델](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin) | 574,041,195 B | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` |
| `ggml-silero-v6.2.0.bin` | [whisper-vad](https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin) | 885,098 B | `2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987` |

## whisper-cli 출처와 배포

- 소스: [whisper.cpp v1.9.5](https://github.com/ggml-org/whisper.cpp/tree/v1.9.5), MIT.
- 소스 tar SHA-256: `ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720`.
- 빌드: `bash u3/scripts/build-whisper.sh`. u3의 스크립트에서 Mac arm64 부분을 옮겼다. 정적 라이브러리와 Metal shader를 내장하고 시스템 dylib 이외 의존성이 없는지 검사한다.
- 결과: `.dev/whisper-build/out/whisper-cli-darwin-arm64`, `LICENSE`. `OPENFILM_U3_BUILD_CACHE`로 빌드 위치를 바꾼다.
- 비공개 배포: [smpbrighton/openfilm-u3 · whisper-cli-1.9.5](https://github.com/smpbrighton/openfilm-u3/releases/tag/whisper-cli-1.9.5)의 prerelease asset 두 개다. 저장소 공개 범위를 바꾸지 않는다.
- 바이너리 SHA-256: `355c1791326a6dda1daebdd6a2b06bf127ad085cf021f5bb021bbbd652bed14b`.
- LICENSE SHA-256: `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`.

데스크톱 release 단계는 `u3-whisper-runtime.mjs`로 두 asset을 받아 각각 해시를 확인한다. 비공개 asset에는 `gh`의 `smpbrighton` 인증 또는 `GH_TOKEN`이 필요하다. `runtime/whisper`의 실행 파일과 MIT LICENSE가 기존 `extraResources`의 `runtime` 항목으로 앱에 들어간다. 설치 후 바이너리를 받지 않는다.

단어 시각과 한국어 옵션은 u3의 `whisper.ts`, `transcript.ts`에서 옮겼다. 테스트 fixture는 u3의 `tests/fixtures/whisper-output.json`에서 가져왔다.
