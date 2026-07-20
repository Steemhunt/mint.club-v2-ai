import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareText,
  packagesFromMetafile,
} from './third-party-packages.mjs';

const [metafilePath, outputPath, bundleName = 'Mint Club CLI'] =
  process.argv.slice(2);
if (!metafilePath || !outputPath) {
  throw new Error(
    'Usage: node generate-third-party-notices.mjs <metafile.json> <output.md> [bundle-name]',
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

const curatedLegalFiles = new Map([
  [
    '@ethersproject/logger@5.8.0',
    {
      name: 'UPSTREAM-LICENSE.md',
      text: `MIT License

Copyright (c) 2019 Richard Moore

${MIT_TERMS}`,
    },
  ],
]);

function normalizedWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function embeddedReadmeLicense(directory) {
  const readme = readdirSync(directory).find((name) =>
    /^readme(?:\..*)?$/i.test(name),
  );
  if (!readme) return undefined;

  const text = readFileSync(resolve(directory, readme), 'utf8')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  const permissionStart = text.indexOf('Permission is hereby granted');
  const copyrightStart = text.lastIndexOf('Copyright ', permissionStart);
  const ending = /USE\s+OR\s+OTHER\s+DEALINGS\s+IN\s+THE\s+SOFTWARE\./i.exec(
    text.slice(permissionStart),
  );
  if (permissionStart < 0 || copyrightStart < 0 || !ending) {
    return undefined;
  }
  const licenseEnd = permissionStart + ending.index + ending[0].length;
  const terms = text.slice(permissionStart, licenseEnd);
  if (normalizedWhitespace(terms) !== normalizedWhitespace(MIT_TERMS)) {
    return undefined;
  }
  return {
    name: `${readme} (embedded license)`,
    text: text.slice(copyrightStart, licenseEnd).trim(),
  };
}

function requireDeclaredMit(manifest) {
  if (manifest.license !== 'MIT') {
    throw new Error(
      `Bundled package ${manifest.name}@${manifest.version} declares ${String(manifest.license ?? 'no license')} but ships no LICENSE/NOTICE/COPYING file`,
    );
  }
}

function declaredMitFallback(manifest) {
  requireDeclaredMit(manifest);
  return {
    name: 'PACKAGE-MANIFEST-MIT.txt',
    text: `MIT License

The published package manifest declares the MIT license but contains no separate LICENSE, NOTICE, or COPYING file. This generated notice does not infer a copyright holder.

${MIT_TERMS}`,
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
      requireDeclaredMit(manifest);
      const identity = `${manifest.name}@${manifest.version}`;
      legalFiles = [
        embeddedReadmeLicense(directory) ??
          curatedLegalFiles.get(identity) ??
          declaredMitFallback(manifest),
      ];
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
  `The ${bundleName} bundle includes the following third-party packages:`,
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
