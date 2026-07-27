# OPIcT 프로토타입 구현 계획 — 개요

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 각 작업은 이 디렉터리의 개별 파일(01~12)에 있으며, **반드시 번호 순서대로** 실행한다.

**Goal:** OPIc 연습용 1인 PWA — 문항 연습(녹음→whisper STT→CLI 평가), 문장 교정, 카테고리별 표현 노트.

**Architecture:** Node.js(Fastify)+SQLite 단일 서버가 REST API와 빌드된 PWA 정적 파일을 서빙. 외부 AI(whisper.cpp, claude/codex/agy CLI)는 전부 subprocess 실행 + stdout 파싱. 장시간 작업은 레코드 상태 컬럼 + 프론트 2초 폴링.

**Tech Stack:** Node.js 22+(ESM), Fastify 5, better-sqlite3, @fastify/static, @fastify/multipart, Vite + React 18 + TypeScript, node:test(서버 테스트), whisper.cpp + ffmpeg.

**Spec:** `docs/superpowers/specs/2026-07-27-opict-prototype-design.md` (모든 요구는 spec이 기준)

## Global Constraints

- 사용자 1명, 인증 없음. REST base는 `/api`.
- 카테고리 type은 `survey` | `roleplay` 두 값만.
- attempts status: `uploaded→transcribing→evaluating→done|error`. corrections status: `pending→running→done|error`.
- CLI 비대화형 호출 공통 정책: 프롬프트는 stdin으로 전달, stdin 즉시 종료, 타임아웃 180초, 작업 디렉터리는 빈 샌드박스 폴더, 도구 실행 비활성.
- CLI stdout JSON 파싱 실패해도 원문(raw)은 반드시 DB에 보존.
- 테스트는 TDD(실패 확인 후 구현). 실제 CLI·whisper는 자동 테스트에서 호출하지 않고 스텁 사용, 실제 호출은 수동 검증으로 기록.
- **DB 비의존(리포지토리 패턴)**: 라우트·파이프라인·프론트는 SQL과 DB 드라이버를 절대 직접 사용하지 않는다. DB 접근은 `server/src/repo/*` 계층으로만 한다(`createRepos(db)`가 만든 repo 객체를 `app.repos`로 주입). 나중에 MariaDB로 전환 시 `db.js`+`schema.sql`+repo 구현만 교체하면 되도록, repo 밖에서는 better-sqlite3 타입·SQLite 전용 문법이 보이면 안 된다. repo 내부 SQL도 가능한 표준 SQL 부분집합으로 작성한다.
- 커밋 메시지는 Conventional Commits, scope는 `stage-XX`(작업 번호). 예: `feat(stage-02): add category and question crud api`.
- **모든 작업은 끝나면 사용자가 `npm run dev`(server) [+ `npm run dev`(web)]로 직접 검증 가능한 상태여야 한다.** 각 작업 파일 끝의 "사용자 수동 검증" 절이 그 시나리오다.

## 작업 목록 (파일별)

| # | 파일 | 내용 | 수동 검증 방식 |
|---|---|---|---|
| 01 | `01-server-scaffold.md` | 서버 스캐폴드 + DB 스키마 + 헬스체크 | curl /api/health |
| 02 | `02-category-question-api.md` | 카테고리·문항 CRUD API | curl |
| 03 | `03-web-scaffold.md` | 웹 스캐폴드 + 탭 5개 + 서버 연결 표시 | 브라우저 |
| 04 | `04-admin-ui.md` | 설정 탭: 카테고리·문항 관리 UI | 브라우저 CRUD |
| 05 | `05-notes.md` | 노트 API + 노트 화면 | 브라우저 |
| 06 | `06-cli-adapter-correction-api.md` | CLI 어댑터·큐·관대한 파싱 + 교정 API | curl(스텁·실 CLI) |
| 07 | `07-correction-ui.md` | 교정 화면 + 노트 저장 연동 | 브라우저 |
| 08 | `08-settings.md` | 설정 API + 기본 CLI/모델 화면 | 브라우저 |
| 09 | `09-stt-attempts-api.md` | ffmpeg+whisper STT + 평가 API | curl(샘플 오디오) |
| 10 | `10-practice-ui.md` | 연습 화면(녹음→폴링→결과) | 브라우저 e2e |
| 11 | `11-history-retry.md` | 기록 화면 + 다시 시도 + 다시 듣기 | 브라우저 |
| 12 | `12-pwa-finish.md` | PWA 매니페스트·서비스워커 + 마무리 검증 | 폰/브라우저 설치 |

## 디렉터리 구조 (최종)

```
server/
  package.json
  src/
    server.js            # 엔트리 (listen)
    app.js               # buildApp({dbFile,...}) — 라우트 등록
    db.js                # createDb(file) — SQLite 연결·스키마 적용 (DB 전환 시 교체 지점)
    schema.sql           # SQLite용 DDL (DB 전환 시 교체 지점)
    repo/                # index.js(createRepos) + categories.js questions.js
                         # sentences.js corrections.js attempts.js settings.js
                         # — SQL은 여기에만 존재
    routes/              # categories.js questions.js sentences.js
                         # corrections.js attempts.js settings.js meta.js
                         # — app.repos만 사용, SQL 금지
    ai/                  # clis.js runner.js parse.js prompts.js queue.js
    stt/whisper.js
    pipelines/           # correction.js attempt.js
  test/                  # *.test.js (node:test) + fixtures/stub-cli.js
  data/                  # opict.db, uploads/ (gitignore)
web/
  package.json vite.config.ts index.html
  public/manifest.webmanifest icons/ sw.js
  src/
    main.tsx App.tsx api.ts
    pages/ PracticePage.tsx CorrectPage.tsx NotesPage.tsx
           HistoryPage.tsx SettingsPage.tsx
```

## 실행 방법 (모든 작업 공통)

```bash
# 서버 (D:\work\opict\server)
npm run dev          # http://localhost:3000

# 웹 (D:\work\opict\web) — 작업 03부터
npm run dev          # http://localhost:5173 (API는 3000으로 프록시)
```
