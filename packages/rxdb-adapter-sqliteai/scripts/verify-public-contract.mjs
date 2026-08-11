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
const bundle = await readFile(new URL('index.js', distUrl), 'utf8');

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
