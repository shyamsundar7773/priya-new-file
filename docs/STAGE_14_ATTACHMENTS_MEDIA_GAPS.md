# Stage 14 Attachments + Media Gaps

## ST14-GAP-001

- **Description:** Document/file picker flow is not implemented because the current dependency set only provides image selection and camera capture.
- **Severity:** P1
- **Status:** STILL OPEN
- **Evidence:** The composer rejects the document action explicitly; image and camera assets use the `Attachment` boundary.
- **Subsystem:** Attachment selection / composer
- **Dependency:** A supported Expo document-picker dependency and product-approved file MIME policy.

## ST14-GAP-002

- **Description:** Physical camera and gallery execution are not verified on Android or iOS.
- **Severity:** P1
- **Status:** NOT VERIFIABLE
- **Evidence:** Source-level permission, cancellation, and result handling are implemented through `expo-image-picker`; no physical device or emulator is available.
- **Subsystem:** Camera / image picker
- **Dependency:** A real native runtime with camera and media-library access.

## ST14-GAP-003

- **Description:** Native file durability and physical cleanup of local attachment files are not verified.
- **Severity:** P1
- **Status:** NOT VERIFIABLE
- **Evidence:** Messages persist bounded metadata and missing references hydrate as `missing`; no destructive cleanup is performed, and reference-safe cleanup is exposed only as a contract helper.
- **Subsystem:** Media lifecycle / filesystem
- **Dependency:** Native runtime and an explicit storage-retention policy.

## ST14-GAP-004

- **Description:** Provider image understanding and binary upload are not implemented; provider context contains bounded metadata only.
- **Severity:** P1
- **Status:** STILL OPEN
- **Evidence:** `CompanionAIContext` excludes local URIs and raw file bytes. The server prompt states that media contents are not provided.
- **Subsystem:** AI attachment context / provider adapters
- **Dependency:** Provider-specific authenticated multimodal upload contracts.

## ST14-GAP-005

- **Description:** Group attachment selection UI remains a placeholder even though group attachment metadata and privacy boundaries are contract-tested.
- **Severity:** P2
- **Status:** PARTIALLY VERIFIED
- **Evidence:** Group messages can carry group-scoped attachment metadata in contracts; the existing group composer does not yet launch the image/camera adapter.
- **Subsystem:** Group composer
- **Dependency:** Product-approved group attachment UX and native runtime validation.

## Carried-forward gaps

Real authenticated Groq execution, Android runtime validation, Gemini Live physical continuity, physical account switching, background notification persistence, semantic/vector retrieval, and automatic contradiction resolution remain open from earlier stages.

