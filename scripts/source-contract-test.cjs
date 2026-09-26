const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'priya-contracts-'));
const files = [
  'src/ai/contractTests.ts',
  'src/auth/tests.ts',
  'src/groups/tests.ts',
  'src/proactive/tests.ts',
  'src/storage/tests.ts',
  'src/relationship/tests.ts',
  'src/voice/tests.ts',
  'src/voice/liveTests.ts',
  'src/ai/attachmentContext.ts',
  'src/groups/context.ts',
  'src/integration/stage9Tests.ts',
  'src/integration/stage12Tests.ts',
  'src/integration/stage13Tests.ts',
  'src/integration/stage14Tests.ts',
  'src/integration/stage15Tests.ts',
];

try {
  execFileSync(
    process.execPath,
    [
      path.join(projectRoot, 'node_modules/typescript/bin/tsc'),
      '--ignoreConfig',
      '--target', 'ES2022',
      '--module', 'commonjs',
      '--lib', 'ES2022,DOM',
      '--skipLibCheck',
      '--rootDir', projectRoot,
      '--outDir', outputDir,
      ...files.map((file) => path.join(projectRoot, file)),
    ],
    { cwd: projectRoot, stdio: 'inherit' },
  );

  const { COMPANIONS } = require(path.join(outputDir, 'src/data.js'));
  const companion = COMPANIONS[0];
  assert.ok(companion, 'fixture companion is available');
  require(path.join(outputDir, 'src/auth/tests.js')).runAuthContractTests();
  require(path.join(outputDir, 'src/groups/tests.js')).runGroupContractTests(companion);
  require(path.join(outputDir, 'src/proactive/tests.js')).runProactiveContractTests(companion);
  require(path.join(outputDir, 'src/storage/tests.js')).runStorageContractTests(companion);
  require(path.join(outputDir, 'src/relationship/tests.js')).runRelationshipContractTests();
  require(path.join(outputDir, 'src/ai/contractTests.js')).runAIContractTests()
    .then(() => require(path.join(outputDir, 'src/voice/tests.js')).runVoiceContractTests())
    .then(() => require(path.join(outputDir, 'src/voice/liveTests.js')).runLiveVoiceContractTests(companion))
      .then(() => require(path.join(outputDir, 'src/integration/stage9Tests.js')).runStage9IntegrationContractTests())
      .then(() => require(path.join(outputDir, 'src/integration/stage12Tests.js')).runStage12PersistenceContractTests())
      .then(() => require(path.join(outputDir, 'src/integration/stage13Tests.js')).runStage13ContinuityContractTests())
      .then(() => require(path.join(outputDir, 'src/integration/stage14Tests.js')).runStage14AttachmentContractTests(companion, COMPANIONS[1]))
      .then(() => require(path.join(outputDir, 'src/integration/stage15Tests.js')).runStage15SecurityContractTests())
      .then(() => console.log('Source contract tests passed.'));
} finally {
  process.on('exit', () => fs.rmSync(outputDir, { recursive: true, force: true }));
}
