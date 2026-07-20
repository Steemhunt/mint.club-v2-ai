import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertPublishedMetadata,
  buildReleasePlan,
} from './publish-release.mjs';

function manifests(versions = ['2.1.0', '2.1.0', '2.1.0']) {
  return new Map([
    [
      'cli',
      { name: '@mint.club/v2-cli', version: versions[0] },
    ],
    [
      'mcp',
      { name: '@mint.club/v2-mcp', version: versions[1] },
    ],
    [
      'eliza-plugin',
      { name: '@mint.club/v2-eliza-plugin', version: versions[2] },
    ],
  ]);
}

test('builds a single ordered release plan for aligned packages', () => {
  assert.deepEqual(buildReleasePlan(manifests()), {
    version: '2.1.0',
    tag: 'v2.1.0',
    packages: [
      { workspace: 'cli', name: '@mint.club/v2-cli', version: '2.1.0' },
      { workspace: 'mcp', name: '@mint.club/v2-mcp', version: '2.1.0' },
      {
        workspace: 'eliza-plugin',
        name: '@mint.club/v2-eliza-plugin',
        version: '2.1.0',
      },
    ],
  });
});

test('rejects mismatched or non-stable release versions', () => {
  assert.throws(() => buildReleasePlan(manifests(['2.1.0', '2.1.1', '2.1.0'])));
  assert.throws(() =>
    buildReleasePlan(manifests(['2.1.0-beta.1', '2.1.0-beta.1', '2.1.0-beta.1'])),
  );
  assert.throws(() =>
    buildReleasePlan(manifests(['02.1.0', '02.1.0', '02.1.0'])),
  );
});

test('rejects a renamed public package', () => {
  const releaseManifests = manifests();
  releaseManifests.set('mcp', {
    name: '@mint.club/wrong-package',
    version: '2.1.0',
  });
  assert.throws(() => buildReleasePlan(releaseManifests));
});

test('requires npm metadata to match the package version and git commit', () => {
  const pkg = {
    workspace: 'cli',
    name: '@mint.club/v2-cli',
    version: '2.1.0',
  };
  assert.doesNotThrow(() =>
    assertPublishedMetadata(pkg, 'abc123', {
      version: '2.1.0',
      gitHead: 'abc123',
    }),
  );
  assert.throws(() =>
    assertPublishedMetadata(pkg, 'abc123', {
      version: '2.1.0',
      gitHead: 'def456',
    }),
  );
  assert.throws(() => assertPublishedMetadata(pkg, 'abc123', undefined));
});
