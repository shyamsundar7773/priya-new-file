# Stage 17 Frozen UX + Interaction Regression Gaps

## ST17-GAP-001

- **Description:** Android/manual visual validation is unavailable, so pixel-level spacing, safe-area, keyboard, modal, camera, voice, and call parity cannot be physically confirmed.
- **Severity:** P1
- **Status:** NOT VERIFIABLE
- **Evidence:** Frozen reference inventory and source contracts were inspected; no authorized Android device or emulator is available.
- **Subsystem:** Native UX/runtime
- **Dependency:** Real Android runtime or authorized device.

## ST17-GAP-002

- **Description:** Group attachment controls remain a placeholder rather than a complete picker/preview/send flow.
- **Severity:** P2
- **Status:** STILL OPEN
- **Evidence:** Group composer exposes attachment and camera controls but does not launch the Stage 14 attachment adapter.
- **Subsystem:** Group chat UX
- **Dependency:** Stage 14 group attachment implementation.

## ST17-GAP-003

- **Description:** Profile avatar viewer change-image flow is source-wired but native photo-picker visual parity is not verified.
- **Severity:** P2
- **Status:** PARTIALLY VERIFIED
- **Evidence:** Profile avatar opens a viewer and routes Change Image to the existing studio/image boundary; physical picker behavior remains unavailable.
- **Subsystem:** Companion profile/avatar
- **Dependency:** Native image-picker runtime.

## Carried-forward gaps

Stage 13 semantic retrieval and contradiction handling, Stage 14 document picker/native media durability/provider image understanding, Stage 15 server-backed ownership/CORS/account switching, and Stage 16 real provider/native reliability gaps remain open.

