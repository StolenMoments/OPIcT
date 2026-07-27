# Task 11 구현 보고서

## 결과

기록 화면에 평가/교정 서브탭, 펼침 상세, 다시 시도, 평가 오디오 다시 듣기를 추가했다. 서버 retry 라우트는 기존 레코드 ID를 유지하고 기존 `enqueue`·pipeline·CLI 실행 경로를 재사용한다.

## 변경 파일

- `server/src/routes/retry.js`
  - `POST /api/attempts/:id/retry`
  - `POST /api/corrections/:id/retry`
  - `GET /api/attempts/:id/audio` (`audio/webm` 스트리밍)
- `server/src/app.js`
  - retry 라우트 등록
- `server/test/retry.test.js`
  - 교정 retry 동일 레코드 재실행
  - 평가 retry 동일 레코드 재실행 및 오디오 스트리밍
  - 없는 retry/audio 대상의 404
- `web/src/pages/HistoryPage.tsx`
  - `usePolling` 기반 평가/교정 기록 목록
  - 실제 결과, 로딩 skeleton, 오류 banner, 빈 상태, 펼침 상세
  - `AttemptResult` 재사용, retry 오류 처리, 접근 가능한 탭/행/오디오 컨트롤
- `web/src/pages/HistoryPage.css`
  - 기존 페이지 전용 CSS 패턴과 DESIGN.md 토큰만 사용
  - row/list 레이아웃, 좁은 화면 overflow 방지, focus-visible은 기존 전역 규칙 사용

기존 사용자 변경 파일인 `.agents/`, `.gemini/`, `AGENTS.md`는 수정하지 않았다.

## TDD 증거

### RED

1. `server/test/retry.test.js`에 교정 retry 테스트를 먼저 추가했다.
2. brief의 `claude-fable-5`는 Task 09에서 현재 allowlist에 없다는 것이 확인되어, 테스트는 실제 허용 모델 `claude-haiku-4-5-20251001`을 사용했다. CLI allowlist나 모델 수는 변경하지 않았다.
3. 실행 명령:

   `cd server && npm test`

4. 구현 전 결과: 43개 중 42개 통과, 새 테스트 실패.
5. 구체적 실패: `Expected values to be strictly equal: 404 !== 202`.

### GREEN

서버 라우트를 추가한 뒤 실행한 명령:

`cd server && node --test test/retry.test.js`

결과: 3개 통과, 0개 실패.

최종 서버 전체 테스트:

`cd server && npm test`

결과: 45개 통과, 0개 실패.

웹 검증:

- `cd web && npm test` — 3개 통과, 0개 실패
- `cd web && npm run build` — TypeScript/Vite build 성공

웹 테스트에는 기존 Vite/esbuild 설정의 deprecation warning이 출력되었지만 테스트와 build exit code는 0이었다.

## 계약 및 동작 확인

- retry는 새 레코드를 만들지 않고 기존 ID를 `202 { id }`로 반환한다.
- 평가 retry는 `uploaded`로, 교정 retry는 `pending`으로 상태를 되돌린 뒤 기존 pipeline을 queue에 넣는다.
- 기존 `runAttempt`, `runCorrection`, `enqueue`, repository public signature는 변경하지 않았다.
- CLI 호출과 raw output 보존은 기존 pipeline을 그대로 통과한다.
- 오디오 파일이 없거나 레코드가 없으면 audio endpoint가 404를 반환한다.
- 기록 화면은 활성 서브탭만 polling하고, retry 후 목록 상태 변화는 기존 polling 주기로 반영된다.

## 디자인·접근성 self-review

- 인라인 `style={{}}`, `alert`, `prompt`, `confirm`을 사용하지 않았다.
- 새 색/spacing/radius/token을 만들지 않고 기존 `--s-*`, `--t-*`, `--surface`, `--line`, `--ink-*`, `Button`, `StatusPill`, `ErrorBanner`, `Skeleton`, `EmptyState`를 재사용했다.
- 목록은 중첩 카드가 아닌 구분선 기반 row/list 구조다. colored side stripe와 장식용 shadow를 추가하지 않았다.
- 로딩, 실제 결과, 서버 오류, malformed result, 빈 목록, retry 오류를 각각 표시한다.
- 펼침 행은 `aria-expanded`/`aria-controls`, 서브탭은 `role=tab`/`aria-selected`/`aria-controls`, 오디오는 accessible label을 제공한다.
- 기존 전역 `:focus-visible` 규칙으로 키보드 focus ring을 유지한다.
- 제목/메타 텍스트는 overflow-wrap을 사용하고, audio/pre/list 영역은 좁은 화면에서 넘치지 않도록 제한했다.

## 우려 및 미검증 범위

- 자동화된 실제 브라우저 세션에서 모바일/데스크톱의 시각적 렌더링, 키보드 이동, 실제 녹음 파일 재생을 수동 확인하지 않았다. 웹 build와 정적 CSS/접근성 구조, Fastify inject 기반 오디오 응답은 검증했다.
- 서버 테스트는 실제 Claude/Whisper 실행이 아니라 기존 stub CLI/STT를 사용한다. 운영 CLI 환경에서 error 상태를 복구하는 수동 검증은 별도로 필요하다.
- retry 테스트에서 사용한 모델명은 brief 예시와 다르며, 현재 저장소의 allowlist 계약을 따르기 위한 의도적인 보정이다. 새로운 모델은 추가하지 않았다.
- `git remote -v` 결과가 비어 있어 원격 push는 수행하지 못했다. 구현은 로컬 `master` 커밋으로 남겼다.

## 리뷰 후속 수정

리뷰어의 Important 지적에 따라 `server/test/retry.test.js`를 보강했다.

- 없는 attempt/correction retry와 없는 audio 레코드의 응답 body가 정확히 `{ error: 'not found' }`인지 `assert.deepEqual`로 검증한다.
- 정상적으로 생성·처리된 기존 attempt의 `audio_path` 파일을 삭제한 뒤 audio endpoint를 호출해, 레코드는 존재하지만 파일이 없는 경우에도 정확한 404 body를 검증한다.
- 서버 라우트와 런타임 동작은 변경하지 않았다.
- 리뷰어가 deferred한 중간 reset 상태 검증은 추가하지 않았다.

검증 명령과 결과:

- `cd server && node --test test/retry.test.js` — 4개 통과, 0개 실패
- `cd server && npm test` — 46개 통과, 0개 실패
