import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getPackageNames } from './build-website.mjs';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentFiles = [
  'docusaurus.config.ts',
  'src/components/home-sql-playground.tsx',
  'src/pages/architecture.tsx',
  'src/pages/benchmarks.tsx',
  'src/pages/comparison.tsx',
  'src/demos/angular.tsx',
  'src/demos/react.tsx',
  'src/demos/vue.tsx',
  'src/pages/demos/index.tsx',
  'src/pages/index.tsx'
];

const mixedPunctuationPattern = /\p{Script=Han}[,:]|[,:]\p{Script=Han}/gu;

test('uses full-width punctuation in Chinese interface copy', async () => {
  const violations = [];

  for (const relativePath of contentFiles) {
    const content = await readFile(join(websiteRoot, relativePath), 'utf8');
    const lines = content.split('\n');

    for (const [index, line] of lines.entries()) {
      if (mixedPunctuationPattern.test(line)) violations.push(`${relativePath}:${index + 1} ${line.trim()}`);
      mixedPunctuationPattern.lastIndex = 0;
    }
  }

  assert.deepEqual(violations, []);
});

test('兼容矩阵覆盖每个框架绑定声明的真实 peer 版本', async () => {
  const packagesRoot = join(websiteRoot, '..', 'packages');
  const matrix = await readFile(join(websiteRoot, 'docs/compatibility.md'), 'utf8');
  const rows = matrix.split('\n').filter(line => line.startsWith('|'));
  const violations = [];

  for (const name of getPackageNames()) {
    const manifest = JSON.parse(await readFile(join(packagesRoot, name, 'package.json'), 'utf8'));
    if (manifest.private) continue;
    const peers = Object.entries(manifest.peerDependencies ?? {});
    const frameworkPeers = peers.filter(([dependency]) => /^(?:@angular\/|react$|react-dom$|vue$)/.test(dependency));
    if (frameworkPeers.length === 0) continue;
    const row = rows.find(line => line.includes('`' + manifest.name + '`'));
    const expected = frameworkPeers.map(([dependency, version]) => dependency + ' ' + version);
    if (manifest.peerDependencies.rxjs) expected.push(manifest.peerDependencies.rxjs);
    for (const value of expected) {
      if (!row?.includes('`' + value + '`')) violations.push(manifest.name + ': ' + value);
    }
  }

  assert.deepEqual(violations, []);
});
