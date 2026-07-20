import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function isNodeModulesPath(path) {
  return path.split(/[\\/]+/).includes('node_modules');
}

function isPackageRoot(directory) {
  const parent = dirname(directory);
  if (basename(parent) === 'node_modules') return true;
  return (
    basename(dirname(parent)) === 'node_modules' &&
    basename(parent).startsWith('@')
  );
}

export function packageForInput(input, cwd) {
  let directory = dirname(resolve(cwd, input));
  while (directory !== dirname(directory)) {
    if (isPackageRoot(directory)) {
      const manifestPath = resolve(directory, 'package.json');
      if (!existsSync(manifestPath)) return undefined;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (
        typeof manifest.name === 'string' &&
        manifest.name.length > 0 &&
        typeof manifest.version === 'string' &&
        manifest.version.length > 0
      ) {
        return { directory, manifest };
      }
      return undefined;
    }
    directory = dirname(directory);
  }
  return undefined;
}

export function packagesFromMetafile(metafile, cwd) {
  if (
    !metafile?.inputs ||
    typeof metafile.inputs !== 'object' ||
    Array.isArray(metafile.inputs)
  ) {
    throw new Error('Bun metafile is missing its inputs map');
  }

  const packagesByRoot = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const found = packageForInput(input, cwd);
    if (found) {
      packagesByRoot.set(found.directory, found);
    } else if (isNodeModulesPath(resolve(cwd, input))) {
      throw new Error(`Unmapped bundled node_modules input: ${input}`);
    }
  }
  return [...packagesByRoot.values()];
}

export function bundledPackageIdentities(metafile, cwd) {
  return [
    ...new Set(
      packagesFromMetafile(metafile, cwd).map(
        ({ manifest }) => `${manifest.name}@${manifest.version}`,
      ),
    ),
  ].sort(compareText);
}

export function noticePackageIdentities(notices) {
  const identities = [];
  const row = /^\| `(.+)@([^`@]+)` \| ([^|]+) \|/gm;
  for (const match of notices.matchAll(row)) {
    const version = match[2];
    if (match[3].trim() !== version) {
      throw new Error(
        `Third-party notice row has inconsistent version columns: ${match[0]}`,
      );
    }
    identities.push(`${match[1]}@${version}`);
  }
  if (identities.length === 0) {
    throw new Error('Third-party notices contain no package rows');
  }
  if (new Set(identities).size !== identities.length) {
    throw new Error('Third-party notices contain duplicate package rows');
  }
  return identities.sort(compareText);
}

export function assertNoticeCoversMetafile(notices, metafile, cwd) {
  const bundled = bundledPackageIdentities(metafile, cwd);
  const noticed = noticePackageIdentities(notices);
  const bundledSet = new Set(bundled);
  const noticedSet = new Set(noticed);
  const missing = bundled.filter((identity) => !noticedSet.has(identity));
  const extra = noticed.filter((identity) => !bundledSet.has(identity));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      [
        missing.length > 0
          ? `Third-party notices are missing bundled packages: ${missing.join(', ')}`
          : '',
        extra.length > 0
          ? `Third-party notices contain unbundled packages: ${extra.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
  }
  return { bundled, noticed };
}
