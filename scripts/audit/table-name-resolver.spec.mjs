import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  FORMER_HOMES,
  PENDING_DERIVATIONS,
  RESOLVER_FILES,
  RESOLVER_VOCABULARY,
  auditSource,
  auditTableNames,
  checkVocabulary
} from './table-name-resolver.mjs';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const FILE = 'packages/rxdb-adapter-sqlite-core/src/query/example.ts';

const rulesOf = keys => keys.map(key => key.split('·')[1]);

// ---------------------------------------------------------------------------
// R1 原始拼名函数
// ---------------------------------------------------------------------------

test('R1 认得 get_table_name( 与 getTableName( 的直接调用', () => {
  assert.deepEqual(rulesOf(auditSource(FILE, 'const a = get_table_name(meta.tableName, meta.namespace);')), ['R1']);
  assert.deepEqual(rulesOf(auditSource(FILE, "const a = getTableName('todo', 'public');")), ['R1']);
});

test('R1 不误报解析器的其他函数、对象方法与导出别名', () => {
  const source = [
    'const a = get_table_name_by_metadata(meta, tableSet);',
    'const b = getTableNameByMetadata(meta, tableSet);',
    'const c = executor.getTableName(meta);',
    'export { get_table_name as sqliteGetTableName } from "x";',
    'const d = get_table_name_info(name);'
  ].join('\n');
  assert.deepEqual(auditSource(FILE, source), []);
});

// ---------------------------------------------------------------------------
// R2 手拼物理名
// ---------------------------------------------------------------------------

test('R2 认得模板里「命名空间 + $」的拼法', () => {
  assert.deepEqual(rulesOf(auditSource(FILE, 'const t = `${metadata.namespace}$${metadata.tableName}`;')), ['R2']);
  assert.deepEqual(rulesOf(auditSource(FILE, 'const t = `${meta?.namespace}$x`;')), ['R2']);
});

test('R2 不误报只用了命名空间的普通模板', () => {
  assert.deepEqual(auditSource(FILE, 'const msg = `entity ${metadata.namespace}.${metadata.name}`;'), []);
});

// ---------------------------------------------------------------------------
// R3 把命名空间当 schema 用
// ---------------------------------------------------------------------------

test('R3 认得目录查询的参数对与目录键', () => {
  assert.deepEqual(rulesOf(auditSource(FILE, 'query(sql, [metadata.namespace, metadata.tableName]);')), ['R3']);
  assert.deepEqual(
    rulesOf(auditSource(FILE, 'set.has(`${branchMetadata.namespace}\\u0000${branchMetadata.tableName}`);')),
    ['R3']
  );
});

test('R3 不误报走了解析器的写法', () => {
  assert.deepEqual(auditSource(FILE, 'query(sql, [getSchemaName(metadata, tableSet), metadata.tableName]);'), []);
});

// ---------------------------------------------------------------------------
// R4 把命名空间直接给 schema（US-314 B2.5）
// ---------------------------------------------------------------------------

test('R4 认得把命名空间直接给 schema 的字段与变量', () => {
  assert.deepEqual(rulesOf(auditSource(FILE, 'const ref = { schema: plan.namespace, table: plan.tableName };')), [
    'R4'
  ]);
  assert.deepEqual(rulesOf(auditSource(FILE, 'const ddl = { schema: metadata?.namespace };')), ['R4']);
  assert.deepEqual(rulesOf(auditSource(FILE, 'const schema = metadata.namespace;')), ['R4']);
});

test('R4 不误报走了解析器的写法、比较与类型标注', () => {
  const source = [
    'const ref = { schema: getSchemaName(metadata, tableSet), table: metadata.tableName };',
    'const ddl = { schema: plan.schema };',
    'if (schema === metadata.namespace) return;',
    'interface Ref { readonly schema: string; readonly namespace: string }',
    'const other = { schema: metadata.namespaceAlias };'
  ].join('\n');
  assert.deepEqual(auditSource(FILE, source), []);
});

// ---------------------------------------------------------------------------
// 扫描口径
// ---------------------------------------------------------------------------

test('注释里的旧写法不算数，字符串里的照样算（SQL 就拼在模板字面量里）', () => {
  const source = [
    '/** 名字由 `get_table_name(name, namespace)` 给出 */',
    '// const t = `${metadata.namespace}$${metadata.tableName}`;',
    'const sql = `SELECT * FROM "${get_table_name(m.tableName, m.namespace)}"`;'
  ].join('\n');
  assert.deepEqual(auditSource(FILE, source), [`${FILE}·R1·3`]);
});

test('解析器文件本身放行', () => {
  for (const file of RESOLVER_FILES) {
    assert.deepEqual(
      auditSource(file, 'export const get_table_name = (n, ns) => `${ns}$${n}`; get_table_name(a, b);'),
      []
    );
  }
});

test('键里的行号是命中所在的行', () => {
  const keys = auditSource(FILE, ['const a = 1;', '', "const b = getTableName('t');"].join('\n'));
  assert.deepEqual(keys, [`${FILE}·R1·3`]);
});

// ---------------------------------------------------------------------------
// 词表自检
// ---------------------------------------------------------------------------

test('词表自检：解析器少定义一个函数、或原先的住处又定义了原始拼名函数，都报出来', async () => {
  const sources = new Map();
  for (const file of Object.keys(RESOLVER_VOCABULARY)) sources.set(file, '');
  for (const [file, names] of Object.entries(FORMER_HOMES)) {
    sources.set(file, `export const ${names[0]} = () => '';`);
  }
  const problems = await checkVocabulary(async file => sources.get(file) ?? '');
  const expectedMissing = Object.values(RESOLVER_VOCABULARY).flat().length;
  const expectedRedefined = Object.keys(FORMER_HOMES).length;
  assert.equal(problems.length, expectedMissing + expectedRedefined);
});

test('词表自检：真实仓库对得上', async () => {
  const problems = await checkVocabulary(file => readFile(join(REPO_ROOT, file), 'utf8'));
  assert.deepEqual(problems, []);
});

// ---------------------------------------------------------------------------
// 整库
// ---------------------------------------------------------------------------

test('真实仓库通过：解析器之外没有自己推物理名的地方，登记表为空', async () => {
  assert.deepEqual(PENDING_DERIVATIONS, {});
  const { unregistered, stale, vocabulary } = await auditTableNames({ repoRoot: REPO_ROOT });
  assert.deepEqual(unregistered, []);
  assert.deepEqual(stale, []);
  assert.deepEqual(vocabulary, []);
});

test('登记了却已经不存在的条目报为 stale', async () => {
  const ghost = 'packages/rxdb-adapter-pglite/src/ghost.ts·R1·1';
  const { stale } = await auditTableNames({ repoRoot: REPO_ROOT, registry: { [ghost]: '测试用' } });
  assert.deepEqual(stale, [ghost]);
});
