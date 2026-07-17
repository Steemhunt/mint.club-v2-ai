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

const bundledWorkspaces = [
  {
    workspace: 'cli',
    buildArgs: (manifest) => ['--define', `__VERSION__="${manifest.version}"`],
  },
  { workspace: 'mcp', buildArgs: () => ['--format=esm'] },
];
const bundledBun = resolve(root, 'node_modules/.bin/bun');
const bun = process.env.BUN_BIN || (existsSync(bundledBun) ? bundledBun : 'bun');
const noticeCoverage = new Map();

for (const { workspace, buildArgs } of bundledWorkspaces) {
  const workspaceRoot = resolve(root, workspace);
  const manifest = JSON.parse(read(`${workspace}/package.json`));
  const notices = read(`${workspace}/THIRD_PARTY_NOTICES.md`);
  const temporaryBuild = mkdtempSync(
    resolve(tmpdir(), `mintclub-${workspace}-release-check-`),
  );
  let metafile;
  try {
    const metafilePath = resolve(temporaryBuild, 'metafile.json');
    execFileSync(
      bun,
      [
        'build',
        'src/index.ts',
        `--outdir=${resolve(temporaryBuild, 'dist')}`,
        '--target=node',
        '--packages=bundle',
        `--metafile=${metafilePath}`,
        ...buildArgs(manifest),
      ],
      { cwd: workspaceRoot, encoding: 'utf8', stdio: 'pipe' },
    );
    metafile = JSON.parse(readFileSync(metafilePath, 'utf8'));
  } finally {
    rmSync(temporaryBuild, { recursive: true, force: true });
  }
  noticeCoverage.set(
    workspace,
    assertNoticeCoversMetafile(notices, metafile, workspaceRoot),
  );
}

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
  if (noticeCoverage.has(workspace) && !paths.has('THIRD_PARTY_NOTICES.md')) {
    throw new Error(`${workspace} tarball is missing THIRD_PARTY_NOTICES.md`);
  }
}

console.log(
  `Release files verified for CLI, MCP, and Eliza packages; notices cover ${[...noticeCoverage.entries()]
    .map(([workspace, coverage]) => `${workspace}=${coverage.bundled.length}`)
    .join(', ')} bundled package identities.`,
);
