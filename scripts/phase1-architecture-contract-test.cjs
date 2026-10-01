const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSystemInstruction } = require('../server/providers/router');

const root = path.resolve(__dirname, '..');
const required = [
  ['src/brain/types.ts', 'InteractionEnvelope'],
  ['src/brain/types.ts', 'PersonaContext'],
  ['src/relationship/context.ts', 'RelationshipContext'],
  ['src/memory/provider.ts', 'MemoryProvider'],
  ['src/memory/provider.ts', 'LocalMemoryProvider'],
  ['src/archive/types.ts', 'ConversationArchive'],
  ['src/archive/supabaseArchive.ts', 'SupabaseConversationArchive'],
  ['supabase/migrations/20261002000000_conversation_archive.sql', 'enable row level security'],
];

for (const [file, token] of required) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(source.includes(token), `${file} must contain ${token}`);
}

console.log('Phase 1 architecture source contracts passed.');

const prompt = buildSystemInstruction(
  { name: 'Legacy name', tagline: 'Legacy identity', personality: 'Legacy personality', language: 'Tamil & English', aiConfig: undefined },
  {
    personaContext: {
      name: 'Priya',
      identity: 'existing companion tagline',
      personality: 'existing personality wording',
      language: 'Tamil & English',
    },
    relationshipBoundary: { stage: 'comfortable', familiarity: 35, trust: 42, closeness: 38, milestones: [] },
  },
);
assert.match(prompt, /You are Priya\./);
assert.match(prompt, /Companion identity: existing companion tagline\./);
assert.match(prompt, /Personality: existing personality wording/);
assert.match(prompt, /Relationship context: stage comfortable/);
console.log('Phase 1 provider context boundary contracts passed.');
