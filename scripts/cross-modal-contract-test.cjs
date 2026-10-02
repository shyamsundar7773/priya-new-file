const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'priya-cross-modal-'));

try {
  execFileSync(
    process.execPath,
    [
      path.join(projectRoot, 'node_modules/typescript/bin/tsc'),
      '--ignoreConfig',
      '--target', 'ES2022',
      '--module', 'commonjs',
      '--lib', 'ES2022,DOM',
      '--types', 'node',
      '--skipLibCheck',
      '--rootDir', projectRoot,
      '--outDir', outputDir,
      path.join(projectRoot, 'src/brain/crossModalContinuityTests.ts'),
    ],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  require(path.join(outputDir, 'src/brain/crossModalContinuityTests.js')).runCrossModalContinuityTests()
    .then(() => console.log('Cross-modal continuity tests passed.'));
} finally {
  process.on('exit', () => fs.rmSync(outputDir, { recursive: true, force: true }));
}
