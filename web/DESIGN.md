# OPIcT — Night Broadcast Studio

Register: **product / operate**. 연습자가 밤에 혼자 마이크 앞에 앉아 질문을 읽고 신호를 보내는 소형 방송 부스가 시각 세계다. shadcn/ui의 접근 가능한 기본 동작 위에 방송 콘솔의 계기판 문법을 얹되, 과업보다 장식이 앞서지 않는다.

## 장면과 원칙

30대 직장인이 밤 10시 어두운 거실에서 휴대폰을 세워 두고 답변을 녹음한다. 팔 길이에서도 문항과 녹음 상태가 읽혀야 하고, 업로드·전사·평가 신호가 한눈에 구분되어야 한다.

- 다크가 기본이며 라이트와 시스템 테마도 동등하게 동작한다.
- 딥 네이비 표면과 시안 탤리 한 색으로 신호를 만든다.
- 패널은 방송 콘솔처럼 선명한 구획과 상태 레일을 갖되 카드 중첩은 피한다.
- 기존 PWA 아이콘의 도형은 유지하고 정적 브랜드 색 `#111A2E`, `#42B8F4`, `#EFF7FF`로 재색상한다.

## 기술 기반

- Tailwind CSS v4와 CSS 변수, `@/*` 별칭을 사용한다.
- shadcn/ui는 Base UI 기반 `base-mira`, neutral base, Lucide 아이콘으로 구성한다.
- 생성 컴포넌트는 `web/src/components/ui`에 두며 React 18을 유지한다.
- 앱 의미는 `StatusBadge`, `ErrorAlert`, `ActionEmpty`, `ListSkeleton` 같은 얇은 래퍼에서만 추가한다.
- 새 시각 결정은 `web/src/styles/globals.css`의 토큰이나 의미 있는 컴포넌트 클래스에 둔다. 인라인 스타일로 토큰을 우회하지 않는다.

## 색과 테마

색 전략은 **Restrained**다. 딥 네이비 표면에 시안을 primary action, 현재 탭, 녹음·진행 신호에만 사용한다. 성공은 녹색, 오류와 삭제는 빨간색으로 유지해 상태 의미를 보존한다.

| 역할 | 다크 | 라이트 |
|---|---|---|
| background | `#111A2E` | `#F7F9FF` |
| card/popover | `#182541` | `#FFFFFF` |
| secondary/muted | `#223556` | `#E6EEF8` |
| border/input | `#55749A` | `#7190AD` |
| foreground | `#EFF7FF` | `#14213D` |
| muted foreground | `#A9BED4` | `#4C627C` |
| primary | `#42B8F4` | `#0B6F9E` |
| destructive | `#FF8A82` | `#BE3E48` |
| success | `#6FD39A` | `#287A4E` |
| ring | `#8EDBFF` | `#0B6F9E` |

`.dark`가 명시적 다크, `.light`가 명시적 라이트를 소유한다. `system`은 OS 선호를 따라 실제 클래스와 `color-scheme`, 브라우저 `theme-color`, Android 시스템 바를 동기화한다.

## 타이포그래피와 수치

한글과 영문이 섞이는 작업 화면이므로 drillup과 동일한 로컬 NanumSquare를 기본 글꼴로 사용하고, 로딩 전에는 시스템 산세리프로 대체한다.

```css
font-family: "NanumSquare", system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
```

- 화면 제목 1.5rem/1.25, 패널 제목 1.125rem/1.35, 본문 0.9375rem/1.65, 메타 0.75rem/1.4.
- 제목은 `letter-spacing: -0.02em`, 본문은 기본 자간을 유지한다.
- 타이머, 신호 번호, 상태 시간에는 tabular numerals를 사용한다.
- 문항과 결과 산문은 최대 68ch이며 긴 영문·모델명은 `overflow-wrap: anywhere`로 보존한다.

## 공간과 표면

- 스페이싱은 4 / 8 / 12 / 16 / 24 / 32 / 48px 리듬을 쓴다.
- 일반 컨트롤 radius는 8px, 패널은 12px, 배지와 연습 녹음 버튼만 pill이다.
- 표면은 얇은 1px 보더와 명도 차로 나눈다. 큰 그림자와 보더를 같은 패널에 겹치지 않는다.
- 떠 있는 AlertDialog와 toast만 절제된 그림자를 허용한다.
- 목록은 카드 그리드가 아니라 separator가 있는 행으로 표현한다.

