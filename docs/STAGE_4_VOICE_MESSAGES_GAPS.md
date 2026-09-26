# Stage 4 Individual Voice Messages — Gap Register

## Workspace

Path: `C:\Users\HP\PriyaCompanion-NewUX`  
Branch: `stage13c11-groq-live`  
HEAD: `70f82f5a47c1db7a197e6ca9a7d4a068c25e26d6`

## Completed

- Individual voice messages retain the existing Expo SDK 57 recording lifecycle and use the document directory for more durable local recording references.
- Authenticated backend STT now uploads validated audio to Groq Whisper through the server-side API key.
- Authenticated backend TTS now uses Groq Orpheus speech and returns WAV audio.
- Voice transcripts are sent through the existing AI Brain rather than an ad-hoc prompt path.
- Successful voice processing persists a playable assistant voice message with assistant text as accessibility/transcript content.
- User voice messages preserve duration, audio URI, transcript, status, and timestamp.
- Transcript facts enter the existing Stage 1 memory candidate/promotion pipeline.
- Existing relationship signaling remains at the normal message boundary.
- Stable message IDs and bounded retry helpers prevent duplicate assistant messages during STT, AI, and TTS retries.
- Audio format, text length, authentication, malformed response, provider, and empty-audio validation are covered by server contracts.
- Gemini Live call architecture was not replaced.

## Automated validation

- PASS — `npm run typecheck`
- PASS — `npm run test:contracts`
- PASS — `npm run test:voice-message`
- PASS — `npm run test:tts`
- PASS — `npm run lint` (0 errors; one existing `src/screens.tsx` hook-dependency warning)
- PASS — `npx expo export --platform web --non-interactive`
- PASS — `npm run test:stage4`
- PASS — `npm run test:stage8-auth`
- PASS — `npm run test:auth`
- PASS — `npm run test:live`
- PASS — `npm run test:live-handshake`

## Remaining gaps

### ST4-GAP-001

Category: PROVIDER  
Priority: High  
Status: NOT VERIFIED  
Evidence: Groq STT/TTS provider contracts pass with mocked HTTP responses, but no credential-backed production Groq request was executed.  
Why it remains: A safe authenticated runtime session and provider execution environment were not available for evidence collection.  
Dependency: Authorized Supabase session and production Groq runtime.  
Future stage: Runtime verification  
Validation required: Authenticated real STT transcription, text generation, TTS audio response, and safe timing/error evidence.

### ST4-GAP-002

Category: ANDROID  
Priority: High  
Status: NOT VERIFIED  
Evidence: Expo web export and source contracts pass; no Android device/emulator microphone or playback run was performed.  
Why it remains: Native permission, recording, playback, and restart behavior require device evidence.  
Dependency: Android runtime.  
Future stage: Runtime verification  
Validation required: Record, pause, resume, preview, send, assistant playback, restart, and second-message cleanup test.

### ST4-GAP-003

Category: PERSISTENCE  
Priority: Medium  
Status: PARTIAL  
Evidence: Voice metadata and document-directory references are persisted in the existing conversation JSON state.  
Why it remains: OS-level deletion of document files and cross-version audio migration were not physically tested.  
Dependency: Native filesystem runtime.  
Future stage: Runtime hardening  
Validation required: Restart, file deletion, missing-reference playback, and storage cleanup behavior on Android/iOS.

### ST4-GAP-004

Category: VOICE  
Priority: Medium  
Status: DEFERRED  
Evidence: Individual voice messages are implemented; group voice intelligence and group voice pipeline remain outside this stage.  
Why it remains: Scope explicitly limits Stage 4 to individual companion conversations.  
Dependency: Group voice domain and isolation semantics.  
Future stage: Future group voice stage  
Validation required: Separate group voice pipeline with no private companion context leakage.

### ST4-GAP-005

Category: AUDIO  
Priority: Low  
Status: NOT VERIFIED  
Evidence: WAV playback is wired through existing `expo-audio` playback, but platform-specific decoder behavior was not exercised.  
Why it remains: No native device validation was available.  
Dependency: Android/iOS media decoder runtime.  
Future stage: Runtime verification  
Validation required: WAV start, pause/resume, completion, stop, cleanup, and overlapping-player tests.
