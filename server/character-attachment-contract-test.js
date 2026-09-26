const assert = require('node:assert/strict');
const { buildSystemInstruction } = require('./providers/router');

const request = {
  attachedContext: {
    memories: [{ text: 'User prefers tea in the morning' }],
    relationship: { stage: 'comfortable', familiarity: 42, trust: 38, closeness: 31, milestones: ['First conversation'] },
    shortTerm: [{ fromMe: true, text: 'I have a meeting tomorrow', type: 'text' }],
    proactive: ['Scheduled moment: Friday wind-down'],
  },
};
const companion = {
  id: 'priya',
  name: 'Priya',
  tagline: 'Your caring everyday companion',
  personality: 'Warm and caring',
  language: 'Tamil & English',
  aiConfig: {
    personality: { warmth: 91, playfulness: 62, depth: 88, formality: 18 },
    language: { primary: 'Tamil', secondary: 'English', codeSwitching: true },
  },
};
const instruction = buildSystemInstruction(companion, request);
assert.match(instruction, /User prefers tea/);
assert.match(instruction, /comfortable/);
assert.match(instruction, /warmth 91%/);
assert.match(instruction, /code-switching/i);
assert.match(instruction, /meeting tomorrow/);
assert.match(instruction, /Friday wind-down/);

const groupInstruction = buildSystemInstruction(companion, {
  attachedContext: { memories: [], relationship: undefined, shortTerm: [], proactive: [] },
});
assert.doesNotMatch(groupInstruction, /User prefers tea|comfortable|Friday wind-down/);
console.log('Stage 6 character attachment provider contracts passed.');
