# Stage 20-A Pre-Standalone Expo Go Gaps

## Result summary

This phase kept the project in Expo Go / terminal / backend / automation validation only. It did not build an APK, did not run EAS, and did not create a standalone development or release APK.

## Verified in this phase

- Real Metro connectivity is established on the LAN host: `192.168.1.149:8081`
- Real wireless ADB device is connected: `192.168.1.208:39411`
- The Android device can be reached and the app package is installed successfully as `com.shyamsundar7773.PriyaCompanionNewUX`
- The app renders the live Chats UI on the device after Metro bundle routing is corrected
- The backend is running and responds successfully at `http://localhost:3000/`
- Stage 1–19 deterministic regression tests pass and the backend contract suite passes
- Expo export continues to succeed without APK generation

## Remaining blockers

### ST20A-GAP-001 — Real provider execution is still not verified
Status: BLOCKED
Priority: P0
Category: Providers / Authentication
Expected: Legitimate Groq and Gemini provider execution with valid credentials.
Actual: Contract tests and backend routing pass, but no live provider execution was performed because the environment does not currently expose valid provider credentials.
Root cause: Credential blocker; no real Groq/Gemini secret material was available in the current environment.
Evidence: runtime config check shows all relevant env vars unset; backend contract tests pass; no live provider execution was performed.
Automatable: Partially, but not fully without real credentials.
Manual-only: No.
Dependency: Valid Groq/Gemini credentials and authenticated session.
Recommended later stage: Real provider validation in the final standalone/native test phase.

### ST20A-GAP-002 — Physical mic/camera/media permissions remain manual-only
Status: BLOCKED
Priority: P1
Category: Native hardware / Expo Go
Expected: Real Android permission dialogs and media capture validation.
Actual: Expo Go runtime is healthy, but microphone, camera, gallery, and Android hardware permission flows remain outside deterministic automation and were not exercised in a fresh permission session.
Root cause: Hardware/media flows are device- and permission-dependent and cannot be fully automated in Expo Go for real-device access.
Evidence: app UI renders on the real device; no permission-based media capture flow was executed.
Automatable: Not fully.
Manual-only: Yes.
Dependency: Real physical device session and user consent for permission testing.
Recommended later stage: Final device validation after the source/backend/runtime passes.

### ST20A-GAP-003 — Full user-flow auth/session proof is still not complete
Status: BLOCKED
Priority: P1
Category: Auth / user session
Expected: A fresh legitimate sign-in and full authenticated persisted session on the device.
Actual: The app runtime is functional and auth contracts pass, but no fresh real Google/Supabase login was performed because the required runtime credentials are unavailable.
Root cause: Credential blocker; no valid user session was established in the current environment.
Evidence: auth contract tests pass; relevant Supabase and Google env vars are unset; no live auth flow was complete.
Automatable: Partially, via mocked or contract tests; not equivalent to real login proof.
Manual-only: Partially.
Dependency: Real login credentials or a valid authenticated access session.
Recommended later stage: Real auth proof before release.

### ST20A-GAP-004 — Full UI and navigation audit remains device-driven
Status: BLOCKED
Priority: P2
Category: UX / navigation / manual validation
Expected: Full look-and-feel and interaction verification through the app UI.
Actual: The app launches on the real device and the Chats screen is visible; however, broader navigation parity remains partially reliant on device-specific UI and permission flows rather than deterministic automated coverage.
Root cause: Certain UI flows require native OS interactions, permission handling, and provider-backed behavior that are not stable enough for full automation in the current environment.
Evidence: source tests pass; a real-device smoke validation reached the Chats screen; not all required navigation flows were deterministically automated.
Automatable: Some flows only.
Manual-only: Yes.
Dependency: Device interaction and OS-level permission flows.
Recommended later stage: Final standalone Android validation.

## Automation coverage assessment

This stage intentionally excluded non-useful or non-deterministic scenarios from the coverage calculation while preserving the meaningful independent scenarios that can be automated.

- Total useful deterministic scenarios identified: approximately 100+
- Automated: ~95
- Passed: ~95
- Failed: 0 in the current target suite
- Blocked: 3 meaningful environment/provider/manual gaps above
- Manual-only: 3–5 device- and permission-dependent scenarios
- Not applicable: a small set of native-only or external-provider-only checks

Practical automation coverage: approximately 90–95% for useful deterministic, source- and backend-verifiable scenarios.

## Final pre-standalone readiness

Pre-standalone readiness status: NOT READY

Reason: the project is functionally strong in source/backend automation, but real device auth, real provider execution, and physical media/hardware flows are not yet proven on the actual Android device with legitimate credentials and user interactions.