## 셸과 반응형

- 모든 화면은 상단 상태 헤더와 하단 고정 5메뉴를 공유한다.
- 하단 메뉴는 아이콘과 라벨을 함께 쓰며 현재 메뉴는 시안 라벨과 상단 tally line으로 표시한다. 각 항목은 최소 44px다.
- 본문은 safe-area를 포함해 헤더와 하단 메뉴에 가리지 않는다.
- 모바일은 단일 열이다. 900px 이상에서는 본문 최대 폭을 넓혀 연습 신호 레일, 교정 입력·결과, 설정 그룹을 2단으로 배치한다.
- PC에서도 하단 메뉴 위치를 바꾸지 않는다. 넓은 공간은 본문의 비교와 읽기에만 사용한다.

## shadcn/ui 사용 규칙

- Button: `default`, `outline`, `destructive`, `ghost`만 사용한다. 로딩은 라벨을 유지한 채 Spinner를 앞에 둔다.
- Field/Input/Textarea/Select: 항상 보이는 라벨, 설명, 오류를 연결한다.
- Alert: 복구 가능한 API 오류와 권한 안내를 표시한다.
- AlertDialog: 노트·설정 삭제처럼 되돌리기 어려운 행동에만 쓴다. 브라우저 `confirm`을 쓰지 않는다.
- Badge: 서버, 녹음, 처리 상태를 텍스트와 함께 표시한다.
- Skeleton/Spinner: Skeleton은 목록·결과 자리 보존, Spinner는 버튼 내부의 짧은 작업에 사용한다.
- Empty: 현재 상태의 이유와 실행 가능한 다음 행동을 한 문장으로 묶는다.
- Tabs/Collapsible: 기록 유형과 기록 행의 상세 정보에만 쓴다.
- Sonner: 저장·복사처럼 화면 구조를 바꾸지 않는 짧은 성공 피드백에 쓴다.

## 화면 계약

- 로그인: 방송 부스 입장 패널 한 개로 세션 확인, 비밀번호 제출, 서버 오류를 처리한다.
- 연습: 질문을 가장 크게 두고 CLI·모델은 옆 신호 레일로 분리한다. 녹음 버튼과 타이머, 탤리, 업로드→전사→평가 신호를 연속으로 보여 준다.
- 교정: 모바일은 입력 다음 결과, PC는 좌우 비교다. 결과 문맥에서 바로 노트로 저장한다.
- 노트·설정: 추가·수정은 인라인이며 삭제는 AlertDialog로 확인한다.
- 기록: 평가/교정 Tabs 아래 Collapsible 행을 사용하고 오디오 재생과 재시도를 유지한다.
- 모든 화면은 로딩, 실행 가능한 빈 상태, 오류, 긴 콘텐츠, 권한 거부와 파싱 실패를 처리한다.

## 모션과 접근성

- 모션은 150–220ms의 빠른 ease-out이며 탭, 버튼, 배너, skeleton, 녹음 tally처럼 상태 전달에만 쓴다.
- `prefers-reduced-motion: reduce`에서는 pulse와 이동을 제거한다.
- 포커스 링은 모든 키보드 조작 요소에 명확히 보이고 본문 대비 4.5:1을 유지한다.
- 아이콘 단독 버튼은 접근 가능한 이름을 갖고 비동기 변화는 `aria-live`로 알린다.
- 색만으로 상태를 전달하지 않는다.

## 금지

- 글래스모피즘, 그라디언트 텍스트, 장식용 그리드 배경, 컬러 사이드 스트라이프.
- 섹션마다 반복되는 대문자 eyebrow와 의미 없는 번호.
- 카드 속 카드, 모든 내용을 pill에 넣기, 과도한 둥근 모서리.
- 장식용 시안 사용, 바운스 모션, 중앙 전체 화면 spinner.
- shadcn 컴포넌트의 내부 API를 앱 도메인에 맞춰 과도하게 변형하기.
