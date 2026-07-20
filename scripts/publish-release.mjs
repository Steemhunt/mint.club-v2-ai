import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = ['cli', 'mcp', 'eliza-plugin'];
const packageNames = new Map([
  ['cli', '@mint.club/v2-cli'],
  ['mcp', '@mint.club/v2-mcp'],
  ['eliza-plugin', '@mint.club/v2-eliza-plugin'],
]);
const npmRegistry = 'https://registry.npmjs.org/';

function manifestFor(workspace) {
  return JSON.parse(
    readFileSync(resolve(root, workspace, 'package.json'), 'utf8'),
  );
}

export function buildReleasePlan(manifests) {
  const packages = workspaces.map((workspace) => {
    const manifest = manifests.get(workspace);
    if (!manifest?.name || !manifest?.version) {
      throw new Error(`Missing release metadata for ${workspace}`);
    }
    const expectedName = packageNames.get(workspace);
    if (manifest.name !== expectedName) {
      throw new Error(
        `${workspace} package name ${manifest.name} does not match ${expectedName}`,
      );
    }
    return { workspace, name: manifest.name, version: manifest.version };
  });
  const version = packages[0].version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Release version must be stable semver: ${version}`);
  }
  for (const pkg of packages) {
    if (pkg.version !== version) {
      throw new Error(
        `${pkg.workspace} version ${pkg.version} does not match ${version}`,
      );
    }
  }
  return { version, tag: `v${version}`, packages };
}

export function assertPublishedMetadata(pkg, expectedHead, metadata) {
  if (metadata?.version !== pkg.version) {
    throw new Error(`${pkg.name}@${pkg.version} is not available on npm`);
  }
  if (metadata.gitHead !== expectedHead) {
    throw new Error(
      `${pkg.name}@${pkg.version} was published from ${metadata.gitHead ?? 'an unknown commit'}, expected ${expectedHead}`,
    );
  }
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
    throw new Error(
      `${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
    );
  }
  return capture ? result.stdout.trim() : '';
}

function publishedMetadata(pkg) {
  const result = spawnSync(
    'npm',
    [
      'view',
      `${pkg.name}@${pkg.version}`,
      'version',
      'gitHead',
      '--json',
      '--prefer-online',
      '--registry',
      npmRegistry,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return JSON.parse(result.stdout);

  const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`;
  if (/\bE404\b|404 Not Found/i.test(detail)) return undefined;
  throw new Error(`Could not query ${pkg.name}@${pkg.version}: ${detail.trim()}`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForPublished(pkg, expectedHead, attempts = 36) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const metadata = publishedMetadata(pkg);
    if (metadata) {
      assertPublishedMetadata(pkg, expectedHead, metadata);
      return;
    }
    if (attempt < attempts) await delay(5_000);
  }
  throw new Error(
    `${pkg.name}@${pkg.version} did not become available on npm in time`,
  );
}

function currentPlan() {
  return buildReleasePlan(
    new Map(workspaces.map((workspace) => [workspace, manifestFor(workspace)])),
  );
}

function assertCleanWorkingTree() {
  const status = run('git', ['status', '--porcelain'], { capture: true });
  if (status) throw new Error('Release requires a clean working tree');
}

function tagCommit(tag) {
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', `${tag}^{commit}`],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 128) return undefined;
  throw new Error(result.stderr.trim() || `Could not resolve ${tag}`);
}

async function verifyTag(tag, expectedHead) {
  const plan = currentPlan();
  if (tag !== plan.tag) {
    throw new Error(`Tag ${tag} does not match package version ${plan.version}`);
  }
  for (const pkg of plan.packages) {
    await waitForPublished(pkg, expectedHead, 18);
  }
  console.log(
    `Verified ${tag}: all npm packages were published from ${expectedHead}`,
  );
}

async function publishRelease(dryRun) {
  const plan = currentPlan();
  assertCleanWorkingTree();
  if (run('git', ['branch', '--show-current'], { capture: true }) !== 'main') {
    throw new Error('Release must run from the main branch');
  }

  run('git', ['fetch', 'origin', 'main', '--tags']);
  const head = run('git', ['rev-parse', 'HEAD'], { capture: true });
  let remoteMain = run('git', ['rev-parse', 'origin/main'], {
    capture: true,
  });
  if (head !== remoteMain) {
    throw new Error('Local main must exactly match origin/main');
  }

  let existingTagCommit = tagCommit(plan.tag);
  if (existingTagCommit && existingTagCommit !== head) {
    throw new Error(`${plan.tag} already points to ${existingTagCommit}`);
  }
  run('npm', ['whoami', '--registry', npmRegistry]);

  const validationCommands = [
    ['ci'],
    ['run', 'check'],
    ['test'],
    ['run', 'build'],
    ['run', 'audit:production'],
    ['run', 'audit:full'],
    ['run', 'test:release'],
  ];
  for (const args of validationCommands) run('npm', args);
  assertCleanWorkingTree();

  run('git', ['fetch', 'origin', 'main', '--tags']);
  remoteMain = run('git', ['rev-parse', 'origin/main'], { capture: true });
  if (head !== remoteMain) {
    throw new Error('Remote main changed during release validation');
  }
  existingTagCommit = tagCommit(plan.tag);
  if (existingTagCommit && existingTagCommit !== head) {
    throw new Error(`${plan.tag} already points to ${existingTagCommit}`);
  }

  for (const pkg of plan.packages) {
    const metadata = publishedMetadata(pkg);
    if (metadata) {
      assertPublishedMetadata(pkg, head, metadata);
      console.log(`Already published: ${pkg.name}@${pkg.version}`);
      continue;
    }
    if (dryRun) {
      console.log(`Would publish: ${pkg.name}@${pkg.version}`);
      continue;
    }
    run('npm', [
      'publish',
      '--workspace',
      pkg.workspace,
      '--access',
      'public',
      '--registry',
      npmRegistry,
    ]);
    assertCleanWorkingTree();
    await waitForPublished(pkg, head);
  }

  if (dryRun) {
    console.log(`Would push release tag: ${plan.tag}`);
    return;
  }

  assertCleanWorkingTree();
  if (!existingTagCommit) {
    run('git', ['tag', '-a', plan.tag, '-m', `Release ${plan.tag}`]);
  }
  run('git', ['push', 'origin', `refs/tags/${plan.tag}`]);
  console.log(
    `Published ${plan.version} and pushed ${plan.tag}; GitHub Release creation is automatic`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--verify-tag') {
    if (args.length !== 3) {
      throw new Error('Usage: publish-release.mjs --verify-tag <tag> <commit>');
    }
    await verifyTag(args[1], args[2]);
    return;
  }
  if (args.length > 1 || (args[0] && args[0] !== '--dry-run')) {
    throw new Error('Usage: npm run release [-- --dry-run]');
  }
  await publishRelease(args[0] === '--dry-run');
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryPoint === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
