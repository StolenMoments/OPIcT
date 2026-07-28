# OPIc Android WebView 래퍼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or **superpowers:executing-plans** to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the production OPIc app with a generated password, then build a signed Android WebView shell for `https://opict.mygreed.shop/` and publish its APK in a GitHub Release.

**Architecture:** Add a small Fastify session/auth layer and a web login gate before copying the existing Drillup Android wrapper structure into a standalone `android/` Gradle project. The Android shell uses a pure WebView permission policy so only the exact OPIc HTTPS origin can receive audio capture permission; all other WebView security and navigation rules remain explicit and tested.

**Tech Stack:** Kotlin, Android Gradle Plugin 9.2.1, Gradle 9.4.1 wrapper, Android SDK 36, JVM 17, AndroidX Activity/Core/SplashScreen/WebKit, JUnit 4, Robolectric.

## Global Constraints

- Use `shop.mygreed.opict` as namespace and application ID.
- Use `https://opict.mygreed.shop/` as the only internal start URL.
- Require production `OPICT_APP_PASSWORD_HASH` and `OPICT_SESSION_SECRET`; never store the raw password in git, Actions secrets, or the production env file.
- Expose only `/api/health`, `/api/auth/login`, and `/api/auth/session` without a session; protect all other `/api` routes with an HttpOnly Secure SameSite=Lax cookie.
- Rate-limit failed login attempts by client IP in memory and return `Retry-After` on lockout.
- Support Android 10/API 29+ and compile/target SDK 36.
- Allow WebView audio capture only for the exact internal origin; never grant video or external-origin capture.
- Keep HTTP, deceptive hosts, unsafe schemes, file/content access, mixed content, third-party cookies, and JavaScript bridges disabled.
- Keep release keystore files, passwords, APK build directories, and `local.properties` out of git.
- Work directly on `master`; use Conventional Commit messages with the OPIc repository rules.
- Keep the authentication change limited to the OPIc auth gate; do not alter existing practice, correction, notes, history, or settings behavior.

---

### Task 1: Production password authentication (TDD)

