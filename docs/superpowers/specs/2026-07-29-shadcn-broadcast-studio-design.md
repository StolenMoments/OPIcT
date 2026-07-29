# shadcn/ui Night Broadcast Studio 디자인

## 목표

OPIcT 전체 웹 UI를 shadcn/ui 기반 Night Broadcast Studio로 교체한다. 로그인부터 연습, 교정, 노트, 기록, 설정까지 하나의 콘솔 문법으로 묶되 서버 API, 인증, 데이터 타입, 녹음과 폴링 로직은 유지한다.

이 제품은 한 명의 사용자가 밤에 혼자 OPIc 답변을 녹음하고 평가·교정·복습하는 개인 트레이너다. 화면은 “소형 방송 부스”처럼 현재 입력과 신호를 명확히 보여 주어야 한다.

## 승인된 방향

선택된 A안은 흑연색 표면, 앰버 탤리, 얇은 구획선, 방송 콘솔형 패널을 사용한다. 다크가 기본이지만 라이트와 시스템 테마를 지원한다. 앰버는 현재 메뉴, 주요 행동, 녹음·진행 상태에만 사용하며 기존 PWA 아이콘과 브랜드 표식을 유지한다.

모바일과 PC 모두 상단 상태 헤더와 하단 고정 5메뉴를 쓴다. PC의 추가 공간은 별도 사이드바가 아니라 본문 2단 비교 레이아웃에 사용한다.

## 기반과 컴포넌트

- Vite와 React 18을 유지하고 Tailwind CSS v4, CSS 변수, `@/*` 별칭을 추가한다.
- shadcn/ui는 Base UI 기반 `base-mira`, neutral base, Lucide 아이콘으로 구성한다.
- Button, Field, Input, Textarea, Select, Alert, AlertDialog, Badge, Skeleton, Spinner, Empty, Tabs, Collapsible, Separator, Sonner를 생성한다.
- shadcn primitive는 범용 API를 유지하고 앱 의미는 `StatusBadge`, `ErrorAlert`, `ActionEmpty`, `ListSkeleton` 래퍼에 둔다.
- 기존 페이지별 CSS는 소비자를 전환한 뒤 제거하고 전역 토큰과 의미 있는 컴포넌트 클래스는 `src/styles/globals.css`에 통합한다.

Windows의 대소문자 비구분 파일 시스템에서 `Button.tsx`와 `button.tsx`가 충돌하므로 기존 컴포넌트 소비자를 새 API로 전환한 후 옛 파일을 제거한다.

## 셸과 테마

`TabKey`는 `practice | correct | notes | history | settings`로 고정한다. 하단 내비게이션은 Lucide 아이콘, 라벨, `aria-current`, 최소 44px 터치 영역을 갖는다. 상단 헤더에는 제품명과 실제 서버 연결 상태를 표시한다.

ThemeProvider는 `dark | light | system`을 제공하고 기본값은 `dark`, 저장 키는 `opict-theme`이다. 문서가 그려지기 전에 저장값 또는 기본값을 적용해 깜빡임을 막고, 해석된 실제 테마를 `color-scheme`, 브라우저 `theme-color`, Android `window.opictAndroid.setTheme(dark)`와 동기화한다.

## 화면 흐름

### 로그인

세션 확인 동안 앱을 숨기는 인증 게이트와 기존 비밀번호 오류 계약을 유지한다. 로그인 패널은 제품 표식, 짧은 안내, Field와 submit Button으로 구성한다.

### 연습

질문 선택과 읽기를 가장 큰 패널에 둔다. CLI와 모델은 독립된 신호 레일에 두고 긴 모델명이 레이아웃을 깨지 않게 한다. 녹음 버튼은 단 하나의 큰 pill 예외이며 타이머와 tally를 함께 표시한다. 제출 뒤 업로드, 전사, 평가 단계를 상태 텍스트와 점으로 연결하고 완료 결과는 긴 산문을 읽기 좋은 패널에 표시한다. 권한 거부, 서버 실패, JSON 파싱 실패를 복구 가능한 상태로 제공한다.

### 교정

입력과 결과를 모바일에서는 세로, PC에서는 좌우로 배치한다. 비어 있는 입력, 요청 오류와 긴 결과를 처리하며 유용한 표현은 결과 문맥에서 바로 노트에 저장한다.

### 노트와 설정

추가와 수정은 페이지 안에서 이어지고 입력 내용을 보존한다. 삭제는 AlertDialog로 확인한다. 설정 로그아웃은 기존 세션 종료 계약을 유지한다.

### 기록

평가와 교정 기록을 Tabs로 나눈다. 각 항목은 Collapsible row이며 날짜, 상태, 주요 문장을 먼저 보여 주고 상세 결과, 오디오 재생, 실패 재시도는 펼친 뒤 제공한다.

## 오류와 빈 상태

로딩은 콘텐츠 모양을 보존하는 Skeleton을 사용하고 버튼 내부의 짧은 작업만 Spinner를 쓴다. 빈 상태는 단순히 “없음”이라고 끝내지 않고 현재 화면에서 가능한 다음 행동을 제공한다. API 오류는 일관된 Alert 래퍼로, 짧은 저장 성공은 Sonner로 알린다.

## 접근성과 반응형

- 모든 폼에 보이는 label과 연결된 설명·오류를 제공한다.
- 키보드 포커스, 44px 터치 영역, 텍스트 대비를 유지한다.
- 비동기 상태는 `aria-live`로 알리고 색만으로 표현하지 않는다.
- safe-area를 헤더·하단 메뉴·본문 여백에 반영한다.
- 390×844는 단일 열, 1440×900은 본문 2단 레이아웃을 기준으로 한다.
- reduced-motion에서는 tally pulse, skeleton shimmer와 전환 이동을 제거한다.

## 검증 계약

자동 테스트는 인증 게이트, 하단 메뉴 전환, 테마 저장, 질문 선택→녹음·제출 대표 전이, 평가 진행·완료·파싱 실패, 설정 로그아웃을 보호한다. 단순 CSS 조합과 반복 문구는 테스트하지 않는다.

구현 중에는 관련 Vitest만 실행하고 기능 단위가 끝난 뒤 웹 전체 테스트와 빌드를 실행한다. 최종에는 웹 `npm ci`·전체 Vitest·build, 서버 `npm ci`·전체 테스트, Android `gradlew clean test assembleDebug`를 한 번 clean 실행한다. 실제 API를 연결해 390×844와 1440×900에서 양 테마와 주요 상태를 확인한다. 장치가 없으면 실제 마이크와 Android 권한 브리지는 미검증 흐름으로 명시한다.

## 범위 밖

라우터, 새 백엔드 계약, 인증 방식, 평가 프롬프트, 저장 데이터 구조, PWA 브랜드 자산 교체, React 19 업그레이드와 다인 사용자 기능은 추가하지 않는다.
