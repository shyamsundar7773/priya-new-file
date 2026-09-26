const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'priya-stage14-'));
try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules/typescript/bin/tsc'),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM',
    '--skipLibCheck', '--rootDir', projectRoot, '--outDir', outputDir,
    path.join(projectRoot, 'src/attachments/model.ts'),
    path.join(projectRoot, 'src/data.ts'),
    path.join(projectRoot, 'src/integration/stage14Tests.ts'),
  ], { cwd: projectRoot, stdio: 'inherit' });
  const { COMPANIONS } = require(path.join(outputDir, 'src/data.js'));
  require(path.join(outputDir, 'src/integration/stage14Tests.js')).runStage14AttachmentContractTests(COMPANIONS[0], COMPANIONS[1]);
  console.log('Stage 14 attachment contracts passed.');
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