**Files:**
- Create: `scripts/init-opict-auth.mjs`
- Create: `server/src/auth/password.js`, `server/src/auth/session.js`, `server/src/auth/throttle.js`, `server/src/auth/auth-plugin.js`
- Create: `server/src/routes/auth.js`
- Create: `server/test/auth.test.js`, `server/test/auth-password.test.js`, `server/test/auth-session.test.js`
- Create: `web/src/components/LoginScreen.tsx`, `web/src/components/LoginScreen.test.tsx`
- Modify: `server/src/app.js`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/App.css`, `.env.example`, `scripts/deploy-remote.sh`, `docs/deploy-opict.md`

**Interfaces:**
- `hashPassword(password: string): string` returns a versioned scrypt hash containing salt and cost parameters; `verifyPassword(password, encodedHash): boolean` uses constant-time comparison.
- `createSessionToken(secret: string, now?: number): string` and `verifySessionToken(secret, token, now?: number): boolean` implement an expiring HMAC token.
- `createLoginThrottle()` returns an in-memory IP throttle with `check`, `recordFailure`, `recordSuccess`, and `retryAfterMs` operations.
- `POST /api/auth/login` accepts `{ password }`, sets the `opict_session` cookie on success, and returns 401/429 on failure/lockout.
- `GET /api/auth/session` returns `{ authenticated: boolean }`; `POST /api/auth/logout` clears the cookie. The root UI must show the password screen before rendering any OPIc practice/admin tabs.

- [ ] **Step 1: Write failing auth unit and HTTP contract tests**

Cover password hash non-reversibility/verification, expired and tampered session tokens,
throttle lockout and reset, successful login cookie flags, invalid password 401,
`Retry-After` 429, logout, unauthenticated 401 for a representative protected endpoint,
and authenticated access to that endpoint. Add a web test that renders the password screen
when the session endpoint reports unauthenticated.

- [ ] **Step 2: Run the auth tests to verify failure**

```powershell
cd server
npm test -- --test-name-pattern "auth"
cd ..\web
npm test -- LoginScreen
```

Expected: failures because the auth modules and login gate do not exist.

- [ ] **Step 3: Implement password/session primitives and Fastify auth hook**

Use Node's built-in `crypto.scryptSync` with a random salt and `crypto.timingSafeEqual`.
Use a 30-day `opict_session` cookie signed with `OPICT_SESSION_SECRET`. In production,
`buildApp` must throw a configuration error if either auth variable is missing. Keep test
mode explicitly injectable so existing route tests can exercise business endpoints without
duplicating login setup.

- [ ] **Step 4: Implement auth routes, web login gate, and initialization script**

`scripts/init-opict-auth.mjs` must refuse to overwrite existing auth keys, generate a random
password and session secret, write only the scrypt hash and secret to the specified `.env`
with mode 600 when supported, and print the generated password once for the operator.
The web gate calls `/api/auth/session` before rendering the existing app, renders the
Drillup-style password-only `LoginScreen` while unauthenticated, and reloads the existing
app after login; add logout to the existing settings surface. Do not render practice,
correction, notes, history, or settings tabs behind the login screen.

- [ ] **Step 5: Run focused and existing tests to verify success**

```powershell
cd server
npm test
cd ..\web
npm test
npm run build
```

Expected: all existing behavior remains green and protected API access is covered by a real
Fastify inject flow, not only configuration assertions.

- [ ] **Step 6: Update deployment documentation and commit auth**

Document the one-time remote initialization before `deploy-remote.sh`, keep auth values out
of GitHub Secrets, and make `deploy-remote.sh` validate both auth variables before restart.

```powershell
git add scripts/init-opict-auth.mjs server/src server/test web/src .env.example scripts/deploy-remote.sh docs/deploy-opict.md
git commit -m "feat(auth): protect opict production app"
```

### Task 2: Android project foundation and identity

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`
- Create: `android/app/build.gradle.kts`, `android/app/proguard-rules.pro`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/values/{colors,strings,styles}.xml`
- Create: `android/app/src/main/res/drawable-nodpi/{ic_launcher_foreground,splash_icon}.png`
- Create: `android/app/src/main/res/mipmap-anydpi-v26/{ic_launcher,ic_launcher_round}.xml`
- Create: Android launcher PNGs under `android/app/src/main/res/mipmap-*`
- Copy: `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/*` from the existing Drillup wrapper
- Modify: `.gitignore`

**Interfaces:**
- Produces a Gradle project whose release identity is `shop.mygreed.opict`, `OPIcT`, version `1.0.0`.
- The manifest declares `INTERNET`, `RECORD_AUDIO`, no cleartext traffic, and an exported launcher activity.

- [ ] **Step 1: Write the failing foundation contract**

Run a PowerShell contract before creating files:

```powershell
if (Test-Path -LiteralPath 'android') { throw 'Expected the OPIc Android project to be absent before implementation' }
```

- [ ] **Step 2: Copy the known-good Gradle wrapper and create identity files**

Copy the Drillup Gradle wrapper binaries/scripts, then create the OPIc Gradle files with
`com.android.application` 9.2.1, compile/target 36, min 29, Java 17, and the same AndroidX
dependency versions as Drillup. Set `namespace` and `applicationId` to
`shop.mygreed.opict`; use `Theme.Opict.Starting` and `@string/app_name`.

- [ ] **Step 3: Add OPIc manifest and resources**

Declare `android.permission.INTERNET` and `android.permission.RECORD_AUDIO`, set
`android:usesCleartextTraffic="false"`, and adapt Drillup's launcher/splash resources
without adding new runtime dependencies.

- [ ] **Step 4: Run foundation checks**

Run:

```powershell
Test-Path android\gradlew.bat
Select-String -Path android\app\src\main\AndroidManifest.xml -Pattern 'RECORD_AUDIO|usesCleartextTraffic="false"'
```

Expected: wrapper exists and both manifest contracts are present.

- [ ] **Step 5: Commit foundation**

```powershell
git add android .gitignore
git commit -m "feat(android): scaffold opict webview app"
```

### Task 3: Navigation and microphone permission policies (TDD)

**Files:**
- Create: `android/app/src/main/java/shop/mygreed/opict/NavigationPolicy.kt`
- Create: `android/app/src/main/java/shop/mygreed/opict/WebViewPermissionPolicy.kt`
- Create: `android/app/src/test/java/shop/mygreed/opict/NavigationPolicyTest.kt`
- Create: `android/app/src/test/java/shop/mygreed/opict/WebViewPermissionPolicyTest.kt`

**Interfaces:**
- `NavigationPolicy.classify(uri: Uri): NavigationDestination` returns `INTERNAL`, `EXTERNAL`, or `BLOCKED`.
- `WebViewPermissionPolicy.canGrantAudioCapture(origin: Uri, resources: Array<String>): Boolean` returns true only for exact internal OPIc origin and audio-only resources.

- [ ] **Step 1: Write the failing policy tests**

Cover exact OPIc HTTPS URLs, HTTPS external URLs, `mailto:`/`tel:`, HTTP/deceptive hosts,
dangerous schemes, exact internal audio capture, external-origin audio, video capture, and
mixed audio/video resources.

- [ ] **Step 2: Run the policy tests to verify failure**

```powershell
cd android
.\gradlew.bat test
```

Expected: compilation/test failure because the policy classes do not exist.

- [ ] **Step 3: Implement the two pure policies**

Use Drillup's exact-host navigation logic with `INTERNAL_HOST = "opict.mygreed.shop"`.
Define the WebView audio resource constant as
`android.webkit.resource.AUDIO_CAPTURE`; require all requested resources to equal it and
require `NavigationDestination.INTERNAL`.

- [ ] **Step 4: Run the policy tests to verify success**

```powershell
.\gradlew.bat test
```

Expected: all unit tests pass.

- [ ] **Step 5: Commit policy contracts**

```powershell
git add android/app/src/main/java android/app/src/test
git commit -m "feat(android): enforce opict navigation and audio policy"
```

### Task 4: WebView shell, runtime audio permission, and error UX

**Files:**
- Create: `android/app/src/main/java/shop/mygreed/opict/MainActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values/styles.xml`

**Interfaces:**
- `MainActivity.START_URL` is `https://opict.mygreed.shop/`.
- `MainActivity` owns the WebView lifecycle, navigation, error overlay, runtime audio permission request, and state restoration.

- [ ] **Step 1: Add the failing static Activity contracts**

Run:

```powershell
$source = Get-Content -Raw android\app\src\main\java\shop\mygreed\opict\MainActivity.kt
if ($source -notmatch 'opict\.mygreed\.shop') { throw 'Missing OPIc start URL' }
```

Expected: fail because `MainActivity.kt` is absent.

- [ ] **Step 2: Implement the WebView shell**

Adapt Drillup's `MainActivity` with OPIc strings and URL. Preserve JavaScript/DOM storage,
safe browsing, no file/content access, no mixed content, first-party cookies only,
progress/error/retry UI, state save/restore, renderer cleanup, and back navigation.

- [ ] **Step 3: Implement exact-origin audio permission forwarding**

In `WebChromeClient.onPermissionRequest`, run on the UI thread. Deny requests that fail
`WebViewPermissionPolicy.canGrantAudioCapture`. If `RECORD_AUDIO` is not granted, retain
the request and call `requestPermissions`; in `onRequestPermissionsResult`, grant only the
pending audio request when permission was granted, otherwise deny it. Deny a pending request
when the Activity is destroyed.

- [ ] **Step 4: Run compile and static shell checks**

```powershell
cd android
.\gradlew.bat test lint assembleDebug
```

Expected: unit tests, lint, and debug APK build pass.

- [ ] **Step 5: Commit the shell**

```powershell
git add android/app
git commit -m "feat(android): add opict webview shell"
```

### Task 5: Release signing, documentation, and GitHub Release

**Files:**
- Create: `android/scripts/New-ReleaseKeystore.ps1`
- Create: `android/README.md`
- Modify: `.gitignore`

**Interfaces:**
- The keystore script creates `android/keystore/opict-release.jks` and
  `android/keystore.properties` only when neither exists.
- The README documents debug/release builds, installation, microphone permission, and
  GitHub Release asset verification.

- [ ] **Step 1: Write the failing signing/documentation contracts**

```powershell
if (Test-Path -LiteralPath 'android\scripts\New-ReleaseKeystore.ps1') { throw 'Expected signing script to be absent before implementation' }
```

- [ ] **Step 2: Add non-overwriting signing script and README**

Copy Drillup's safe random-password script, changing filenames, alias, distinguished name,
and documentation to OPIc. Keep passwords out of console output and keep both generated
files ignored.

- [ ] **Step 3: Generate local signing files and build release**

```powershell
cd android
.\scripts\New-ReleaseKeystore.ps1
.\gradlew.bat test lint assembleDebug assembleRelease
```

- [ ] **Step 4: Verify APK signature and inspect repository scope**

```powershell
& "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs .\app\build\outputs\apk\release\app-release.apk
git status --short
```

Expected: signature verification succeeds; keystore, properties, local SDK config, and build
outputs are not tracked.

- [ ] **Step 5: Create the GitHub Release**

After confirming `gh auth status` and the clean scoped diff, run:

```powershell
gh release create opict-android-v1.0.0 `
  .\app\build\outputs\apk\release\app-release.apk `
  --repo StolenMoments/OPIcT `
  --title "OPIcT Android v1.0.0" `
  --notes "Signed Android WebView shell for https://opict.mygreed.shop/."
```

Then verify the release and asset URL with `gh release view opict-android-v1.0.0 --repo StolenMoments/OPIcT`.

- [ ] **Step 6: Commit release support and push master**

```powershell
git add android/README.md android/scripts/New-ReleaseKeystore.ps1 .gitignore
git commit -m "docs(android): document opict release workflow"
git push origin master
```

### Manual acceptance test

- [ ] Install the Release APK on an Android 10+ device or emulator.
- [ ] Confirm the OPIc page loads over HTTPS and the app shows the initial category/question.
- [ ] Enter practice, grant microphone permission, record an answer, and confirm the result.
- [ ] Confirm internal navigation/back behavior, external HTTPS handling, and retry after network loss.
- [ ] Confirm GitHub Release contains the signed `app-release.apk`.
