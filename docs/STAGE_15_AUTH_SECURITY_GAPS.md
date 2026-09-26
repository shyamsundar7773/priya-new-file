# Stage 15 Authentication + Security Gaps

## ST15-GAP-001

- **Description:** Server-side resource authorization for client-supplied companion, memory, group, and attachment records is not implemented; the backend authenticates the user but does not load those resources from a server-owned datastore.
- **Severity:** P1
- **Status:** STILL OPEN
- **Evidence:** Authenticated identity is now bound into `attachedContext.user.id`, but provider request data remains client-supplied.
- **Subsystem:** Backend authorization / resource ownership
- **Dependency:** Server-backed persistence and authorization rules for user, companion, group, and media resources.

## ST15-GAP-002

- **Description:** Physical account switching and logout/re-login behavior are not verified on Android or a native runtime.
- **Severity:** P1
- **Status:** NOT VERIFIABLE
- **Evidence:** Source contracts cover user-scoped namespaces and state reset; no physical device, emulator, or legitimate second account session is available.
- **Subsystem:** Session lifecycle / account switching
- **Dependency:** Native runtime and legitimate test accounts.

## ST15-GAP-003

- **Description:** Live WebSocket authorization authenticates the token but does not server-validate ownership of the client-supplied Live companion context.
- **Severity:** P1
- **Status:** STILL OPEN
- **Evidence:** `/live` validates the bearer token during upgrade and validates context shape, but does not resolve companion/group ownership server-side.
- **Subsystem:** Gemini Live authorization
- **Dependency:** Server-backed companion and group authorization.

## ST15-GAP-004

- **Description:** Browser CORS remains permissive with `Access-Control-Allow-Origin: *`.
- **Severity:** P2
- **Status:** STILL OPEN
- **Evidence:** HTTP responses use wildcard CORS while accepting Authorization headers.
- **Subsystem:** HTTP transport security
- **Dependency:** Deployment-specific trusted-origin configuration.

## Carried-forward gaps

Real authenticated Groq execution, Android/native runtime validation, physical Gemini Live continuity, background notification persistence, semantic/vector retrieval, automatic contradiction resolution, native media durability, multimodal provider execution, and Stage 14 document-picker/camera/cleanup/group-attachment gaps remain open.

