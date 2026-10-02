const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, '.tmp-cross-modal-contract');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const nativeModuleMocks = new Map([
  ['expo', { requireOptionalNativeModule: () => null }],
  ['expo-audio', { AudioModule: {} }],
  ['expo-secure-store', {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  }],
  ['@react-native-async-storage/async-storage', {
    default: {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    },
  }],
  ['react-native', { Platform: { OS: 'test' } }],
]);
const originalLoad = Module._load;
const hadDevFlag = Object.prototype.hasOwnProperty.call(globalThis, '__DEV__');
const originalDevFlag = globalThis.__DEV__;
globalThis.__DEV__ = false;
Module._load = function loadWithNativeBoundaryMock(request, parent, isMain) {
  if (nativeModuleMocks.has(request)) return nativeModuleMocks.get(request);
  return originalLoad.call(this, request, parent, isMain);
};

async function run() {
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
  await require(path.join(outputDir, 'src/brain/crossModalContinuityTests.js')).runCrossModalContinuityTests();
  console.log('Cross-modal continuity tests passed.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoad;
    if (hadDevFlag) globalThis.__DEV__ = originalDevFlag;
    else delete globalThis.__DEV__;
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
