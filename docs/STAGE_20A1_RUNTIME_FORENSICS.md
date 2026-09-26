# Stage 20-A1 Runtime Feature Forensics

## Verdict

STAGE 20-A1 VERDICT: PARTIAL

This stage did not uncover a new source-level product defect in the keyboard/layout path beyond the already-resolved Stage 20-A fix. The remaining runtime issues are not consistent with a broken local chat implementation; they are primarily blocked by missing authenticated user session, missing provider credentials, and native-hardware permission requirements that could not be proven in the current environment.

## Scope and method

- Investigated real chat send flow and provider path
- Traced auth/session and backend routing for `/chat`, `/tts`, `/voice/transcribe`
- Checked engine, proactive, and navigation behavior in source
- Verified keyboard/inset handling on the existing Android-capable Expo Go code path
- Re-ran relevant regression and contract tests
- Preserved the protected legacy app and frozen UX reference

## Evidence reviewed

- `src/AppContext.tsx` auth/session and AI request path
- `src/screens.tsx` chat composer, voice flow, bottom tabs, and bottom controls
- `src/ai/providers/backendProvider.ts` backend request behavior
- `src/ai/gateway.ts` provider selection logic
- `server/index.js` backend auth + route execution
- `server/config.js` provider/environment gate
- `app.json` Android keyboard layout config

## Feature matrix

| Feature | Runtime result | Root cause | Classification | Fixed? | Manual required? | Automation status | Future gap ID |
|---|---|---|---|---|---|---|---|
| Normal AI | Blocked | No real authenticated session and no live provider credentials; backend route expects signed-in identity, backend URL/backend config, and provider execution. | C auth/session missing; D backend unavailable; H provider not started; environment blocker | No | No | Contract + source checks only | ST20A1-GAP-001 |
| Voice message | Blocked | Same root cause as normal AI plus native mic/permission + STT/TTS provider blockers. | C auth/session missing; H provider not started; native permission blocker | No | Yes | Manual + environment blocked | ST20A1-GAP-002 |
| Voice call / Live | Blocked | No validated auth/session or Gemini Live credentials; call path relies on provider and native mic/audio state. | C auth/session missing; provider auth blocker; native blocker | No | Yes | Manual + provider blocked | ST20A1-GAP-003 |
| Companion Engine | Present as local state only | UI toggles `engineState` local runtime; no real external provider heartbeat or persisted backend engine. | N / local state design; not a runtime defect | No | No | Automated state checks only | ST20A1-GAP-004 |
| Proactive behaviour | Local UI + logic, no background native delivery | UI state toggles/persistence exist, but no real delivery infrastructure is present. | N / feature not fully implemented; environment/native blocker | No | Yes for real delivery | Source-contract only | ST20A1-GAP-005 |
| Android Back | Pass | Keyboard-open behavior dismisses keyboard first; navigation stack logic is consistent. | PASS | Yes (existing fix) | No | Automated via contract + manual validation | None |
| Keyboard regression | Pass | Keyboard layout config and `KeyboardAvoidingView` are aligned with the real Android behavior. | PASS | Yes (existing fix) | No | Contract test + runtime evidence | None |
| Bottom 4-tab navigation | Pass | Bottom bar now adjusts using the real Android bottom inset rather than hard-coded offsets. | PASS | Yes (existing fix) | No | Contract + source checks | None |
| Bottom Close/Back controls | Pass | Shared bottom inset logic keeps controls above the Android system navigation area. | PASS | Yes (existing fix) | No | Contract + source checks | None |

## Detailed findings

### 1) Normal text AI

Observed issue: no AI response from normal chat.

First failure layer in the current environment:

- `src/AppContext.tsx` requires a signed-in user (`authUserId`) before dispatching requests, and `requestAIResponse` passes the auth user plus request context into the AI gateway.
- `src/ai/providers/backendProvider.ts` returns `AUTHENTICATION` when no access token is available and `UNAVAILABLE` when the backend URL is not configured.
- `server/index.js` requires a bearer token and verifies it via Supabase JWKS before processing `/chat`.
- `server/config.js` shows the key provider/backend inputs are not populated in this environment.

This makes the failure layer a genuine environment + auth + provider-blocked condition rather than a direct implementation bug in the chat composer or message state handling.

### 2) Voice message

The voice message path depends on the same auth/session and provider chain and also on native mic permission and recording support.

The UI is present, but without real session + provider credentials and device permission proof, the runtime cannot be validated as a successful product flow. The code path is structurally correct, but the environment prevents a meaningful success claim.

### 3) Voice call / Gemini Live

The call flow eventually depends on a live provider, auth session, and native microphone/audio support. The observed “Call Ended” state is consistent with a provider/session setup failure or an unvalidated native flow, not evidence of a local chat-layout bug.

### 4) Companion Engine

The engine state is implemented as a local UI/persistence state in `AppContext` and `SettingsSubscreen`. It can be toggled and can appear to “turn off” without requiring an external runtime or provider, which is a state-management behavior rather than a real provider defect.

