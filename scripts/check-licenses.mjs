import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Runtime dependencies only: devDependencies are not distributed with the app.
const ALLOWED = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', '0BSD']);

function licensesOf(pkg) {
  const value = pkg.license;
  if (typeof value === 'string') return [value];
  if (value && value.type) return [value.type];
  return [];
}

const paths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const failures = [];
const seen = new Set();
for (const path of paths.slice(1)) {
  const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const licenses = licensesOf(pkg);
  if (!licenses.some((license) => ALLOWED.has(license))) {
    failures.push(`${key}: ${licenses.join(', ') || 'no license'}`);
  }
}

if (failures.length) {
  console.error('Runtime dependencies with non-allowlisted licenses:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`License check passed: ${seen.size} runtime packages, all ${[...ALLOWED].join('/')}.`);
