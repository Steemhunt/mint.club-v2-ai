import assert from 'node:assert/strict';
import {
  chmodSync,
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
const runner = resolve(root, 'scripts/check-full-audit.mjs');
const allowedAdvisory =
  'https://github.com/advisories/GHSA-4g63-c64m-25w9';

function auditReport(vulnerabilities) {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: Object.values(vulnerabilities).filter(
          ({ severity }) => severity === 'high',
        ).length,
        critical: 0,
        total: Object.keys(vulnerabilities).length,
      },
    },
    vulnerabilities,
  };
}

function runPolicy(report) {
  const fakeBin = mkdtempSync(resolve(tmpdir(), 'mintclub-audit-test-'));
  const fakeNpm = resolve(fakeBin, 'npm');
  writeFileSync(
    fakeNpm,
    '#!/usr/bin/env node\nprocess.stdout.write(process.env.FAKE_AUDIT_REPORT);\nprocess.exitCode = 1;\n',
  );
  chmodSync(fakeNpm, 0o755);
  try {
    return spawnSync(process.execPath, [runner], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        FAKE_AUDIT_REPORT: JSON.stringify(report),
      },
    });
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

test('fails closed when a high advisory object has no URL', () => {
  const result = runPolicy(
    auditReport({
      '@openzeppelin/contracts': {
        severity: 'high',
        via: [{ severity: 'high', name: '@openzeppelin/contracts' }],
      },
    }),
  );

  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stderr}${result.stdout}`, /high.*URL|unresolved/i);
});

test('fails closed when a high via package reference cannot be resolved', () => {
  const result = runPolicy(
    auditReport({
      '@uniswap/universal-router-sdk': {
        severity: 'high',
        via: ['missing-package'],
      },
    }),
  );

  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stderr}${result.stdout}`, /missing-package|unresolved/i);
});

test('resolves multi-hop high package references to allowlisted advisory URLs', () => {
  const result = runPolicy(
    auditReport({
      '@uniswap/universal-router-sdk': {
        severity: 'high',
        via: ['@uniswap/swap-router-contracts'],
      },
      '@uniswap/swap-router-contracts': {
        severity: 'high',
        via: ['@openzeppelin/contracts'],
      },
      '@openzeppelin/contracts': {
        severity: 'high',
        via: [
          {
            severity: 'high',
            url: allowedAdvisory,
          },
        ],
      },
    }),
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /"observedHighPackages"/);
  assert.match(result.stdout, /matches the documented high-severity allowlist/);
});

test('rejects an allowlisted package with an unallowlisted advisory URL', () => {
  const result = runPolicy(
    auditReport({
      '@uniswap/swap-router-contracts': {
        severity: 'high',
        via: [
          {
            severity: 'high',
            url: 'https://github.com/advisories/GHSA-new1-new2-new3',
          },
        ],
      },
    }),
  );

  assert.equal(result.status, 1);
  assert.match(
    `${result.stderr}${result.stdout}`,
    /untriaged high advisories:.*GHSA-new1-new2-new3/is,
  );
});

test('locks only patched archive and HTTP clients for transitive tooling', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  );
  const lock = JSON.parse(
    readFileSync(resolve(root, 'package-lock.json'), 'utf8'),
  );
  const versionsFor = (packageName) => [
    ...new Set(
      Object.entries(lock.packages)
        .filter(([path]) =>
          path.endsWith(`node_modules/${packageName}`),
        )
        .map(([, manifest]) => manifest.version),
    ),
  ];

  const admZip = lock.packages['node_modules/adm-zip'];
  assert.equal(manifest.overrides['adm-zip'], '0.6.0');
  assert.deepEqual(versionsFor('adm-zip'), ['0.6.0']);
  assert.equal(
    admZip.resolved,
    'https://registry.npmjs.org/adm-zip/-/adm-zip-0.6.0.tgz',
  );
  assert.equal(
    admZip.integrity,
    'sha512-XleryMhbuksdKtofnWZ9Sk+4CUTbms4Mb/EU32SZwToAyZ5RgVos/ki8n+yr0LWHOGKuakbXTuuYNHLQjhddgg==',
  );
  assert.equal(admZip.dev, true);
  assert.equal(admZip.peer, true);
  assert.deepEqual(versionsFor('undici'), ['6.27.0']);
});
