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
const MIT_TERMS = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'mintclub-notices-test-'));
  return {
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function runGenerator(
  directory,
  metafile,
  output,
  locale = 'C',
  bundleName,
) {
  writeFileSync(resolve(directory, 'meta.json'), JSON.stringify(metafile));
  return spawnSync(
    process.execPath,
    [generator, 'meta.json', output, ...(bundleName ? [bundleName] : [])],
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

test('does not invent a copyright holder for manifest-only MIT packages', () => {
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
        author: 'Unverified Author',
      }),
    );
    writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');

    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/example-package/index.js': {} } },
      'notices.md',
    );

    assert.equal(result.status, 0, result.stderr);
    const notices = readFileSync(resolve(directory, 'notices.md'), 'utf8');
    assert.match(notices, /does not infer a copyright holder/);
    assert.doesNotMatch(notices, /Copyright \(c\)|Unverified Author/);
  } finally {
    cleanup();
  }
});

test('uses an MIT license embedded in a package README', () => {
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
    writeFileSync(
      resolve(packageRoot, 'README.md'),
      `# Example package

Copyright (c) 2026 Example Author

${MIT_TERMS}
`,
    );

    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/example-package/index.js': {} } },
      'notices.md',
    );

    assert.equal(result.status, 0, result.stderr);
    const notices = readFileSync(resolve(directory, 'notices.md'), 'utf8');
    assert.match(notices, /README\.md \(embedded license\)/);
    assert.match(notices, /Copyright \(c\) 2026 Example Author/);
    assert.doesNotMatch(notices, /does not infer a copyright holder/);
  } finally {
    cleanup();
  }
});

test('ignores a truncated MIT block embedded in a package README', () => {
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
    writeFileSync(
      resolve(packageRoot, 'README.md'),
      `Copyright (c) 2026 Example Author

Permission is hereby granted to use this software.

USE OR OTHER DEALINGS IN THE SOFTWARE.
`,
    );

    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/example-package/index.js': {} } },
      'notices.md',
    );

    assert.equal(result.status, 0, result.stderr);
    const notices = readFileSync(resolve(directory, 'notices.md'), 'utf8');
    assert.match(notices, /PACKAGE-MANIFEST-MIT\.txt/);
    assert.doesNotMatch(notices, /embedded license|Example Author/);
  } finally {
    cleanup();
  }
});

test('rejects an embedded MIT block for a non-MIT package manifest', () => {
  const { directory, cleanup } = fixture();
  try {
    const packageRoot = resolve(directory, 'node_modules/example-package');
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      resolve(packageRoot, 'package.json'),
      JSON.stringify({
        name: 'example-package',
        version: '1.0.0',
        license: 'ISC',
      }),
    );
    writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');
    writeFileSync(
      resolve(packageRoot, 'README.md'),
      `Copyright (c) 2026 Example Author

${MIT_TERMS}
`,
    );

    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/example-package/index.js': {} } },
      'notices.md',
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stderr}${result.stdout}`, /declares ISC/);
  } finally {
    cleanup();
  }
});

test('uses the exact curated license for a known package release', () => {
  const { directory, cleanup } = fixture();
  try {
    const packageRoot = resolve(
      directory,
      'node_modules/@ethersproject/logger',
    );
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      resolve(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@ethersproject/logger',
        version: '5.8.0',
        license: 'MIT',
      }),
    );
    writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');

    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/@ethersproject/logger/index.js': {} } },
      'notices.md',
    );

    assert.equal(result.status, 0, result.stderr);
    const notices = readFileSync(resolve(directory, 'notices.md'), 'utf8');
    assert.match(notices, /UPSTREAM-LICENSE\.md/);
    assert.match(notices, /Copyright \(c\) 2019 Richard Moore/);
    assert.doesNotMatch(notices, /does not infer a copyright holder/);
  } finally {
    cleanup();
  }
});

test('fails closed for a manifest-only package without an exact MIT declaration', () => {
  const { directory, cleanup } = fixture();
  try {
    const packageRoot = resolve(directory, 'node_modules/example-package');
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      resolve(packageRoot, 'package.json'),
      JSON.stringify({
        name: 'example-package',
        version: '1.0.0',
        license: 'ISC',
      }),
    );
    writeFileSync(resolve(packageRoot, 'index.js'), 'export {};\n');

    const result = runGenerator(
      directory,
      { inputs: { 'node_modules/example-package/index.js': {} } },
      'notices.md',
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stderr}${result.stdout}`, /declares ISC/);
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

    const english = runGenerator(
      directory,
      metafile,
      'notices-en.md',
      'en_US.UTF-8',
      'Mint Club MCP server',
    );
    const swedish = runGenerator(
      directory,
      metafile,
      'notices-sv.md',
      'sv_SE.UTF-8',
      'Mint Club MCP server',
    );
    assert.equal(english.status, 0, english.stderr);
    assert.equal(swedish.status, 0, swedish.stderr);
    assert.equal(
      readFileSync(resolve(directory, 'notices-en.md'), 'utf8'),
      readFileSync(resolve(directory, 'notices-sv.md'), 'utf8'),
    );
    assert.match(
      readFileSync(resolve(directory, 'notices-en.md'), 'utf8'),
      /The Mint Club MCP server bundle includes/,
    );
  } finally {
    cleanup();
  }
});
