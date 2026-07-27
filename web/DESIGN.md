# OPIcT — 디자인 시스템

Register: **product** (design serves the task). 사용자는 연습 중이고, UI는 과업 뒤로 사라져야 한다.

## 장면

30대 직장인이 밤 10시 어두운 거실에서 폰을 세워두고 혼자 영어로 말하며 녹음한다. 문항을 팔 길이에서 읽고, 녹음 버튼을 누르고, 결과를 기다린다. 눈부심이 없어야 하고, 지금 무슨 상태인지(녹음 중 / 처리 중 / 끝남)가 한눈에 보여야 한다.

→ **다크 우선. 앰버 액센트 하나(녹음 탤리 램프). 나머지는 무채색.**

## 색 (OKLCH, 전략: Restrained)

라이트/다크 두 테마를 모두 정의하되 **다크가 기본**이다. `:root`에 다크 값을 두고 `@media (prefers-color-scheme: light)`에서 라이트로 덮는다.

```css
:root {
  /* 표면 — 브랜드 hue(50°)를 아주 옅게만 섞는다 */
  --bg:          oklch(0.16 0.008 50);
  --surface:     oklch(0.21 0.010 50);   /* 카드·패널 */
  --surface-2:   oklch(0.25 0.012 50);   /* 상단바·하단탭 (두 번째 뉴트럴 레이어) */
  --line:        oklch(0.32 0.012 50);
  --line-strong: oklch(0.42 0.014 50);

  /* 잉크 */
  --ink:         oklch(0.97 0.004 50);
  --ink-muted:   oklch(0.76 0.010 50);   /* 본문 대비 4.5:1 이상 유지 — 더 어둡게 내리지 말 것 */
  --ink-faint:   oklch(0.62 0.010 50);   /* 비활성·보조 라벨 전용, 본문 금지 */

  /* 액센트 — primary action, 현재 선택, 녹음 상태에만 */
  --accent:      oklch(0.74 0.155 50);
  --accent-hover:oklch(0.79 0.155 50);
  --accent-ink:  oklch(0.18 0.020 50);   /* 액센트 위 텍스트 */
  --accent-weak: oklch(0.74 0.155 50 / 0.14);

  --danger:      oklch(0.70 0.170 25);
  --danger-weak: oklch(0.70 0.170 25 / 0.14);
  --success:     oklch(0.74 0.130 155);

  --focus:       oklch(0.80 0.120 240);  /* 포커스 링만 다른 hue — 액센트와 혼동 금지 */
}
```

라이트 테마는 같은 역할 이름으로: `--bg: oklch(1 0 0)`(순백), `--surface: oklch(0.975 0.003 50)`, `--surface-2: oklch(0.95 0.004 50)`, `--ink: oklch(0.22 0.010 50)`, `--ink-muted: oklch(0.45 0.012 50)`, `--accent: oklch(0.55 0.150 50)`, `--accent-ink: oklch(1 0 0)`.

**규칙**
- 액센트는 primary 액션 / 현재 탭 / 녹음·진행 상태에만. 장식 금지.
- 상태 어휘를 표준화: default, hover, focus-visible, active, disabled, selected, loading, error. 모든 인터랙티브 요소가 전부 가져야 한다.
- 비활성 상태에 채도 높은 색 금지 — `--ink-faint` + `opacity` 사용.

## 타이포그래피

한 패밀리만. `font-family: system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif` — 한글·영문이 한 화면에 섞이므로 한글 폴백을 반드시 포함한다.

고정 rem 스케일(비율 1.2, fluid clamp 금지):

| 토큰 | 크기 | 용도 |
|---|---|---|
| `--t-xs` | 0.75rem | 메타·타임스탬프 |
| `--t-sm` | 0.8125rem | 라벨·보조 |
| `--t-base` | 0.9375rem | 본문·폼 |
| `--t-md` | 1.0625rem | 문항 텍스트·교정문 |
| `--t-lg` | 1.25rem | 섹션 제목 |
| `--t-xl` | 1.5rem | 화면 제목 |

- 본문 `line-height: 1.6`, 제목 `1.25`.
- 제목 `letter-spacing: -0.015em` (플로어 -0.04em, 넘지 말 것).
- 산문은 `max-width: 68ch`, `text-wrap: pretty`. 제목은 `text-wrap: balance`.
- 영어 예문은 `font-variant-numeric: tabular-nums` 불필요, 대신 `hyphens: none`.

## 공간·형태

