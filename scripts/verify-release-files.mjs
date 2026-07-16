import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoticeCoversMetafile } from './third-party-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = ['cli', 'mcp', 'eliza-plugin'];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const rootLicense = read('LICENSE');
for (const workspace of workspaces) {
  const workspaceLicense = read(`${workspace}/LICENSE`);
  if (workspaceLicense !== rootLicense) {
    throw new Error(`${workspace}/LICENSE is not identical to the project LICENSE`);
  }
}

const notices = read('cli/THIRD_PARTY_NOTICES.md');
const cliRoot = resolve(root, 'cli');
const cliManifest = JSON.parse(read('cli/package.json'));
const temporaryBuild = mkdtempSync(resolve(tmpdir(), 'mintclub-release-check-'));
let metafile;
try {
  const metafilePath = resolve(temporaryBuild, 'metafile.json');
  const bundledBun = resolve(root, 'node_modules/.bin/bun');
  const bun = process.env.BUN_BIN || (existsSync(bundledBun) ? bundledBun : 'bun');
  execFileSync(
    bun,
    [
      'build',
      'src/index.ts',
      `--outdir=${resolve(temporaryBuild, 'dist')}`,
      '--target=node',
      '--packages=bundle',
      `--metafile=${metafilePath}`,
      '--define',
      `__VERSION__="${cliManifest.version}"`,
    ],
    { cwd: cliRoot, encoding: 'utf8', stdio: 'pipe' },
  );
  metafile = JSON.parse(readFileSync(metafilePath, 'utf8'));
} finally {
  rmSync(temporaryBuild, { recursive: true, force: true });
}
const noticeCoverage = assertNoticeCoversMetafile(notices, metafile, cliRoot);

for (const workspace of workspaces) {
  const output = execFileSync(
    'npm',
    [
      'pack',
      '--dry-run',
      '--json',
      '--ignore-scripts',
      `--workspace=${workspace}`,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  const [packed] = JSON.parse(output);
  const paths = new Set(packed.files.map(({ path }) => path));
  for (const required of ['LICENSE', 'README.md', 'package.json']) {
    if (!paths.has(required)) {
      throw new Error(`${workspace} tarball is missing ${required}`);
    }
  }
  if (!paths.has('dist/index.js')) {
    throw new Error(`${workspace} tarball is missing dist/index.js`);
  }
  if (workspace === 'cli' && !paths.has('THIRD_PARTY_NOTICES.md')) {
    throw new Error('CLI tarball is missing THIRD_PARTY_NOTICES.md');
  }
}

console.log(
  `Release files verified for CLI, MCP, and Eliza packages; notices cover ${noticeCoverage.bundled.length} bundled package identities.`,
);
