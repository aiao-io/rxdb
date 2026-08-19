import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('demo and benchmark pages embed sub-apps through wujie, not a raw iframe', () => {
  const files = [
    'src/pages/demos/angular.tsx',
    'src/pages/demos/react.tsx',
    'src/pages/demos/vue.tsx',
    'src/pages/benchmarks.tsx'
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(source, /DemoMicroApp/, `${file} should render DemoMicroApp`);
    assert.doesNotMatch(source, /<iframe[\s>]/, `${file} should not use a raw iframe`);
  }
});
