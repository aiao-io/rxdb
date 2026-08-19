import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
