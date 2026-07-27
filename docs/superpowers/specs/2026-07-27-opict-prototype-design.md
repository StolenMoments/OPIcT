# OPIcT — OPIc 트레이닝 PWA 프로토타입 설계

- 날짜: 2026-07-27
- 사용자: 1명 (개인용)
- 목적: OPIc 시험 대비 개인 트레이너. 고정 서베이 기반 빈출 문항 연습(녹음 답변 AI 평가), 영어 문장 교정, 카테고리별 표현 노트를 제공하는 PWA 프로토타입.

## 1. 확정 결정 사항

| 항목 | 결정 |
|---|---|
| 서버 스택 | Node.js + Fastify 단일 서버, SQLite(better-sqlite3). **단, 추후 MariaDB 전환 대비 리포지토리 패턴 — SQL·드라이버는 `repo/` 계층에만 존재, 라우트·파이프라인은 repo 인터페이스만 사용** |
| 프론트 | Vite + React + TypeScript, PWA(매니페스트 + 정적 자산 캐시 서비스워커) |
| STT | 서버 로컬 whisper.cpp 바이너리(subprocess). ffmpeg으로 16kHz WAV 변환 후 실행 |
| AI 평가/교정 | 서버 설치 CLI 3종을 비대화형 subprocess로 호출: Claude Code(`claude -p`), Codex CLI(`codex exec`), Antigravity CLI(`agy -p`) |
| 문항 유형 | 서베이 기반 질문, 롤플레잉 — 2가지만 |
| 데이터 입력 | 문항·문장 모두 앱 내 관리 화면에서 CRUD |
| 결과 보존 | 평가·교정 결과 히스토리 DB 저장 + 교정 결과를 버튼 한 번으로 표현 노트에 추가 |
| 실행 환경 | 개발: 로컬 Windows(localhost). 배포: OCI 리눅스 컴퓨트 인스턴스(Caddy TLS) |
| 인증 | 없음(1인용). OCI 배포 시 단순 액세스 토큰 헤더 옵션만 고려 |

### 사전 조사 결과 (실현 가능성)

- 3개 CLI 모두 비대화형 실행 지원: `claude -p --output-format json`, `codex exec --json`, `agy -p`.
- 단, **오디오 파일을 직접 입력받는 CLI는 없음** → 서버에서 whisper.cpp로 STT 후 전사 텍스트를 CLI에 전달하는 구조로 확정.
- Antigravity CLI는 Windows 비대화형 실행 시 stdin 미종료로 hang 하는 이슈 보고 있음 → subprocess 실행 시 stdin 즉시 닫기로 대응.

## 2. 전체 아키텍처

```
[PWA (Vite+React+TS)]  ←HTTP/JSON→  [Node.js Fastify 서버]
  - 마이크 녹음(MediaRecorder)           ├─ SQLite (better-sqlite3)
  - 폴링으로 작업 상태 확인               ├─ uploads/ (녹음 파일 저장)
                                        └─ subprocess 실행기
                                             ├─ ffmpeg + whisper.cpp  (STT)
                                             ├─ claude -p --output-format json
                                             ├─ codex exec --json
                                             └─ agy -p
```

- 서버가 빌드된 PWA 정적 파일을 함께 서빙. 프로세스 하나로 운영.
- 외부 AI 연동은 전부 "subprocess 실행 + stdout JSON 파싱"이라는 단일 패턴.
- CLI 어댑터 인터페이스: `run(cli, model, prompt) → {text, raw}`. 3종을 플러그인처럼 등록.
- 동시 실행은 서버 내 큐로 1개씩 순차 처리(메모리 폭주 방지, 1인용이므로 충분).

## 3. 화면 구성 (하단 탭 5개)

1. **연습(홈)**: 카테고리(서베이/롤플레잉) → 문항 목록 → 문항 상세. 상세에서 질문 표시 → 녹음 시작/정지(MediaRecorder, webm/opus) → 업로드 → 진행 표시(전사 중 → 평가 중 → 완료) → 결과(전사문 + 피드백). CLI·모델 선택 드롭다운(미선택 시 설정의 기본값).
2. **교정**: 영어 문장 입력 → CLI·모델 선택 → 교정문·대안 표현·설명 표시 → [노트에 저장] 버튼으로 카테고리 지정해 저장.
3. **노트**: 카테고리별 영어 문장 목록 조회/추가/수정/삭제.
4. **기록**: 평가·교정 히스토리 목록 → 상세 다시 보기(녹음 다시 듣기 `<audio>` 포함).
5. **설정**: 문항 관리(카테고리·문항 CRUD), 기본 CLI·CLI별 기본 모델, whisper 모델 크기.

