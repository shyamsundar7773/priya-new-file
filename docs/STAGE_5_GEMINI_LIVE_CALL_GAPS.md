# Stage 5 Gemini Live Individual Voice Calls — Gap Register

## Workspace

Path: `C:\Users\HP\PriyaCompanion-NewUX`  
Branch: `stage13c11-groq-live`  
HEAD baseline: `70f82f5a47c1db7a197e6ca9a7d4a068c25e26d6`

## Implemented

- Individual calls use the existing authenticated backend WebSocket proxy and server-side Gemini Live API key.
- Gemini Live setup requests audio responses and bounded input/output transcription.
- Expo SDK 57 `useAudioStream` captures int16 PCM and the client resamples frames to mono 16 kHz before transmission.
- Microphone capture starts only after `setupComplete`/connected state and stops during every call cleanup path.
- Live response PCM chunks are queued as WAV files and stale queued audio is invalidated on interruption/end.
- Connection, provider connection, and setup timeouts produce terminal failure states.
- Mute prevents microphone frames from being transmitted while retaining the Live session; unmute resumes transmission.
- Speaker routing uses the existing `setAudioModeAsync` call-service boundary.
- Call events persist stable IDs, timestamps, duration, outcome, failure reason, provider, user namespace, and companion ID.
- Duplicate call-event insertion is prevented by the existing message ID boundary.
- Gemini Live remains separate from the Groq individual voice-message pipeline.

## Automated validation

- PASS — `npm run typecheck`
- PASS — `npm run lint`
- PASS — `npm run test:contracts`
- PASS — `npm run test:stage5`
- PASS — `npm run test:live`
- PASS — `npm run test:live-handshake`

## Remaining gaps

### ST5-GAP-001

Category: ANDROID  
Priority: High  
Status: NOT VERIFIED  
Evidence: No authorized `motorola_edge_60_fusion` or other Android device/emulator run was available.  
Why it remains: Native microphone permission, PCM capture, speaker routing, playback, Android Back cleanup, and restart behavior require device evidence.  
Dependency: Authorized Android runtime.  
Future stage: Runtime verification  
Validation required: Complete two-turn call, mute/unmute, speaker/earpiece, end, Back, restart, second call, and persisted-event checks.

### ST5-GAP-002

Category: MULTI-TURN  
Priority: High  
Status: NOT VERIFIED  
Evidence: Existing provider handshake proves setup and a response; automated contracts verify the protocol shape, not two physical conversational turns.  
Why it remains: A real authenticated client session and audio interaction were not run.  
Dependency: Android or authorized native runtime plus Gemini Live credentials.  
Future stage: Runtime verification  
Validation required: User turn 1, assistant turn 1, user turn 2, assistant turn 2 with ordered audio evidence.

### ST5-GAP-003

Category: INTERRUPTION  
Priority: Medium  
Status: PARTIAL  
Evidence: Mute/interruption clears queued output and sends the existing `audioStreamEnd` boundary.  
Why it remains: True barge-in while the model is speaking was not physically validated.  
Dependency: Native runtime and real multi-turn session.  
Future stage: Runtime hardening  
Validation required: Speak over model output, verify stale audio stops, then verify the next user turn is accepted.

### ST5-GAP-004

Category: NETWORK  
Priority: Medium  
Status: NOT VERIFIED  
Evidence: Client, provider, and setup timeouts are bounded; no network interruption/recovery run was available.  
Why it remains: Reconnection policy is intentionally not invented for this stage.  
Dependency: Product decision and network test runtime.  
Future stage: Runtime hardening  
Validation required: WebSocket interruption, safe terminal state, no stale Connected state, and explicit retry behavior.

### ST5-GAP-005

Category: PERSISTENCE  
Priority: Low  
Status: PARTIAL  
Evidence: Call metadata is persisted in the authenticated conversation namespace and duplicate IDs are filtered.  
Why it remains: Physical app restart and cross-account/device storage recovery were not exercised.  
Dependency: Android/iOS runtime.  
Future stage: Runtime verification  
Validation required: End call, return to chat, restart app, verify one event, switch account, verify isolation.
