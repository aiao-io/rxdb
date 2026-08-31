import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const packageUrl = new URL('../package.json', import.meta.url);
const distUrl = new URL('../dist/', import.meta.url);
const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'));
const declarationNames = (await readdir(distUrl)).filter(name => name.endsWith('.d.ts'));

assert.equal(packageJson.main, './dist/index.js');
assert.equal(packageJson.types, './dist/index.d.ts');
assert.equal(packageJson.exports['.'].types, './dist/index.d.ts');
assert.ok(declarationNames.length > 0, 'dist must contain declarations');

for (const declarationName of declarationNames) {
  const declaration = await readFile(new URL(declarationName, distUrl), 'utf8');
  assert.doesNotMatch(declaration, /(?:\.\.\/)+packages\//, `${declarationName} leaks a workspace path`);
  assert.doesNotMatch(declaration, /from ['"][^'"]+\.ts['"]/, `${declarationName} imports TypeScript source`);
}

const indexDeclaration = await readFile(new URL('index.d.ts', distUrl), 'utf8');
const interfaceDeclaration = await readFile(new URL('sqliteai.interface.d.ts', distUrl), 'utf8');

/**
 * 从 `index.js` 出发沿相对 import 递归收集整份产物文本。
 *
 * 只读 `index.js` 是不行的：多入口（`index` + `testing`）构建会把共享实现拆成
 * chunk，`index.js` 只剩再导出。断言「实现被打进包里」的对象是**入口可达的整个
 * 产物图**，不是入口文件这一个文件——盯着单个文件，加一个入口就会把它变成假红。
 */
const readReachableBundle = async (entry, seen = new Set()) => {
  if (seen.has(entry)) return '';
  seen.add(entry);
  const source = await readFile(new URL(entry, distUrl), 'utf8');
  const specifiers = [...source.matchAll(/from\s*["'](\.[^"']+)["']/g)].map(match => match[1]);
  const parts = await Promise.all(
    specifiers.map(specifier => readReachableBundle(specifier.replace(/^\.\//, ''), seen))
  );
  return [source, ...parts].join('\n');
};

const bundle = await readReachableBundle('index.js');

assert.match(indexDeclaration, /from '@aiao\/rxdb-adapter-sqlite-core'/);
assert.match(interfaceDeclaration, /from '@aiao\/rxdb'/);
assert.match(interfaceDeclaration, /from '@aiao\/rxdb-adapter-sqlite-core'/);
assert.match(bundle, /withGlobalOo1LoadLock/);
assert.match(bundle, /opfsFallback/);

const publicApi = await import('@aiao/rxdb-adapter-sqliteai');
for (const exportName of [
  'BATCH_TIMEOUT',
  'ROWID',
  'RxDBAdapterSqliteError',
  'RxDBAdapterSqliteai',
  'SqliteRepository',
  'SqliteaiClient',
  'buildRuleGroup',
  'createSqliteClient',
  'sqliteGetTableName',
  'sqliteGetTableNameByMetadata',
  'sqliteaiLoad'
]) {
  assert.ok(exportName in publicApi, `missing public export: ${exportName}`);
}
