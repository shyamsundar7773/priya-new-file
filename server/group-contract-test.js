const assert = require('node:assert/strict');
const { buildSystemInstruction } = require('./providers/router');

const groupRequest = {
  groupContext: {
    group: { id: 'group-a', name: 'Circle', memberIds: ['priya', 'latha'] },
    participants: [
      { id: 'priya', name: 'Priya', identity: 'caring', personality: 'warm', language: 'Tamil & English' },
      { id: 'latha', name: 'Latha', identity: 'thoughtful', personality: 'reflective', language: 'English' },
    ],
    memories: [{ text: 'The group likes quiet evenings', scope: 'group', groupId: 'group-a' }],
    shortTerm: [{ fromMe: true, type: 'text', text: '@Priya what do you think?' }],
    targetCompanionId: 'priya',
    proactive: ['Friday wind-down'],
    currentRequest: '@Priya what do you think?',
  },
  attachedContext: { memories: [{ text: 'Private Priya secret' }], relationship: { stage: 'close' }, shortTerm: [], proactive: [] },
};
const prompt = buildSystemInstruction({
  name: 'Priya',
  tagline: 'Caring companion',
  personality: 'Warm',
  language: 'Tamil & English',
  aiConfig: { personality: { warmth: 90, playfulness: 60, depth: 80, formality: 20 }, language: { primary: 'Tamil', secondary: 'English', codeSwitching: true } },
}, groupRequest);
assert.match(prompt, /Circle/);
assert.match(prompt, /Latha/);
assert.match(prompt, /quiet evenings/);
assert.match(prompt, /group participant with id priya/);
assert.doesNotMatch(prompt, /Private Priya secret/);
assert.doesNotMatch(prompt, /Relationship context/);
console.log('Stage 7 group provider contracts passed.');
