# Stage 3 Proactive Intelligence — Gap Register

## Workspace

Path: `C:\Users\HP\PriyaCompanion-NewUX`  
Branch: `stage13c11-groq-live`  
HEAD: `70f82f5a47c1db7a197e6ca9a7d4a068c25e26d6`

## Completed

- Deterministic proactive candidate generation with provenance, stable user/companion IDs, fingerprints, and source memory/event references.
- Frequency enforcement, quiet-hour suppression, cooldown, duplicate evaluation protection, and bounded history.
- Smart check-in and memory-aware candidate messages using Stage 1 memories and Stage 2 relationship stage.
- Persistent scheduled moment create/cancel/execute state through the existing companion storage namespace.
- In-app chat delivery with persisted proactive message provenance and delivery history.
- Failure isolation: proactive evaluation and relationship updates remain non-critical to ordinary chat persistence.
- User and companion isolation through authenticated storage keys and scoped event/candidate fields.
- Existing Proactive screen connected to real scheduled state and cancellation.

## Automated validation

- PASS — `npm run typecheck`
- PASS — `npm run test:contracts`
- PASS — `npm run lint` (0 errors; one existing `src/screens.tsx` hook-dependency warning)
- PASS — `npx expo export --platform web --non-interactive`
- PASS — `npm run test:stage4`
- PASS — `npm run test:stage8-auth`
- PASS — `npm run test:auth`
- PASS — `npm run test:tts`
- PASS — `npm run test:live`
- PASS — `npm run test:live-handshake`

## Remaining gaps

### ST3-GAP-001

Category: NOTIFICATION  
Priority: High  
Status: NOT VERIFIED  
Evidence: The delivery boundary and notification-setting policy exist, but `expo-notifications` is not part of the current dependency surface and no native notification was scheduled or received.  
Why it remains: Native local-notification delivery requires a compatible Expo module and device/runtime validation.  
Dependency: Expo notification module and native permission/runtime setup.  
Future stage: Stage 3 runtime follow-up  
Validation required: Schedule, cancel, permission-denied, quiet-hours, and deep-link notification tests on Android/iOS.

### ST3-GAP-002

Category: BACKGROUND  
Priority: High  
Status: NOT VERIFIED  
Evidence: Evaluation is available through the existing app/evaluation boundary; continuous background execution was not implemented or claimed.  
Why it remains: Reliable background execution requires Expo background-task/notification-trigger support and native validation.  
Dependency: Native background execution architecture.  
Future stage: Stage 3 runtime follow-up  
Validation required: App-closed scheduled delivery and restart-safe duplicate prevention on device.

### ST3-GAP-003

Category: GROUP  
Priority: Medium  
Status: DEFERRED  
Evidence: Proactive state is companion-scoped and no group proactive context is generated.  
Why it remains: Full group proactive intelligence is outside this stage and private state must not leak.  
Dependency: Group proactive semantics and group-scoped signals.  
Future stage: Stage 4+  
Validation required: Explicit group candidate model and cross-group isolation tests.

### ST3-GAP-004

Category: PROVIDER  
Priority: Medium  
Status: NOT VERIFIED  
Evidence: In-app proactive delivery uses deterministic text and no production provider call is made by the policy engine.  
Why it remains: Real provider behavior and generated proactive copy were not validated with production credentials.  
Dependency: Authorized provider runtime.  
Future stage: Provider validation  
Validation required: Provider-neutral proactive generation through the existing AI gateway without leaking private state.

### ST3-GAP-005

Category: ANDROID  
Priority: Medium  
Status: NOT VERIFIED  
Evidence: No Android emulator or physical device was used.  
Why it remains: Native notification permission, app restart, and background behavior require device evidence.  
Dependency: Android runtime.  
Future stage: Runtime verification  
Validation required: Proactive screen, quiet hours, scheduled moments, restart, and duplicate delivery tests.
