# Stage 19 Real Provider + Backend Authorization Gaps

## Authorization audit

The backend authenticates the Supabase bearer token and derives the effective user from JWT `sub`. Stage 19 hardened the existing request boundary so client-supplied `userId`, `ownerUserId`, direct user identity, companion ownership metadata, group ownership metadata, attached memory ownership, attachment ownership, and group participant ownership cannot contradict the authenticated identity. Mismatches return a sanitized authorization error.

The current backend does not contain a persisted resource repository or resource-ownership API for companions, memories, relationships, conversations, messages, groups, memberships, attachments, voice metadata, call metadata, proactive state, schedules, delivery history, or Live sessions. Therefore Stage 19 does **not** claim complete server-side ownership verification for arbitrary resource IDs. That remains an explicit open gap rather than being replaced by client-side filtering.

## Ownership matrix

| Resource | Automated boundary evidence | Complete server-side lookup |
|---|---|---|
| Companion | Claimed owner mismatch rejected; authenticated identity bound | NOT AVAILABLE |
| Memory | Attached memory user mismatch rejected | NOT AVAILABLE |
| Relationship | Raw relationship context stripped from provider routing | NOT AVAILABLE |
| Conversation/message | Request identity and context boundary protected | NOT AVAILABLE |
| Group/membership | Claimed group owner mismatch rejected; client membership is not trusted as complete authorization | NOT AVAILABLE |
| Attachment | Claimed attachment user mismatch rejected; provider projection remains scoped | NOT AVAILABLE |
| Voice/call metadata | No standalone backend resource store | NOT AVAILABLE |
| Proactive state/schedules/history | No standalone backend resource store | NOT AVAILABLE |
| Live session | Authenticated user is bound to Live connection and start context user; selected companion ID is required | Resource lookup NOT AVAILABLE |

## Nested-resource tests

Stage 19 tests cover:

- owner context acceptance;
- foreign companion owner rejection;
- foreign attached-user rejection;
- foreign group owner rejection;
- Live start with matching user acceptance;
- Live start with changed/foreign user rejection;
- missing selected companion rejection;
- sanitized authorization errors;
- restricted-origin checks;
- provider timeout/retryability and invalid-request non-retryability.

## Live session hardening

Live upgrade authentication now passes the bearer token to the existing verifier and retains the authenticated user on the WebSocket connection. A Live start must include the authenticated `userId` and a selected companion ID. The client adds the signed-in user ID to the start envelope. This prevents a valid user from starting a session with a different account identity in the context envelope.

The bearer token remains in the WebSocket query string because the browser WebSocket API used by the current Expo/web client does not provide a portable custom Authorization header path. This is documented as a remaining token-transport limitation; no physical Live validation was claimed.

## Provider router security

- Provider secrets remain server-only.
- Client context identity is rebound to the authenticated user.
- Raw relationship context is removed before provider routing.
- Provider errors remain sanitized.
- Existing deterministic Groq-first/Gemini-fallback behavior is preserved.
- Invalid authentication and invalid requests remain non-retryable.
- No side-effecting provider retry executor was added because current text/STT/TTS boundaries are request/response operations and Stage 16 already provides bounded timeout/classification behavior.

## CORS

Wildcard CORS was replaced with an allowlist from `ALLOWED_ORIGINS`, defaulting to local Expo development origins. Responses vary by request origin. Production deployments must set an explicit production origin list. The Live WebSocket upgrade does not use browser CORS headers and remains subject to authenticated upgrade validation.

## Real provider evidence

The server `.env` contains configured provider/auth settings, but no legitimate reusable authenticated Supabase session or authorized test token was available. No fabricated JWT, credential, or bypass was used.

- Real Groq text: **NOT VERIFIED**
- Real Groq STT: **NOT VERIFIED**
- Real Groq TTS: **NOT VERIFIED**
- Real Gemini Live network/audio: **NOT VERIFIED**

Unauthenticated backend access was not used as provider evidence; it only verifies the authentication rejection boundary.

## Existing gaps carried forward

- ST13 semantic/vector retrieval.
- ST13 automatic ordinary contradiction resolution.
- ST14 document/file picker.
- ST14 native media durability/cleanup.
- ST14 provider image understanding/binary upload.
- ST14 group attachment UI placeholder.
- ST14 physical camera/gallery validation.
- ST15 complete server-side resource ownership.
- ST15 server-side Live ownership lookup.
- ST15 physical account switching/native logout/relogin.
- ST15 wildcard CORS as a deployment/configuration concern where production origins are not configured.
- ST16 real authenticated Groq/provider execution.
- ST16 real Groq STT/TTS.
- ST16 physical Gemini Live reconnect/audio continuity.
- ST16 centralized provider-wide retry executor.
- ST17 Android/manual visual validation.
- ST17 group attachment controls placeholder.
- ST17 native picker visual parity.
- ST18 real authenticated provider execution.
- ST18 physical Android restart.
- ST18 complete backend ownership validation.

## Closed gaps

### CLOSED: client identity override at the hardened request boundary

**Evidence:** `server/security.js` now rejects mismatched user/owner metadata and always binds the authenticated identity; `server/stage19-authorization-contract-test.js` passes owner/foreign fixtures.

### CLOSED: Live start account-identity mismatch

**Evidence:** Live connections retain the authenticated JWT identity, Live starts require matching `context.userId`, and the Stage 19 authorization contract rejects foreign-user starts.

These closures do not imply arbitrary resource ownership lookup is complete.

## New Stage 19 gaps

### ST19-GAP-001 — Backend resource repository/ownership lookup is absent

- **Severity:** P1
- **Status:** STILL OPEN
- **Evidence:** No backend persistence or lookup layer exists for the full resource matrix; only request-claim consistency is enforceable today.
- **Dependency:** Server-side resource store/API with owner checks.

### ST19-GAP-002 — Live bearer token remains query-string transported

- **Severity:** P1
- **Status:** PARTIALLY MITIGATED
- **Evidence:** Upgrade authentication is now correctly verified and bound, but browser WebSocket transport still places the token in `access_token`.
- **Dependency:** Short-lived server-issued WebSocket ticket or supported secure header/cookie transport.

### ST19-GAP-003 — Real authenticated provider execution unavailable

- **Severity:** P1
- **Status:** NOT VERIFIED
- **Evidence:** Configured server environment exists, but no legitimate authenticated Supabase session/token was available for an end-to-end request.
- **Dependency:** Authorized test account/session and provider execution environment.

## Commands and results

- `npm run test:stage19` — PASS
- `npm run test:stage15` — PASS
- `npm run test:live` — PASS
- `npm run test:stage5` — PASS
- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `node --check server/liveProxy.js` — PASS
- `node --check server/index.js` — PASS
- `node --check server/security.js` — PASS
- Full Stage 1–18 regression suite — rerun after final changes
- `git diff --check` — required final validation

