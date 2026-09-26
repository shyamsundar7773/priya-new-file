# Stage 7 Groups + Group Voice — Gap Register

## Implemented

- Groups remain user-scoped through the existing authenticated storage keys.
- Group IDs, names, companion membership, archive state, group memories, proactive configuration, and group conversations hydrate through the existing persistence boundary.
- Group messages are de-duplicated by ID and ordered by timestamp on write and hydration.
- Added canonical bounded `GroupAIContext` with group identity, explicit participants, group-only memories, bounded group history, group proactive signals, current request, and response target.
- Private companion memories, relationship state, and private proactive context are excluded from group provider prompts.
- Explicit companion targeting uses existing mentions or deterministic companion-name matching; generic messages target the first group member under the existing policy.
- Group voice messages use the existing Expo SDK 57 recorder, authenticated Groq STT, shared AI Brain/group context, Groq TTS, persistent audio metadata, retry handling, and existing voice playback.
- Added `GroupLiveContext` as a boundary for future group Live work without faking multi-party realtime behavior.
- Existing Stage 1 memory lifecycle remains the authority for group-scoped memory records.

## Remaining gaps

### ST7-GAP-001

Description: Real multi-party Gemini Live group voice calls are not implemented.  
Severity: High  
Current status: Deferred / NOT VERIFIED  
Evidence: `GroupLiveContext` exists as a clean boundary; the active Gemini Live implementation remains individual-companion only.  
Affected subsystem: Group voice calls / Gemini Live  
Future dependency: Product and provider design for multi-party turn-taking and audio routing.

### ST7-GAP-002

Description: Android group text/voice runtime validation was not performed.  
Severity: High  
Current status: NOT VERIFIED  
Evidence: TypeScript, source/provider contracts, and Expo web export are the available evidence.  
Affected subsystem: Native recording, STT upload, TTS playback, restart persistence  
Future dependency: Authorized Android device or emulator.

### ST7-GAP-003

Description: Credential-backed authenticated group text and voice provider runs were not executed.  
Severity: High  
Current status: NOT VERIFIED  
Evidence: Provider prompt contracts pass; no real group request was run through the authenticated app/backend path.  
Affected subsystem: Groq group text/STT/TTS runtime  
Future dependency: Authorized session and safe runtime evidence collection.

### ST7-GAP-004

Description: Group-level relationship and proactive intelligence remain bounded interfaces only.  
Severity: Medium  
Current status: Partial  
Evidence: Private relationship/proactive context is excluded; explicit group memories and schedules are supported.  
Affected subsystem: Group relationship/proactive behavior  
Future dependency: Product policy for group-level signals.

### ST7-GAP-005

Description: Group membership authorization is enforced in the client context boundary, but there is no remote group service or server-side group membership store in this checkout.  
Severity: Medium  
Current status: Partial  
Evidence: Invalid group/companion combinations are rejected before AI requests; storage is authenticated and user-namespaced.  
Affected subsystem: Group security and authorization  
Future dependency: Server-backed group membership/API if groups become remotely shared.

### ST7-GAP-006

Description: Native file durability and cleanup for group voice audio was not physically exercised.  
Severity: Medium  
Current status: Partial  
Evidence: Recordings use document-directory references and generated TTS uses the existing cache-based provider/player path.  
Affected subsystem: Group voice persistence/playback  
Future dependency: Native restart and missing-file validation.
