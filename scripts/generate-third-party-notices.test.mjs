import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generator = resolve(root, 'scripts/generate-third-party-notices.mjs');

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'mintclub-notices-test-'));
  return {
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function runGenerator(directory, metafile, output, locale = 'C') {
  writeFileSync(resolve(directory, 'meta.json'), JSON.stringify(metafile));
  return spawnSync(
    process.execPath,
    [generator, 'meta.json', output],
    {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, LANG: locale, LC_ALL: locale },
    },
  );
}

test('fails closed when a bundled node_modules input has no package manifest', () => {
  const { directory, cleanup } = fixture();
  try {
    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/missing-package/index.js': {} } },
      'notices.md',
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stderr}${result.stdout}`, /missing-package|unmapped/i);
  } finally {
    cleanup();
  }
});

test('deduplicates identical package identities installed at multiple roots', () => {
  const { directory, cleanup } = fixture();
  try {
    const roots = [
      resolve(directory, 'node_modules/example-package'),
      resolve(
        directory,
        'node_modules/parent/node_modules/example-package',
      ),
    ];
    for (const packageRoot of roots) {
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(
        resolve(packageRoot, 'package.json'),
        JSON.stringify({
          name: 'example-package',
          version: '1.0.0',
          license: 'MIT',
        }),
      );
      writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');
      writeFileSync(resolve(packageRoot, 'LICENSE'), 'Same license\n');
    }
    const result = runGenerator(
      directory,
      {
        inputs: {
          'node_modules/example-package/index.js': {},
          'node_modules/parent/node_modules/example-package/index.js': {},
        },
      },
      'notices.md',
    );

    assert.equal(result.status, 0, result.stderr);
    const notices = readFileSync(resolve(directory, 'notices.md'), 'utf8');
    assert.equal(
      notices.match(/^\| `example-package@1\.0\.0` \|/gm)?.length,
      1,
    );
  } finally {
    cleanup();
  }
});

test('generates byte-identical notices across host locales', () => {
  const { directory, cleanup } = fixture();
  try {
    const packageRoot = resolve(directory, 'node_modules/example-package');
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      resolve(packageRoot, 'package.json'),
      JSON.stringify({
        name: 'example-package',
        version: '1.0.0',
        license: 'MIT',
      }),
    );
    writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');
    writeFileSync(resolve(packageRoot, 'LICENSE.z'), 'License Z\n');
    writeFileSync(resolve(packageRoot, 'LICENSE.ä'), 'License A umlaut\n');
    const metafile = {
      inputs: { 'node_modules/example-package/index.js': {} },
    };

    const english = runGenerator(directory, metafile, 'notices-en.md', 'en_US.UTF-8');
    const swedish = runGenerator(directory, metafile, 'notices-sv.md', 'sv_SE.UTF-8');
    assert.equal(english.status, 0, english.stderr);
    assert.equal(swedish.status, 0, swedish.stderr);
    assert.equal(
      readFileSync(resolve(directory, 'notices-en.md'), 'utf8'),
      readFileSync(resolve(directory, 'notices-sv.md'), 'utf8'),
    );
  } finally {
    cleanup();
  }
});
