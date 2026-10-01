# Phase 1 memory and archive boundaries

- `InteractionEnvelope` carries authenticated identity, semantic user input, modality, conversation context, and bounded persona, relationship, memory, attachment, and optional group context to the existing `AIBrain` provider request.
- `LocalMemoryProvider` delegates selection, promotion, update, and archive operations to the current local memory selector/lifecycle. It does not change local memory storage or derive archive records.
- `ConversationArchive` persists exact message content and event time through the authenticated Supabase client. `SupabaseConversationArchive` confirms the current Supabase user before writing; the migration enables owner-scoped RLS. Composite `(user_id, id)` keys make retries of the same message upserts idempotent.
- Archive writes run best-effort from app message updates. A failed write is logged without turning a successful AI response into an error. Attachment metadata excludes local device URIs.
- Voice messages enter the Brain as the STT transcript; the archive stores that semantic content, voice metadata, and response, not PCM. Live Call retains its existing Gemini Live audio-turn transport and archives its existing end-of-call summary only; per-turn semantic transcripts are not currently connected to the app's conversation message model.
- Proactive output uses the proactive modality. Existing provider wording and companion configuration remain the prompt source of truth.
