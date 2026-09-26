# Stage 16 AI Provider Reliability Gaps

## ST16-GAP-001

- **Description:** Real authenticated Groq text, STT, and TTS execution remains unverified.
- **Severity:** P1
- **Status:** NOT VERIFIABLE
- **Evidence:** Provider contracts, timeout/classification contracts, and authenticated route boundaries pass; no legitimate reusable authenticated session was available for real execution.
- **Subsystem:** Groq text/STT/TTS
- **Dependency:** Legitimate authenticated session and live provider execution.

## ST16-GAP-002

- **Description:** Gemini fallback is contract-tested but not verified against a live failure of the configured Groq provider.
- **Severity:** P1
- **Status:** PARTIALLY VERIFIED
- **Evidence:** Deterministic routing and failure classification are covered; no real provider failure injection was performed.
- **Subsystem:** Provider routing / fallback
- **Dependency:** Controlled authenticated provider test environment.

## ST16-GAP-003

- **Description:** Live reconnect behavior remains limited; setup timeout and cleanup are covered, but physical reconnect/audio continuity is not verified.
- **Severity:** P1
- **Status:** PARTIALLY VERIFIED
- **Evidence:** Existing Live contracts plus bounded server setup timeout remain passing; no Android runtime is available.
- **Subsystem:** Gemini Live
- **Dependency:** Native runtime and real Live session.

## ST16-GAP-004

- **Description:** Provider calls do not yet expose a uniform retry executor with retry-count timing metadata; normal routing remains bounded by configured model/provider attempts.
- **Severity:** P2
- **Status:** STILL OPEN
- **Evidence:** Failure classification and retry eligibility helpers exist, but retry execution is still distributed across existing boundaries.
- **Subsystem:** Reliability observability
- **Dependency:** A provider-wide retry policy approved for text, STT, and TTS.

## Carried-forward gaps

Android/native runtime validation, physical two-account switching, background notifications, semantic/vector retrieval, contradiction resolution, native media durability, multimodal provider execution, server-backed resource authorization, Live ownership validation, and wildcard CORS remain open.

