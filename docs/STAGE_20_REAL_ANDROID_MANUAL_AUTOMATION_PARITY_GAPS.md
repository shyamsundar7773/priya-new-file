# Stage 20 Real Android Manual + Automation Parity Gaps

## Current status

This Stage 20 run has real Android evidence. A Motorola Edge 60 Fusion is connected over wireless ADB, the debug app is installed, and the real app UI is rendering on the device after the Metro localhost route was corrected with `adb reverse tcp:8081 tcp:8081` and a fresh app relaunch. The app is not yet proven across the full manual checklist, so the Stage 20 verdict remains PARTIAL rather than PASS.

## Device validation

| Item | Result |
|---|---|
| ADB daemon | PASS — running and reachable |
| Wireless Android device discovery | PASS — `adb-ZN4225JKLV-1F3wLP._adb-tls-connect._tcp` discovered |
| ADB authorization | PASS — device accepted direct ADB commands |
| Android device | PASS — Motorola `motorola edge 60 fusion`, Android 16, API 36, 1220x2712, density 450 |
| Android app package | PASS — package `com.shyamsundar7773.PriyaCompanionNewUX` installed |
| App installation | PASS — Expo debug APK built and installed via `npx expo run:android` |
| App launch | PASS — activity started successfully |
| Metro connectivity | PASS — host Metro runs on `localhost:8081` and `adb reverse` makes it reachable via the device |
| App bundle URL | PASS — the device app successfully loads the JS bundle path after the host fix |
| Android logcat startup | PASS — logs show `Running "main"` from React Native after startup |
| Visual render | PASS — real device screenshot shows the Chats UI loaded with companion rows and navigation |
| Microphone/camera/notifications | NOT VERIFIED in this pass |
| Full auth flow | BLOCKED / NOT VERIFIED — no fresh live login session was exercised |

## Deployment evidence

- Expo app config: [app.json](../app.json) defines the app package and scheme.
- Native Android project: [android/app/src/main/AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml) confirms the installed package and launch activity.
- Metro is running on the LAN host and serving the bundle at `http://192.168.1.149:8081`.
- Real device launch succeeded after installing the debug APK produced by the Android project.
- The app loaded a real chat list screen; the screenshot confirms the UI rendered without a red screen or stale bundle issue.

## Real Android launch evidence

- `curl.exe http://192.168.1.149:8081/status` → `packager-status:running`
- Android logs show: `ReactHost{0}.isMetroRunning(): Async result = true` then `ReactHost{0}.loadJSBundleFromMetro()`
- `curl.exe -I http://192.168.1.149:8081/index.bundle?platform=android&dev=true&minify=false` → `HTTP/1.1 200 OK`
- Device screenshot captured from the running app shows the rendered Chats UI with real messages and avatars.

## Manual track

| Scenario | Result | Notes |
|---|---|---|
| Cold launch | PASS | App launched and rendered on real device |
| Reload | NOT VERIFIED | No dev-menu reload was required because the app already loaded successfully |
| Background/foreground | NOT VERIFIED | Not yet exercised |
| Authentication (legitimate flow) | BLOCKED | Device was already in an active app session; no fake JWT or bypass used |
| Logout/relogin | NOT VERIFIED | Requires a real user session or valid credentials |
| Companions list/profile/avatar | NOT VERIFIED | Not yet exercised |
| Chat send/reply/attachments | NOT VERIFIED | Not yet exercised |
| Voice/audio features | NOT VERIFIED | Requires real microphone and provider validation |
| Voice call / Gemini Live | NOT VERIFIED | Requires active provider/auth and device audio testing |
| Groups | NOT VERIFIED | Not yet exercised |
| Memory/relationship/proactive | NOT VERIFIED | Not yet exercised |
| Settings/theme/provider | NOT VERIFIED | Not yet exercised |
| Frozen UX parity | PARTIAL | Initial launch UI matches the implemented app; full parity still pending |

## Automation track

| Area | Result |
|---|---|
| Metro host validation | PASS |
| APK install on real device | PASS |
| App launch on real device | PASS |
| Device-specific automation | NOT YET RUN |
| Maestro parity suite | NOT YET RUN |
| Android manual flow audit | PARTIAL |

## Existing gaps carried forward

- ST20 real-device full auth/session proof remains pending.
- Full Stage 20 flow-by-flow feature audit remains pending beyond initial launch validation.
- Provider tests requiring real Google/Supabase auth and live backend credentials remain unverified.
- Physical audio/video/media behaviors remain unverified without active real-device use.

## Closed gaps

### ST20-CLOSED-001 — Metro/App launch path was validated

- Severity: P0
- Status: Closed
- Evidence: LAN Metro host is reachable at `192.168.1.149:8081`, the app installed successfully, and the UI rendered on the real device.

## New Stage 20 gaps

### ST20-GAP-001 — Real authentication flow not yet proven on-device

- Severity: P1
- Status: BLOCKED / NOT VERIFIED
- Behavior: No proof that the app currently holds a legitimate authenticated session or that a fresh Google/Supabase login succeeded on this device.
- Expected behavior: The app opens on a real logged-in session or completes a legitimate sign-in flow without bypassing auth.
- Actual behavior: The app launched directly into a persisted chats UI in an already-active session state; no fake JWTs or bypass were used.
- Evidence: device screenshot showing the Chats list.
- Manual vs automated: manual only
- Reproducibility: depends on whether the existing session remains active on the device
- Dependency: valid user credentials and a real login session
- Later stabilization: yes

### ST20-GAP-002 — Full Stage 20 feature audit remains incomplete

- Severity: P1
- Status: NOT VERIFIED
- Behavior: Only the runtime launch and Metro bundle path were confirmed.
- Expected behavior: Complete real-device audit covering auth, chat, companions, voice, groups, memory, relationships, proactive behavior, and settings.
- Actual behavior: Initial app launch succeeded; remaining scenarios are not yet exercised.
- Evidence: screenshot and Metro logs, plus the absence of completed manual feature checks.
- Manual vs automated: manual
- Reproducibility: pending full device session and provider validation
- Dependency: valid active session, provider credentials, and time for manual workflow validation
- Later stabilization: yes

### ST20-GAP-003 — Audio/media and provider-dependent flows remain unverified

- Severity: P1
- Status: NOT VERIFIED
- Behavior: Voice, camera, gallery, and provider-backed features were not validated on the real device.
- Expected behavior: Device permissions and provider flows function without errors.
- Actual behavior: not yet exercised.
- Evidence: no successful device-side audio or media validation was completed in this pass.
- Manual vs automated: manual-only
- Reproducibility: depends on real device permission and provider setup
- Dependency: real microphone/camera permissions and active provider credentials
- Later stabilization: yes

## Exact commands/results

- `curl.exe http://192.168.1.149:8081/status` → `packager-status:running`
- `adb -s 192.168.1.208:39411 install -r .../app-debug.apk` → `Success`
- `adb -s 192.168.1.208:39411 shell am start -n com.shyamsundar7773.PriyaCompanionNewUX/.MainActivity` → app started
- `adb -s 192.168.1.208:39411 logcat -d` → contains `ReactHost{0}.loadJSBundleFromMetro()`
- `curl.exe -I http://192.168.1.149:8081/index.bundle?...` → `HTTP/1.1 200 OK`
- Device screenshot captured from the running UI → render confirmed

## Final assessment for this pass

This pass established the real runtime path required for Stage 20: the app is installed, launches, and loads from Metro on the correct LAN host. Because no fresh user login was executed and the full feature matrix remains untested, the Stage 20 verdict remains PARTIAL rather than PASS.

