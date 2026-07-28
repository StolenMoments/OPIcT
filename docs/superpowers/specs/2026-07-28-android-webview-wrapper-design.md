# OPIc Android WebView 래퍼 설계

## 목표

`https://opict.mygreed.shop/`을 개인 Android 기기에서 네이티브 앱처럼 사용할 수
있는 최소 WebView 셸과 운영 비밀번호 보호를 제공한다. 운영 인증은 OPIc 웹앱·Node
서버에 추가하고, 앱은 웹앱을 표시하는 역할과 Android 마이크 권한 중계를 담당한다.

## 제품 범위

- 앱 표시명: `OPIcT`
- application ID: `shop.mygreed.opict`
- 버전: `1.0.0` (`versionCode 1`)
- Android 10(API 29) 이상, compile/target SDK 36
- 단일 Activity, Kotlin, 세로·가로 방향 지원
- 개인 서명 APK만 지원하며 Play Store·AAB·딥 링크·알림·오프라인 데이터 저장은 제외
- 운영 접속은 서버에서 생성한 임의 비밀번호 로그인 뒤에만 허용
- GitHub Release `opict-android-v1.0.0`에 서명된 APK를 asset으로 업로드

## 구조

독립 Gradle 프로젝트를 `android/`에 둔다. `MainActivity`가 스플래시, 진행 표시,
WebView, 오류·재시도 화면, 뒤로가기를 소유한다. 시작 URL은 하나의 상수로 관리한다.

URL 이동은 `NavigationPolicy`가 `INTERNAL`, `EXTERNAL`, `BLOCKED`로 분류한다.
WebView 내부 링크와 새 창 요청은 같은 분류기를 사용한다.

## 이동·보안 정책

- 내부: user-info와 명시적 비표준 포트가 없는 정확한
  `https://opict.mygreed.shop` URL
- 외부: 다른 HTTPS 호스트, `mailto:`, `tel:`을 기본 앱으로 전달
- 차단: HTTP, user-info, 서브도메인·유사 도메인, 비표준 포트,
  `file:`, `content:`, `javascript:`, `intent:` 및 나머지 스킴
- JavaScript·DOM storage·1차 쿠키만 사용
- 서드파티 쿠키, 파일/콘텐츠 접근, 혼합 콘텐츠, JavaScript bridge는 사용하지 않음
- Safe Browsing 유지, SSL 오류는 항상 취소
- WebView 디버깅은 debug 빌드에서만 허용

## 운영 인증

운영 서버는 `OPICT_APP_PASSWORD_HASH`와 `OPICT_SESSION_SECRET`을
`/home/opc/opict/.env`에 저장한다. 원문 비밀번호는 저장소·GitHub Secrets·평문
환경변수에 넣지 않는다. 최초 서버 준비 스크립트가 강한 임의 비밀번호와 세션
시크릿을 생성하고 비밀번호를 초기 실행자에게 한 번 출력한 뒤, 해시와 시크릿만
mode 600 환경 파일에 기록한다.

- 로그인 전에는 데이터 API와 앱 기능 API를 모두 401로 거부
- `/api/health`, `/api/auth/login`, `/api/auth/session`만 비인증 공개
- 로그인 성공 시 `HttpOnly`, `Secure`, `SameSite=Lax` 세션 쿠키 발급
- 로그인 실패는 IP별 메모리 rate limit으로 제한하고 `Retry-After`를 반환
- 운영 설정이 없으면 production 서버는 기동하지 않음
- 최초 `/` 접속과 세션 만료 후에는 Drillup과 동일하게 앱 기능 대신 비밀번호 입력 화면을 표시
- 로그인 성공 후에만 기존 앱 화면을 표시하고, Android WebView는 세션 쿠키를 유지

## 마이크 권한

OPIc 연습 화면은 `getUserMedia({ audio: true })`를 사용하므로 앱에
`RECORD_AUDIO` 권한과 WebView `onPermissionRequest` 중계를 추가한다.

- 정확한 내부 HTTPS origin의 audio capture만 허용
- video capture 또는 내부 origin이 아닌 요청은 거부
- Android runtime permission이 없으면 권한 대화상자를 요청하고, 결과에 따라 보류한
  WebView 요청을 grant/deny
- 권한 요청을 처리할 때 외부 URL·임의 WebView resource를 허용하지 않음

## 네이티브 UX

- 시작 시 PWA 아이콘과 배경색을 사용하는 Android splash 표시
- 탐색 중 상단 progress 표시
- 최상위 문서의 네트워크·HTTP·SSL 실패와 renderer 종료에 한국어 오류·재시도 UI 표시
- WebView 방문 기록 우선 뒤로가기, Activity 재생성 시 상태 저장·복원
- edge-to-edge 및 system bar inset 적용
- 차단 URL 또는 외부 앱 부재 시 크래시 없이 안내

## 서명과 Release

PowerShell 스크립트가 새 OPIc 전용 keystore와 properties를 한 번만 생성한다. 기존
파일은 덮어쓰지 않으며, keystore와 비밀번호는 git과 GitHub Release asset에서
제외한다. Release APK만 `gh release create`로 GitHub에 업로드한다.

## 완료 기준

- 비밀번호 해시·세션·로그인 rate limit·보호 API 계약 테스트 통과
- NavigationPolicy와 WebView audio permission policy 경계 테스트 통과
- `gradlew.bat test lint assembleDebug assembleRelease` 통과
- release APK `apksigner verify` 통과
- 실제 HTTPS URL의 APK가 빌드되고 GitHub Release asset으로 공개됨
- 실제 Android 기기/에뮬레이터에서 앱 로드, 연습 화면, 마이크 권한, 녹음 시작,
  내부 뒤로가기, 외부 링크, 네트워크 오류·재시도 확인