This is best classified as a local state design issue or configuration behavior, not a genuine chat or authentication bug.

### 5) Proactive behaviour

The proactive panel is implemented as local toggles and schedule state. It does not appear to include a native background-delivery runtime in the current Expo Go path. This is a capability gap, not evidence of a broken composer or message state implementation.

### 6) Android Back / navigation

Keyboard-open back behavior remains correct. The app’s stack-based back handling is consistent with the intended screen flow. No new navigation defect was uncovered in the current stage beyond the already-resolved keyboard dismissal issue.

### 7) Bottom inset / bottom control / safe-area path

The real issue in the earlier fix was the shared Android safe-area/bottom inset logic. The code now derives the bottom inset from the live `screen` height and `window` height, then applies it to the bottom nav and the jump-to-latest button without hard-coded `300px`-style offsets.

This is the correct pattern for Android in Expo Go and respects real system navigation and keyboard-inset behavior more closely than static padding.

## Element-not-found forensics

The phrase “element not found” is not a product failure by itself. The relevant classifications in this stage are:

- SELECTOR_DEFECT: missing or unstable `testID` / `accessibilityLabel`
- SCREEN_STATE_DEFECT: test reached the wrong screen or app state
- TIMING_DEFECT: element exists but the assertion ran too early
- KEYBOARD_INSET_DEFECT: element is physically hidden behind keyboard or system navigation
- NAVIGATION_DEFECT: app did not navigate to expected page
- PROVIDER_AUTH_DEFECT: provider or session required to make the flow meaningful is absent
- ENVIRONMENT_BLOCKER: real device / permission / provider conditions are unavailable
- REAL_PRODUCT_DEFECT: actual implementation bug

For this stage, the most relevant failed cases are not genuine product bugs; they are `PROVIDER_AUTH_DEFECT` and `ENVIRONMENT_BLOCKER` scenarios because the environment lacks legitimate auth/provider data and real hardware permission status could not be proven.

## Automation repairs

No broad automation repair was required for the keyboard/layout path, because the existing deterministic contract already covers the explicit contract that matters:

- Android keyboard resize behavior
- `KeyboardAvoidingView` presence
- stable `chat-message-input` and `chat-send-button` IDs
- interactive keyboard dismiss on scroll
- bottom inset logic pattern

The stable IDs already exist in `src/screens.tsx` and were confirmed by the targeted regression test.

## Manual-only and blocked behaviors

The following are not safely automatable without real device permissions and valid provider/auth data:

- voice message recording and permission gating
- mic/camera/gallery access challenges
- provider-backed live call / Gemini Live audio session
- real Google/Supabase sign-in proof
- live Groq/Gemini provider execution

## Gap ledger

### ST20A1-GAP-001 — Missing authenticated user session and provider credentials for normal AI
- Priority: P1
- Category: Auth / Provider
- Root cause: valid sign-in and provider secrets are absent in the environment
- Evidence: source checks plus config inspection and live backend route expectations
- Affected feature: Normal AI chat

### ST20A1-GAP-002 — Voice message path is blocked by auth/provider/hardware requirements
- Priority: P1
- Category: Native / Provider / Auth
- Root cause: no session + no provider config + no permission proof
- Evidence: voice pipeline calls STT/TTS and AI backend paths
- Affected feature: Voice message flow

### ST20A1-GAP-003 — Gemini Live / voice call path is blocked by provider and native constraints
- Priority: P1
- Category: Provider / Native / Auth
- Root cause: live audio and provider service not validated in the current environment
- Evidence: call service routes through Gemini live provider; no valid credentials were available
- Affected feature: Voice call / Live

### ST20A1-GAP-004 — Engine state is a local runtime toggle, not a provider-backed engine
- Priority: P2
- Category: Product semantics
- Root cause: no external engine process or provider contract is present; state is local-only
- Evidence: `AppContext` toggles engineState and UI reflects it directly
- Affected feature: Companion Engine

### ST20A1-GAP-005 — Proactive behavior remains local-only and not native/background-delivery ready
- Priority: P2
- Category: UX / Native / Product scope
- Root cause: behavior exists in UI and persistence but lacks a real background-delivery runtime
- Evidence: schedule/toggle logic exists without a verified native background path
- Affected feature: Proactive behaviour

## Regression checks performed

- `npm run test:stage17 --silent`
- `npm run test:stage18 --silent`
- `npm run test:stage19 --silent`
- `npm run test:chat-keyboard --silent`
- `npx tsc --noEmit`
- `npx expo lint -- --quiet`

Result: all relevant checks passed.

## Pre-standalone readiness

This stage is not a release-ready pass because the real provider/auth session and device-native permission flows remain unverified. However, the keyboard-layout fix and shared inset logic are valid and verified, and no new local implementation defect was uncovered in the current code path.

The project is in a credible pre-standalone state for source-level and Expo Go validation, but not a true provider-backed end-to-end runtime-ready state without real credentials and device proof.
