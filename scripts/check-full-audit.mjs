import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const allowedHighPackages = new Set([
  '@openzeppelin/contracts',
  '@uniswap/swap-router-contracts',
  '@uniswap/universal-router-sdk',
]);
const allowedHighAdvisories = new Set([
  'https://github.com/advisories/GHSA-4g63-c64m-25w9',
  'https://github.com/advisories/GHSA-xrc4-737v-9q75',
  'https://github.com/advisories/GHSA-qh9x-gcfh-pcrw',
  'https://github.com/advisories/GHSA-4h98-2769-gh6h',
  'https://github.com/advisories/GHSA-93hq-5wgc-jc82',
]);

const audit = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (!audit.stdout) {
  throw new Error(audit.stderr || 'npm audit did not produce JSON output');
}

const report = JSON.parse(audit.stdout);
if (report.error) {
  throw new Error(
    `npm audit failed: ${report.error.summary ?? report.error.message ?? JSON.stringify(report.error)}`,
  );
}
if (!report.metadata?.vulnerabilities || !report.vulnerabilities) {
  throw new Error('npm audit returned an unexpected report shape');
}
if (process.env.AUDIT_REPORT_PATH) {
  writeFileSync(process.env.AUDIT_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

const metadata = report.metadata?.vulnerabilities ?? {};
const highEntries = Object.entries(report.vulnerabilities ?? {}).filter(
  ([, vulnerability]) => vulnerability.severity === 'high',
);
const unexpectedPackages = highEntries
  .map(([name]) => name)
  .filter((name) => !allowedHighPackages.has(name));
const advisoryCache = new Map();
function highAdvisoriesFor(packageName, stack = []) {
  if (advisoryCache.has(packageName)) {
    return advisoryCache.get(packageName);
  }
  if (stack.includes(packageName)) {
    throw new Error(
      `Unresolved high advisory cycle: ${[...stack, packageName].join(' -> ')}`,
    );
  }

  const vulnerability = report.vulnerabilities[packageName];
  if (!vulnerability || typeof vulnerability !== 'object') {
    throw new Error(`Unresolved high via package reference: ${packageName}`);
  }
  if (!Array.isArray(vulnerability.via)) {
    throw new Error(`Unrecognized advisory list for ${packageName}`);
  }

  const urls = new Set();
  for (const item of vulnerability.via) {
    if (typeof item === 'string') {
      const referenced = report.vulnerabilities[item];
      if (!referenced || typeof referenced !== 'object') {
        throw new Error(`Unresolved high via package reference: ${item}`);
      }
      if (typeof referenced.severity !== 'string') {
        throw new Error(`Unrecognized severity for via package reference: ${item}`);
      }
      if (referenced.severity === 'high') {
        for (const url of highAdvisoriesFor(item, [...stack, packageName])) {
          urls.add(url);
        }
      }
      continue;
    }

    if (!item || typeof item !== 'object' || typeof item.severity !== 'string') {
      throw new Error(`Unrecognized advisory entry for ${packageName}`);
    }
    if (item.severity === 'high') {
      if (typeof item.url !== 'string' || item.url.trim().length === 0) {
        throw new Error(`High advisory for ${packageName} is missing a URL`);
      }
      urls.add(item.url);
    }
  }

  if (vulnerability.severity === 'high' && urls.size === 0) {
    throw new Error(`Unresolved high advisories for ${packageName}`);
  }
  advisoryCache.set(packageName, urls);
  return urls;
}

const observedHighAdvisories = new Set(
  highEntries.flatMap(([name]) => [...highAdvisoriesFor(name)]),
);
const unexpectedAdvisories = [...observedHighAdvisories].filter(
  (url) => !allowedHighAdvisories.has(url),
);

console.log(
  JSON.stringify(
    {
      vulnerabilities: metadata,
      observedHighPackages: highEntries.map(([name]) => name),
      observedHighAdvisories: [...observedHighAdvisories].sort(),
    },
    null,
    2,
  ),
);

if ((metadata.critical ?? 0) > 0) {
  throw new Error('Full dependency audit contains a critical vulnerability');
}
if (unexpectedPackages.length > 0) {
  throw new Error(
    `Full dependency audit contains untriaged high packages: ${unexpectedPackages.join(', ')}`,
  );
}
if (unexpectedAdvisories.length > 0) {
  throw new Error(
    `Full dependency audit contains untriaged high advisories: ${unexpectedAdvisories.join(', ')}`,
  );
}

console.log('Full dependency audit matches the documented high-severity allowlist.');
