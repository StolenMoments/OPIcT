# Task 12: PWA 매니페스트·서비스워커 + 최종 검증

**Files:**
- Create: `web/public/manifest.webmanifest`, `web/public/sw.js`, `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`
- Modify: `web/index.html`, `web/src/main.tsx`, `web/DESIGN.md`

**Interfaces:**
- Consumes: 전체 앱(01~11)
- Produces: 설치 가능한 PWA. 서비스워커는 **정적 자산만** 캐시(stale-while-revalidate), `/api`는 절대 캐시하지 않음(spec §8).

- [x] **Step 1: 매니페스트** — `web/public/manifest.webmanifest`

```json
{
  "name": "OPIcT — OPIc Personal Trainer",
  "short_name": "OPIcT",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#221d19",
  "theme_color": "#e2883f",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

아이콘: `web/DESIGN.md`에 먼저 기록한 기존 favicon의 다크 뉴트럴 `#221d19`, 앰버 `#e2883f`, 밝은 잉크 `#fff8e7` 조합으로 192×192·512×512 PNG를 생성했다. ImageMagick이 없는 환경에서도 외부 의존성 없이 동일한 단색·원형 표식을 재현했다.

- [x] **Step 2: 서비스워커** — `web/public/sw.js`

```js
const CACHE = 'opict-static-v1';

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API·비 GET은 네트워크 직행 — 절대 캐시하지 않음
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api')) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fetching = fetch(e.request).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached ?? fetching;
    }),
  );
});
```

- [x] **Step 3: 등록** — `web/index.html` `<head>`에:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#e2883f" />
```

`web/src/main.tsx` 하단에 (dev에서는 미등록 — vite dev 서버와 충돌 방지):

```ts
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

- [x] **Step 4: 전체 검증 (최종에만 무거운 검증 — AGENTS.md)**

```bash
cd server && npm test        # 전부 PASS
cd web && npm test && npm run build
```

작업 12의 웹 검증은 `cd web && npm test` 3/3 통과, `cd web && npm run build` 성공이다. manifest 필드·PNG 시그니처/크기·서비스워커의 API/비 GET 우회·production 등록도 정적 계약으로 검증했다. 서버 전체 테스트는 최종 whole-branch 검증에서 다시 실행한다.

- [x] **Step 5: 커밋**

```bash
git add web/
git commit -m "feat(stage-12): add pwa manifest and static-asset service worker"
```

PWA 자산과 디자인 결정은 위 제목의 단계 커밋으로 함께 기록한다.

## 사용자 수동 검증 (최종 시나리오)

1. `cd web && npm run build` 후 서버만 기동 → http://localhost:3000 접속.
2. Chrome 주소창의 설치 아이콘으로 PWA 설치 → 독립 창 실행.
3. 통합 시나리오: 설정에서 카테고리·문항 등록 → 연습에서 녹음·평가 → 교정에서 문장 교정·노트 저장 → 노트 확인 → 기록에서 다시 듣기·재시도.
4. DevTools > Application: 서비스워커 활성, `/api` 요청이 캐시되지 않음(Network 탭) 확인.
5. (배포 시) OCI에서 Caddy로 TLS 구성 후 폰 브라우저에서 설치·마이크 권한 확인 — 프로토타입 범위에서는 문서 확인만.

자동 검증은 실제 브라우저 설치·DevTools·모바일 TLS·마이크 권한을 포함하지 않는다.
