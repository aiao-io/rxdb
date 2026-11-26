import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
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

for (const entry of ['README.md', 'getting-started/README.md']) {
  test(`English ${entry} links directly to translated guides`, async () => {
    const docs = join(websiteRoot, 'i18n/en/docusaurus-plugin-content-docs/current');
    const markdown = await readFile(join(docs, entry), 'utf8');
    const links = [...markdown.matchAll(/\]\(([^\s:)#]+\.md)(?:#[^)]*)?\)/g)];
    assert.ok(links.length > 0);
    for (const [, href] of links) {
      const target = href.startsWith('/') ? href.slice(1) : join(dirname(entry), href);
      const translation = await readFile(join(docs, target), 'utf8');
      assert.match(translation, /^# .+/m, target);
    }
  });
}

async function walkMarkdown(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdown(full)));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

test('untranslated docs never use relative links to translated docs', async () => {
  // Docusaurus resolves ./ and ../ links only inside the linking file's own
  // content tree. In the English build an untranslated Chinese file renders as
  // fallback, so a relative link to a page that HAS a translation no longer
  // resolves and the strict English build fails. Rooted /path.md links resolve
  // in both locales, so those targets must be linked rooted.
  const docsRoot = join(websiteRoot, 'docs');
  const enRoot = join(websiteRoot, 'i18n/en/docusaurus-plugin-content-docs/current');
  const translated = new Set((await walkMarkdown(enRoot)).map(file => relative(enRoot, file)));
  // Generated API docs are excluded: they are rebuilt from TypeDoc and never
  // link to hand-written guides.
  const zhFiles = (await walkMarkdown(docsRoot)).filter(file => !relative(docsRoot, file).startsWith('api/'));
  const violations = [];
  for (const file of zhFiles) {
    const source = relative(docsRoot, file);
    if (translated.has(source)) continue; // the English build renders the translation instead
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/\]\(((?:\.\.?\/)[^)\s]*\.md)(?:#[^)]*)?\)/g)) {
      const target = join(dirname(source), match[1]);
      if (translated.has(target))
        violations.push(
          `${source}: relative link ${match[1]} targets translated doc ${target}; use a rooted link /${target}`
        );
    }
  }
  assert.deepEqual(violations, []);
});