## 4. 데이터 모델 (SQLite, 6개 테이블)

작업(job) 테이블 없이 평가/교정 레코드가 자체 상태를 가짐.

- **categories**: `id`, `type`(`survey`|`roleplay`), `name`, `sort_order`
- **questions**: `id`, `category_id`, `text`, `note`(선택: 힌트·전략 메모), `created_at`
- **attempts**: `id`, `question_id`, `audio_path`, `transcript`, `cli`, `model`, `status`(`uploaded→transcribing→evaluating→done|error`), `result_json`, `error_message`, `created_at`
- **corrections**: `id`, `input_text`, `cli`, `model`, `status`(`pending→running→done|error`), `result_json`, `error_message`, `created_at`
- **sentences**: `id`, `category_id`, `text_en`, `memo`(선택), `source`(`manual`|`correction`), `created_at`
- **settings**: key-value (`default_cli`, CLI별 `default_model`, `whisper_model` 등)

CLI별 선택 가능 모델 목록은 서버 코드 상수로 관리하고, 설정 화면에서는 기본값 선택만 한다.

## 5. API 설계 (`/api` 하위, JSON)

| 영역 | 엔드포인트 |
|---|---|
| 카테고리 | `GET/POST /categories`, `PUT/DELETE /categories/:id` |
| 문항 | `GET/POST /questions`, `PUT/DELETE /questions/:id` (카테고리 필터) |
| 평가 | `POST /attempts`(multipart: 오디오+question_id+cli+model) → `202 {id}`, `GET /attempts/:id`(폴링), `GET /attempts` |
| 교정 | `POST /corrections` → `202 {id}`, `GET /corrections/:id`, `GET /corrections` |
| 노트 | `GET/POST /sentences`, `PUT/DELETE /sentences/:id` |
| 설정 | `GET/PUT /settings`, `GET /meta/clis`(CLI·모델 목록) |

비동기 규약: 장시간 작업은 `202` + id 반환, 프론트가 2초 간격 폴링. SSE/WebSocket은 프로토타입 범위 외.

## 6. 평가 파이프라인

1. 오디오 저장(`uploads/{attempt_id}.webm`) → `transcribing`
2. ffmpeg 16kHz WAV 변환 → whisper.cpp 실행 → `transcript` 저장 → `evaluating`
3. 프롬프트 조립: 문항 텍스트 + 전사문 + 평가 지시(OPIc 채점 관점: 과제 수행, 답변 구성, 어휘·문법, 추천 표현. JSON으로만 응답 지시)
4. 선택 CLI subprocess 실행. 공통 정책: 타임아웃 180초, 작업 디렉터리는 빈 샌드박스 폴더, 도구 실행 비활성(`--disallowedTools "*"` 등), stdin 즉시 닫기
5. stdout에서 JSON 추출(코드펜스 감싸짐 대비 관대한 파싱) → `result_json` 저장 → `done`

교정 파이프라인은 1–2단계(오디오/STT)를 제외하고 동일.

## 7. 에러 처리

- 단계 실패 시 `status=error` + `error_message`(실패 단계 명시: STT 실패/CLI 타임아웃/JSON 파싱 실패). 화면에 표시하고 [다시 시도] 제공 — 같은 입력으로 상태를 리셋해 재실행(새 레코드 생성 없음).
- CLI stdout JSON 파싱 실패 시에도 원문(`raw`)을 보존해 "원문 보기"로 노출.
- 오디오 파일은 삭제하지 않고 보관(기록 화면에서 다시 듣기).

## 8. PWA 범위

- 매니페스트 + 아이콘 + 설치 가능까지. 서비스워커는 정적 자산 캐시만, API는 캐시하지 않음(항상 온라인 전제). 오프라인 녹음 큐 제외.
- 마이크는 secure context 필요: 개발은 localhost, OCI 배포는 Caddy 리버스 프록시 TLS.

## 9. 테스트 범위 (AGENTS.md 가성비 기준)

- **단위**: CLI stdout 관대한 JSON 파싱, 프롬프트 조립, 상태 전이 규칙.
- **통합**: 평가/교정 API 흐름을 가짜 CLI 스텁(고정 JSON echo 스크립트)으로 end-to-end 검증. 실제 CLI·whisper 호출은 자동 테스트 제외, 수동 검증으로 기록.
- **화면**: 녹음→결과 표시 핵심 전이 1개만.

## 10. 범위 제외 (프로토타입)

- 다중 사용자·인증, 오프라인 동작, SSE/실시간 푸시, 발음 평가(음성 자체 분석), 서베이 편집 화면(서베이는 고정 전제), CLI 모델 목록 자동 동기화.
