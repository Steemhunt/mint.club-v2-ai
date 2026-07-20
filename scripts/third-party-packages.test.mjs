import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  assertNoticeCoversMetafile,
  packagesFromMetafile,
} from './third-party-packages.mjs';

function writePackage(root, name, version) {
  const packageRoot = resolve(root, 'node_modules', name);
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    resolve(packageRoot, 'package.json'),
    JSON.stringify({ name, version, license: 'MIT' }),
  );
  writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');
}

function noticeRows(identities) {
  return [
    '| Package | Version | Declared license |',
    '| --- | --- | --- |',
    ...identities.map((identity) => {
      const separator = identity.lastIndexOf('@');
      const version = identity.slice(separator + 1);
      return `| \`${identity}\` | ${version} | MIT |`;
    }),
  ].join('\n');
}

test('compares notices against every bundled package identity', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mintclub-coverage-test-'));
  try {
    writePackage(directory, 'package-a', '1.0.0');
    writePackage(directory, 'package-b', '2.0.0');
    const metafile = {
      inputs: {
        'node_modules/package-a/index.js': {},
        'node_modules/package-b/index.js': {},
      },
    };

    assert.throws(
      () =>
        assertNoticeCoversMetafile(
          noticeRows(['package-a@1.0.0']),
          metafile,
          directory,
        ),
      /package-b@2\.0\.0/,
    );
    assert.doesNotThrow(() =>
      assertNoticeCoversMetafile(
        noticeRows(['package-a@1.0.0', 'package-b@2.0.0']),
        metafile,
        directory,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('does not attribute a nested package with no manifest to its parent', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mintclub-boundary-test-'));
  try {
    writePackage(directory, 'parent-package', '1.0.0');
    const missingRoot = resolve(
      directory,
      'node_modules/parent-package/node_modules/missing-package',
    );
    mkdirSync(missingRoot, { recursive: true });
    writeFileSync(resolve(missingRoot, 'index.js'), 'export {};\n');

    assert.throws(
      () =>
        packagesFromMetafile(
          {
            inputs: {
              'node_modules/parent-package/node_modules/missing-package/index.js':
                {},
            },
          },
          directory,
        ),
      /missing-package/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
