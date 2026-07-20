import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertNoticeCoversMetafile } from './third-party-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = ['cli', 'mcp', 'eliza-plugin'];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function manifestFor(workspace) {
  return JSON.parse(read(`${workspace}/package.json`));
}

const manifests = new Map(
  workspaces.map((workspace) => [workspace, manifestFor(workspace)]),
);
const cliVersion = manifests.get('cli').version;
for (const [workspace, manifest] of manifests) {
  if (manifest.version !== cliVersion) {
    throw new Error(
      `${workspace} version ${manifest.version} does not match CLI ${cliVersion}`,
    );
  }
}
for (const workspace of ['mcp', 'eliza-plugin']) {
  const cliRange = manifests.get(workspace).dependencies?.['@mint.club/v2-cli'];
  if (cliRange !== `^${cliVersion}`) {
    throw new Error(
      `${workspace} must require @mint.club/v2-cli@^${cliVersion}`,
    );
  }
}
const mcpRegistry = JSON.parse(read('mcp/server.json'));
const mcpRegistryPackage = mcpRegistry.packages?.find(
  ({ identifier }) => identifier === '@mint.club/v2-mcp',
);
if (
  mcpRegistry.version !== cliVersion ||
  mcpRegistryPackage?.version !== cliVersion
) {
  throw new Error(`mcp/server.json must reference version ${cliVersion}`);
}

const rootLicense = read('LICENSE');
for (const workspace of workspaces) {
  const workspaceLicense = read(`${workspace}/LICENSE`);
  if (workspaceLicense !== rootLicense) {
    throw new Error(`${workspace}/LICENSE is not identical to the project LICENSE`);
  }
}

function artifactBytecode(value) {
  if (typeof value === 'string') return value.replace(/^0x/, '');
  if (value && typeof value.object === 'string') {
    return value.object.replace(/^0x/, '');
  }
  return '';
}

function assertArtifactBytecodeExcluded(metafile, workspaceRoot, bundle) {
  const artifactInputs = Object.keys(metafile.inputs ?? {}).filter((input) =>
    /[\\/]node_modules[\\/]@uniswap[\\/][^\\/]+[\\/]artifacts[\\/].+\.json$/.test(
      input,
    ),
  );
  if (artifactInputs.length === 0) {
    throw new Error('CLI build contains no transformed Uniswap artifacts');
  }

  let checkedBytecodes = 0;
  for (const input of artifactInputs) {
    const artifact = JSON.parse(
      readFileSync(resolve(workspaceRoot, input), 'utf8'),
    );
    for (const field of ['bytecode', 'deployedBytecode']) {
      const bytecode = artifactBytecode(artifact[field]);
      if (bytecode.length < 256) continue;
      checkedBytecodes += 1;
      if (bundle.includes(bytecode.slice(0, 256))) {
        throw new Error(`CLI bundle copied ${field} from ${input}`);
      }
    }
  }
  if (checkedBytecodes === 0) {
    throw new Error('Transformed Uniswap artifacts contain no bytecode fixtures');
  }
  return { artifacts: artifactInputs.length, bytecodes: checkedBytecodes };
}

const bundledWorkspaces = ['cli', 'mcp'];
const bundledBun = resolve(root, 'node_modules/.bin/bun');
const bun = process.env.BUN_BIN || (existsSync(bundledBun) ? bundledBun : 'bun');
const buildScript = resolve(root, 'scripts/build-package.mjs');
const noticeCoverage = new Map();
let artifactCoverage;

for (const workspace of bundledWorkspaces) {
  const workspaceRoot = resolve(root, workspace);
  const manifest = manifests.get(workspace);
  const notices = read(`${workspace}/THIRD_PARTY_NOTICES.md`);
  const temporaryBuild = mkdtempSync(
    resolve(root, 'node_modules/.mintclub-release-check-'),
  );
  try {
    const metafilePath = resolve(temporaryBuild, 'metafile.json');
    const distPath = resolve(temporaryBuild, 'dist');
    execFileSync(
      bun,
      [buildScript, workspace, distPath, metafilePath],
      { cwd: workspaceRoot, encoding: 'utf8', stdio: 'pipe' },
    );
    const metafile = JSON.parse(readFileSync(metafilePath, 'utf8'));
    noticeCoverage.set(
      workspace,
      assertNoticeCoversMetafile(notices, metafile, workspaceRoot),
    );

    const entrypoint = resolve(distPath, 'index.js');
    if (workspace === 'cli') {
      const bundle = readFileSync(entrypoint, 'utf8');
      artifactCoverage = assertArtifactBytecodeExcluded(
        metafile,
        workspaceRoot,
        bundle,
      );
      const output = execFileSync(process.execPath, [entrypoint, '--version'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
      }).trim();
      if (output !== manifest.version) {
        throw new Error(`CLI reports ${output}; expected ${manifest.version}`);
      }
    } else {
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `process.env.SMITHERY_SCAN = '1'; await import(${JSON.stringify(pathToFileURL(entrypoint).href)});`,
        ],
        { cwd: workspaceRoot, encoding: 'utf8', stdio: 'pipe' },
      );
    }
  } finally {
    rmSync(temporaryBuild, { recursive: true, force: true });
  }
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
  `Release files verified for CLI, MCP, and Eliza packages at ${cliVersion}; notices cover ${[...noticeCoverage.entries()]
    .map(([workspace, coverage]) => `${workspace}=${coverage.bundled.length}`)
    .join(', ')} bundled package identities; ${artifactCoverage.bytecodes} bytecode fields from ${artifactCoverage.artifacts} Uniswap artifacts are excluded.`,
);
