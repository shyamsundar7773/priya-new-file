# Stage 6 Character Attachment — Gap Register

## Workspace

Path: `C:\Users\HP\PriyaCompanion-NewUX`  
Branch: `stage13c11-groq-live`  
HEAD baseline: `70f82f5a47c1db7a197e6ca9a7d4a068c25e26d6`

## Implemented

- Added one provider-neutral `CompanionAIContext` boundary for companion identity, personality controls, language behavior, bounded memories, relationship summary, short-term conversation, proactive signals, mode, and group boundary.
- Replaced static memory top-N selection with deterministic relevance scoring based on current user-message tokens, importance, confidence, recency, scope, companion ownership, and archive status.
- Bounded short-term context to recent non-empty messages and a character ceiling.
- Injected relationship stage and compact metrics without exposing raw relationship events.
- Added relevant scheduled-moment context without creating a second proactive engine or sending proactive messages.
- Passed the attached context through the existing AI Brain for normal text and Stage 4 voice-message responses.
- Wired the same bounded companion, memory, relationship, and proactive concepts into Gemini Live setup context.
- Updated the backend Groq/Gemini provider router to consume attached context instead of discarding it.
- Preserved private companion/group isolation in the context builder.
- Added stable provider/source contracts for relevance, identity, personality, language, relationship, short-term bounds, archived-memory filtering, group isolation, and provider prompt assembly.

## Remaining gaps

### ST6-GAP-001

Category: RETRIEVAL  
Priority: Medium  
Status: PARTIAL  
Evidence: Deterministic lexical relevance scoring is implemented and tested.  
Why it remains: Semantic/vector retrieval is not implemented.  
Dependency: Future retrieval infrastructure and evaluation data.  
Future stage: Retrieval enhancement  
Validation required: Compare semantic retrieval quality against representative conversation scenarios before replacing deterministic selection.

### ST6-GAP-002

Category: CONTRADICTION  
Priority: Medium  
Status: PARTIAL  
Evidence: Archived, deleted, superseded, low-scope, and unrelated memories are excluded from attachment context.  
Why it remains: A general contradiction resolver for two active conflicting facts is not implemented; the existing Stage 1 lifecycle remains the authority for explicit supersession.  
Dependency: Product policy for ambiguous conflicting facts.  
Future stage: Memory hardening  
Validation required: Explicit newer-fact supersession and uncertain-conflict scenarios across private companion scopes.

### ST6-GAP-003

Category: PROVIDER  
Priority: High  
Status: NOT VERIFIED  
Evidence: Provider contracts prove the assembled context reaches the Groq/Gemini request boundary.  
Why it remains: No authenticated end-to-end text request was run specifically to evaluate continuity quality.  
Dependency: Authorized runtime session and safe provider evidence collection.  
Future stage: Runtime verification  
Validation required: Store a non-sensitive fact, ask a related later question, and verify a character-consistent response.

### ST6-GAP-004

Category: ANDROID  
Priority: High  
Status: NOT VERIFIED  
Evidence: Web export and source/provider contracts pass.  
Why it remains: Android continuity, account switching, and cross-companion runtime isolation were not physically exercised.  
Dependency: Authorized Android runtime.  
Future stage: Runtime verification  
Validation required: Priya continuity scenario, second-companion isolation scenario, restart, and account-switching checks.

### ST6-GAP-005

Category: LIVE  
Priority: Medium  
Status: NOT VERIFIED  
Evidence: Gemini Live setup receives bounded companion and relationship context through the existing call screen.  
Why it remains: Native multi-turn Live behavior with attached context was not physically verified.  
Dependency: Authorized Android runtime and Gemini Live session.  
Future stage: Runtime verification  
Validation required: Confirm identity, language, relevant memory, and relationship behavior over multiple spoken turns.
