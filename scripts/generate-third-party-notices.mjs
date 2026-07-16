import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareText,
  packagesFromMetafile,
} from './third-party-packages.mjs';

const [metafilePath, outputPath] = process.argv.slice(2);
if (!metafilePath || !outputPath) {
  throw new Error(
    'Usage: node generate-third-party-notices.mjs <metafile.json> <output.md>',
  );
}

const cwd = process.cwd();
const metafile = JSON.parse(readFileSync(resolve(cwd, metafilePath), 'utf8'));

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

function declaredMitFallback(manifest) {
  if (manifest.license !== 'MIT') {
    throw new Error(
      `Bundled package ${manifest.name}@${manifest.version} declares ${String(manifest.license ?? 'no license')} but ships no LICENSE/NOTICE/COPYING file`,
    );
  }
  const author =
    typeof manifest.author === 'string'
      ? manifest.author.replace(/\s*<[^>]+>.*$/, '').trim()
      : `${manifest.name} contributors`;
  const copyright =
    manifest.name === '@ethersproject/logger'
      ? 'Copyright (c) 2019 Richard Moore'
      : `Copyright (c) ${author}`;
  return {
    name: 'DECLARED-MIT.txt',
    text: `MIT License\n\n${copyright}\n\n${MIT_TERMS}`,
  };
}

const packageCopies = packagesFromMetafile(metafile, cwd).map(
  ({ directory, manifest }) => {
    let legalFiles = readdirSync(directory)
      .filter((name) => /^(?:licen[cs]e|copying|notice)(?:\..*)?$/i.test(name))
      .sort(compareText)
      .map((name) => ({
        name,
        text: readFileSync(resolve(directory, name), 'utf8')
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n')
          .trim(),
      }))
      .filter(({ text }) => text.length > 0);

    if (legalFiles.length === 0) {
      legalFiles = [declaredMitFallback(manifest)];
    }

    return {
      name: manifest.name,
      version: manifest.version,
      declaredLicense:
        typeof manifest.license === 'string'
          ? manifest.license
          : JSON.stringify(manifest.license ?? 'UNDECLARED'),
      legalFiles,
    };
  },
);

const packagesByIdentity = new Map();
for (const pkg of packageCopies) {
  const identity = `${pkg.name}@${pkg.version}`;
  const existing = packagesByIdentity.get(identity);
  if (existing && JSON.stringify(existing) !== JSON.stringify(pkg)) {
    throw new Error(
      `Bundled copies of ${identity} have conflicting license metadata`,
    );
  }
  packagesByIdentity.set(identity, pkg);
}
const packages = [...packagesByIdentity.values()].sort((left, right) =>
  compareText(`${left.name}@${left.version}`, `${right.name}@${right.version}`),
);

const legalGroups = new Map();
for (const pkg of packages) {
  for (const file of pkg.legalFiles) {
    const hash = createHash('sha256').update(file.text).digest('hex');
    const group = legalGroups.get(hash) ?? {
      text: file.text,
      packages: [],
    };
    group.packages.push(`${pkg.name}@${pkg.version} (${file.name})`);
    legalGroups.set(hash, group);
  }
}

function cell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const lines = [
  '# Third-Party Notices',
  '',
  '> Generated from the Bun bundle metafile by `scripts/generate-third-party-notices.mjs`.',
  '> Do not edit manually; run `npm run build` from the repository root.',
  '',
  'The Mint Club CLI bundle includes the following third-party packages:',
  '',
  '| Package | Version | Declared license |',
  '| --- | --- | --- |',
];

for (const pkg of packages) {
  lines.push(
    `| \`${cell(pkg.name)}@${cell(pkg.version)}\` | ${cell(pkg.version)} | ${cell(pkg.declaredLicense)} |`,
  );
}

lines.push('', '## License and notice texts', '');
for (const [hash, group] of [...legalGroups.entries()].sort(([, left], [, right]) =>
  compareText(left.packages[0], right.packages[0]),
)) {
  lines.push(
    `### ${group.packages.join(', ')}`,
    '',
    `<!-- sha256:${hash} -->`,
    '',
    ...group.text.split('\n').map((line) => (line ? `    ${line}` : '')),
    '',
  );
}

while (lines.at(-1) === '') lines.pop();
writeFileSync(resolve(cwd, outputPath), `${lines.join('\n')}\n`);
console.log(
  `Generated ${outputPath} for ${packages.length} bundled third-party packages (${legalGroups.size} unique legal texts).`,
);
