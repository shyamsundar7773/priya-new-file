const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'priya-stage18-'));
const files = [
  'src/data.ts',
  'src/types.ts',
  'src/attachments/model.ts',
  'src/ai/attachmentContext.ts',
  'src/ai/context.ts',
  'src/ai/types.ts',
  'src/groups/context.ts',
  'src/memory/lifecycle.ts',
  'src/relationship/engine.ts',
  'src/proactive/engine.ts',
  'src/storage/keys.ts',
  'src/storage/serialize.ts',
  'src/voice/messagePipeline.ts',
  'src/voice/liveContext.ts',
  'src/integration/stage18Tests.ts',
];

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'commonjs',
    '--lib', 'ES2022,DOM', '--skipLibCheck', '--allowJs', '--checkJs', 'false',
    '--rootDir', root, '--outDir', out,
    ...files.map((file) => path.join(root, file)),
  ], { cwd: root, stdio: 'inherit' });
  require(path.join(out, 'src/integration/stage18Tests.js')).runStage18IntegrationTests()
    .then(() => {
      const { buildSystemInstruction, buildMessages } = require(path.join(root, 'server/providers/router.js'));
      const { bindAuthenticatedIdentity, publicError } = require(path.join(root, 'server/security.js'));
      const { classifyProviderError, isRetryableFailure, sanitizedProviderError } = require(path.join(root, 'server/providers/reliability.js'));
      const appContext = fs.readFileSync(path.join(root, 'src/AppContext.tsx'), 'utf8');
      const request = {
        userMessage: 'How should I prepare?',
        history: [],
        companion: { id: 'priya', name: 'Priya', tagline: 'Caring', personality: 'Warm', language: 'Tamil & English' },
        attachedContext: {
          user: { id: 'stage18-account-a' },
          memories: [{ text: 'I prefer tea.' }],
          relationship: { stage: 'familiar', familiarity: 10, trust: 10, closeness: 10, milestones: [] },
          shortTerm: [],
          proactive: [],
          attachments: [],
        },
      };
      const bound = bindAuthenticatedIdentity({ ...request, relationshipContext: request.attachedContext.relationship }, 'stage18-account-a');
      if (bound.authenticatedUserId !== 'stage18-account-a' || bound.relationshipContext || bound.attachedContext.user.id !== 'stage18-account-a') throw new Error('Stage 18 security identity binding failed.');
      if (publicError(Object.assign(new Error('provider secret details'), { code: 'AUTHENTICATION' })).message !== 'Authentication is required.') throw new Error('Stage 18 security error sanitization failed.');
      const prompt = buildSystemInstruction(request.companion, request);
      if (!prompt.includes('You are Priya') || prompt.indexOf('Personality:') > prompt.indexOf('Language:') || prompt.indexOf('Language:') > prompt.indexOf('Relevant remembered user context:')) throw new Error('Stage 18 provider prompt ordering failed.');
      if (buildMessages(request).at(-1).content !== request.userMessage) throw new Error('Stage 18 provider current-message boundary failed.');
      if (classifyProviderError(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })) !== 'timeout' || !isRetryableFailure(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }))) throw new Error('Stage 18 timeout classification failed.');
      if (isRetryableFailure(Object.assign(new Error('invalid'), { code: 'INVALID_REQUEST' }))) throw new Error('Stage 18 invalid-request fallback classification failed.');
      if (sanitizedProviderError(Object.assign(new Error('secret provider response'), { code: 'AUTHENTICATION' })).message.includes('secret')) throw new Error('Stage 18 provider error sanitization failed.');
      if (!appContext.includes('currentAuthUserRef') || !appContext.includes('session changed while the request was pending') || !appContext.includes('setCompanions(COMPANIONS)')) throw new Error('Stage 18 changed-account pending-work guard is not wired.');
      console.log('Stage 18 server-boundary integration contracts passed.');
    })
    .catch((error) => { console.error(error); process.exitCode = 1; });
} finally {
  process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));
}