- 스페이싱: 4 / 8 / 12 / 16 / 24 / 32 / 48 (`--s-1`…`--s-7`). 리듬을 위해 섹션 간격은 크게, 요소 간격은 작게 — 균일하게 깔지 말 것.
- radius: 컨트롤 8px, 카드·패널 12px, 태그·상태칩 999px. **16px 초과 금지.**
- **예외 (연습 화면 녹음 버튼 단 하나만)**: 연습 화면의 단일 주 녹음 컨트롤(녹음 시작/종료·제출)은 엄지로 누르기 편해야 하는 이 앱의 핵심 액션이므로 `height: 56px`, `border-radius: var(--r-pill)`(999px)을 허용한다. 값은 `.practice-record__btn`(`web/src/pages/PracticePage.css`)에 고정. 다른 컨트롤·버튼은 이 예외를 참조하지 않는다 — 일반 Button 세 번째 size를 새로 만들지 말 것.
- 보더와 큰 그림자를 같은 요소에 겹치지 않는다. 어두운 UI에서는 보더 1px만 쓰고 그림자는 떠 있는 것(팝오버·토스트)에만.
- **카드 남용 금지.** 목록은 카드 그리드가 아니라 구분선 있는 행(row)으로. 카드 중첩은 항상 오답.

## 레이아웃

모바일 우선. `max-width: 44rem`, 좌우 `--s-4` 패딩.

- 상단: sticky 헤더(제품명 + 서버 상태 점). `--surface-2`.
- 본문: `padding-bottom` 은 하단 탭 높이 + `env(safe-area-inset-bottom)`.
- 하단: fixed 탭바 5개. `--surface-2`, 상단 1px 보더, `padding-bottom: env(safe-area-inset-bottom)`.
  - 현재 탭: 액센트 색 라벨 + 상단 2px 액센트 인디케이터. 배경 채우기 금지.
  - 탭 최소 터치 영역 44px.
- z-index 스케일을 토큰으로: `--z-sticky: 10; --z-popover: 20; --z-modal: 30; --z-toast: 40;` — 999 같은 임의값 금지.

## 컴포넌트 사양

전부 `web/src/styles/` 의 CSS와 `web/src/components/ui/` 의 얇은 래퍼로 구현한다. UI 라이브러리 추가 금지.

- **Button** — variant: `primary`(액센트 채움) / `default`(보더) / `ghost`(투명) / `danger`. size: `md`(높이 40px) / `sm`(32px). 모든 variant에 hover·active·`:focus-visible`(2px `--focus` 아웃라인, offset 2px)·disabled·loading(라벨 유지 + 좌측 스피너, 폭 변하지 않게) 상태. 세 번째 size는 만들지 않는다 — 연습 화면 녹음 버튼의 56px/pill radius는 위 공간·형태 섹션에 적힌 단일·명명된 예외이며 `.practice-record__btn` 클래스로 `primary` variant 위에 국소적으로 얹는다.
- **Field** — label + control + 선택적 힌트/에러. input·textarea·select 가 동일한 높이·보더·radius·포커스 링을 공유한다.
- **Row list** — `<ul>` 에 `border-bottom: 1px solid --line`, 마지막 항목 제외. 각 행: 주 텍스트 + 보조 메타 + 우측 액션. hover 시 `--surface` 배경.
- **Status pill** — `pending`/`running` = `--ink-muted` 보더 + 점 pulse, `done` = `--success`, `error` = `--danger`. 텍스트는 한국어.
- **Empty state** — "아직 없습니다" 금지. 무엇을 하면 되는지 한 문장 + 그 자리에서 실행 가능한 액션.
- **Skeleton** — 목록·결과 로딩은 스피너 대신 스켈레톤 행. 중앙 스피너 금지.
- **Error banner** — 화면 상단에 `--danger-weak` 배경 + `--danger` 텍스트, 닫기 버튼. 페이지마다 같은 컴포넌트.
- **Inline edit** — `prompt()` / `confirm()` 금지(브라우저 블로킹 다이얼로그). 이름 수정은 그 자리에서 input 으로 전환, 삭제는 행 안에서 "삭제 → 정말?" 2단 확인.

## 모션

- 트랜지션 150–220ms, `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo 계열). 바운스·일래스틱 금지.
- 상태 전달에만: 탭 인디케이터 이동, 버튼 눌림, 배너 등장, 스켈레톤 shimmer, 녹음 중 pulse.
- 페이지 로드 시퀀스 애니메이션 금지.
- `@media (prefers-reduced-motion: reduce)` 에서 모든 애니메이션을 즉시 전환 또는 크로스페이드로 대체하고, pulse 는 정적 표시로.
- 레이아웃 속성 애니메이션 금지 — `transform`/`opacity` 위주.

## 접근성

- 본문 대비 4.5:1, 큰 텍스트 3:1. placeholder 도 4.5:1.
- 모든 컨트롤에 접근 가능한 이름(라벨 또는 `aria-label`). 아이콘 단독 버튼 금지 또는 `aria-label` 필수.
- 비동기 상태 변화(교정 완료, 저장됨, 에러)는 `aria-live="polite"` 영역으로 알린다.
- 터치 타깃 최소 44×44.

## 금지 (이 프로젝트에서 특히)

- 그라디언트 텍스트, 글래스모피즘, 컬러 사이드 스트라이프, 장식용 그리드 배경, 손그림 SVG.
- 섹션마다 붙는 작은 대문자 eyebrow, 01/02/03 넘버링.
- 크림/샌드/베이지 배경.
- 인라인 `style={{...}}` 로 새 시각 결정을 내리는 것 — 값은 전부 토큰에서.
