const assert = require('node:assert/strict');
const fs = require('node:fs');

const screens = fs.readFileSync(require.resolve('../src/screens.tsx'), 'utf8');
const types = fs.readFileSync(require.resolve('../src/types.ts'), 'utf8');
const referenceIndex = fs.readFileSync(require.resolve('../REFERENCE_READONLY/REFERENCE_EXPORT/SCREEN_INDEX.md'), 'utf8');

for (const route of ['chat', 'voice-call', 'companion-profile', 'companion-studio', 'memory', 'relationship', 'proactive', 'group-chat', 'settings', 'search', 'create-character']) {
  assert.match(types, new RegExp(`'${route}'`), `route ${route} remains declared`);
}
for (const marker of ['onLongPress={onReply}', 'setAvatarViewerOpen(true)', 'title="Memory"', 'title="Relationship"', 'title="Proactive"', 'launchImageLibraryAsync', 'launchCameraAsync', 'voiceMode', 'BottomTabs']) {
  assert.match(screens, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `interaction marker ${marker} remains wired`);
}
for (const section of ['01_AUTH', '02_CHATS', '03_CHAT', '04_COMPANIONS', '05_PROFILE_STUDIO', '08_GROUPS', '09_VOICE_CALL', '11_SETTINGS', '12_SEARCH']) {
  assert.match(referenceIndex, new RegExp(`## ${section}`), `reference inventory includes ${section}`);
}
console.log('Stage 17 frozen UX interaction contracts passed.');
