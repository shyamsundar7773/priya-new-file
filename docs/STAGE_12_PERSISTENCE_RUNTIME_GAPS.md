# Stage 12 Persistence + Restart + Account Isolation — Gap Register

## Workspace

Path: `C:\Users\HP\PriyaCompanion-NewUX`  
Branch: `stage13c11-groq-live`  
HEAD baseline: `70f82f5a47c1db7a197e6ca9a7d4a068c25e26d6`

## Automated validation

- Companion, memory, relationship, proactive, message, group, voice metadata, call metadata, and preferences round-trip contracts pass.
- Archived, deleted, and superseded memory flags survive hydration.
- Relationship state is rejected when its user identity does not match the hydrating account.
- User storage namespaces differ by encoded user ID.
- Duplicate persisted message IDs collapse during hydration.
- Missing audio references remain valid message metadata and do not corrupt hydration.

## Remaining runtime gaps

### ST12-GAP-001

- Description: True Android process restart and native file durability were not physically verified.
- Evidence: No Android device or emulator is available; validation is limited to serialization/hydration contracts and web export.
- Severity: P1
- Subsystem: Native restart, audio files, persistence
- Dependency: Authorized Android runtime
- Verification status: NOT VERIFIED

### ST12-GAP-002

- Description: Physical two-account sign-out, sign-in, and state switching were not verified.
- Evidence: Account-scoped storage keys and user-checked relationship hydration pass; no two legitimate accounts or native session runtime are available.
- Severity: P1
- Subsystem: Authentication and account isolation
- Dependency: Two authorized test accounts and runtime
- Verification status: NOT VERIFIED

### ST12-GAP-003

- Description: Background notification restart behavior remains unverified.
- Evidence: Proactive state round-trips, but native notification/background execution is outside the available runtime.
- Severity: P2
- Subsystem: Proactive delivery
- Dependency: Expo notification/background runtime and device validation
- Verification status: NOT VERIFIED
