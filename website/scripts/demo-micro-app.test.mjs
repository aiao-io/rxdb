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

test('wujie cssLoader rewrites :root to :host so daisyUI tokens stay in Shadow DOM', async () => {
  const source = readFileSync(join(root, 'src/components/DemoMicroAppClient.tsx'), 'utf8');
  const match = /function rewriteRootToHost\(code: string\): string \{\n  return code\.replaceAll\('([^']+)', '([^']+)'\);\n\}/.exec(
    source
  );
  assert.ok(match, 'rewriteRootToHost should replace a CSS selector');
  const [, from, to] = match;
  assert.equal(from, ':root');
  assert.equal(to, ':host');
  const rewritten = ':root { --color-primary: red }'.replaceAll(from, to);
  assert.equal(rewritten, ':host { --color-primary: red }');
  assert.doesNotMatch(rewritten, /:root/);
  assert.match(source, /cssLoader/);
  assert.match(source, /WujieReact\.bus/);
  const daisySelector =
    ':where(:is(:host, :root)),:is(:host, :root):has(.theme-controller:checked),[data-theme=light]';
  assert.equal(
    daisySelector.replaceAll(from, to),
    ':where(:is(:host, :host)),:is(:host, :host):has(.theme-controller:checked),[data-theme=light]'
  );
  assert.doesNotMatch(daisySelector.replaceAll(from, to), /:root/);
});

test('sub-apps declare daisyUI root as :is(:host, :root) so standalone and Shadow DOM both get tokens', () => {
  const files = [
    '../apps/dev-rxdb-angular/src/styles.scss',
    '../apps/dev-rxdb-react/src/styles.css',
    '../apps/dev-rxdb-vue/src/styles.css',
    '../benchmarks/src/styles.css'
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.match(
      source,
      /root:\s*':is\(:host, :root\)'/,
      `${file} should scope daisyUI to :is(:host, :root)`
    );
  }
});
