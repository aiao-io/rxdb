import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  BULK_WRITE_METHODS,
  KNOWN_NON_PRIMITIVE_RECEIVERS,
  LINE_DRIFT_TOLERANCE,
  QUERY_CACHE_BULK_WRITE_CALLSITES,
  REGISTRY_SOURCE_FILE,
  TRUSTED_PRIMITIVE_SCOPES,
  auditRepository,
  auditSource,
  collectSourceFiles,
  enclosingFunctionLookup,
  findDeclarations,
  findPrimitiveCalls,
  isScannedSourcePath,
  parseRegistry,
  registryKeyOf
} from './working-tree-callsite-drift.mjs';

const PACKAGES_ROOT = new URL('../../packages/', import.meta.url).pathname;

/**
 * 登记表里真实存在的一行，拿来造「合规」的样本
 *
 * @remarks
 * `verifiedAtLine` 取 1：下面造的样本源码只有几行，而存档行号落到文件外就是一条违规
 * （`auditSource` 的行号核对）。取 1 让「合规样本」真的合规，不必每处都算行数。
 */
const SAMPLE = { file: 'merge-branch.ts', symbol: 'merge_branch', intent: 'merge_per_change', verifiedAtLine: 1 };

const declaration = ({ scope = 'executor', file = SAMPLE.file, symbol = SAMPLE.symbol, intent = SAMPLE.intent } = {}) =>
  `  declareTrustedWrite(${scope}, {\n    file: '${file}',\n    symbol: '${symbol}',\n    intent: TrustedWriteIntent.${intent}\n  });\n`;

/** 一个形状完整的受信调用点：具名函数 + 自报意图 + 真的调了写原语。 */
const trustedCallsite = (options = {}) =>
  [
    `export const ${options.symbol ?? SAMPLE.symbol} = async (version) => {`,
    declaration(options),
    '  await executor.mergeChanges(actions, undefined, false);',
    '};',
    ''
  ].join('\n');

const audit = (source, { relPath = `rxdb-plugin-history/src/${SAMPLE.file}`, rows = [SAMPLE] } = {}) =>
  auditSource({
    relPath,
    source,
    registryByKey: new Map(rows.map(row => [registryKeyOf(row), row])),
    seenKeys: new Set()
  });

const withTempRoot = async run => {
  const root = await mkdtemp(join(tmpdir(), 'wt-callsite-drift-'));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const writeSourceFile = async (root, relPath, source) => {
  const file = join(root, relPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source, 'utf8');
};

// ---------------------------------------------------------------------------
// 登记表的词法解析
// ---------------------------------------------------------------------------

test('parseRegistry 从真实源码解析出 9 行登记与 7 个意图', async () => {
  const { intents, rows } = parseRegistry(await readFile(join(PACKAGES_ROOT, REGISTRY_SOURCE_FILE), 'utf8'));
  assert.equal(rows.length, 9);
  assert.equal(intents.length, 7);
  assert.equal(new Set(rows.map(registryKeyOf)).size, 9, '9 行必须是 9 个不同的登记键');
  assert.ok(
    rows.every(row => Number.isInteger(row.verifiedAtLine) && row.verifiedAtLine > 0),
    '每一行都要解析出存档行号——解析不到就退化成「没有行号所以没有漂移」'
  );
  assert.deepEqual(
    rows.filter(row => row.file === 'merge-branch.ts').map(row => row.intent),
    ['merge_per_change', 'merge_squash'],
    '同文件的两条合并策略各占一行，合并成一行会让其中一条失去登记'
  );
});

test('parseRegistry 在解析不到表或枚举时抛，而不是当成「没有违规」', () => {
  // 空表退 0 是这条门禁最坏的失败形态：它与「全仓库都合规」逐字节相同。
  assert.throws(() => parseRegistry('export const TrustedWriteIntent = {\n} as const;\n'), /找不到|0 个成员/);
  assert.throws(
    () => parseRegistry("export const TrustedWriteIntent = {\n  a: 'a'\n} as const;\n"),
    /找不到 TRUSTED_CALLSITE_REGISTRY/
  );
});

test('parseRegistry 拒绝「成员名与值不同」的枚举', () => {
  // 本脚本两边都按成员名比对；一旦值与成员名分叉，比对的就是两样东西。
  const source = ['export const TrustedWriteIntent = {', "  merge_per_change: 'per_change'", '} as const;', ''].join(
    '\n'
  );
  assert.throws(() => parseRegistry(source), /按成员名比对/);
});

test('parseRegistry 拒绝登记表引用不存在的意图', () => {
  const source = [
    'export const TrustedWriteIntent = {',
    "  merge_squash: 'merge_squash'",
    '} as const;',
    'const TRUSTED_CALLSITE_REGISTRY: readonly TrustedCallsite[] = [',
    '  {',
    "    file: 'merge-branch.ts',",
    "    symbol: 'merge_branch',",
    "    writePrimitive: 'executor.mergeChanges',",
    '    intent: TrustedWriteIntent.merge_per_change,',
    "    entrance: 'domain_recompute',",
    '    verifiedAtLine: 127',
    '  }',
    '];',
    ''
  ].join('\n');
  assert.throws(() => parseRegistry(source), /不存在的意图/);
});

// ---------------------------------------------------------------------------
// 最内层具名函数
// ---------------------------------------------------------------------------

test('匿名回调不挡住外层具名方法', () => {
  // HistoryManager.invalidateRedoStack 的受信写就躺在 `this.#runSerialized(async () => {` 里。
  // 把这个匿名箭头叫成 `async()` 的话，登记键的 symbol 段永远对不上。
  const source = [
    'class HistoryManager {',
    '  async invalidateRedoStack(ids?: readonly number[]): Promise<void> {',
    '    return this.#runSerialized(async () => {',
    '      await adapter.switchBranch({ branchId, actions });',
    '    });',
    '  }',
    '}',
    ''
  ].join('\n');
  const at = enclosingFunctionLookup(source);
  assert.equal(at(source.indexOf('adapter.switchBranch')), 'invalidateRedoStack');
});

test('带返回类型标注的箭头常量能读出名字', () => {
  const source = [
    'export const merge_branch = async (',
    '  version: VersionManager,',
    '  options?: MergeBranchOptions',
    '): Promise<MergeBranchResult> => {',
    '  await executor.mergeChanges(actions, undefined, false);',
    '};',
    ''
  ].join('\n');
  const at = enclosingFunctionLookup(source);
  assert.equal(at(source.indexOf('executor.mergeChanges')), 'merge_branch');
});

test('单参数无括号箭头是匿名的，外层具名函数仍然可见', () => {
  const source = [
    'export const merge_branch = async (version) => {',
    '  await version.rxdb.transaction(async executor => {',
    '    await executor.mergeChanges(actions, undefined, false);',
    '  });',
    '};',
    ''
  ].join('\n');
  const at = enclosingFunctionLookup(source);
  assert.equal(at(source.indexOf('executor.mergeChanges')), 'merge_branch');
});

test('三元里的 `new X()` 不会被当成外层函数名', () => {
  // 真实回归：pullBatchOnce 第一版被认成 `LWWConflictResolver`，因为往回找 `)` 跨过了分号。
  const source = [
    'async function pullBatchOnce(vm) {',
    '  const resolver = option === undefined ? new LWWConflictResolver() : option;',
    '  try {',
    '    await executor.mergeChanges(actions, undefined, true);',
    '  } catch (error) {',
    '    throw error;',
    '  }',
    '}',
    ''
  ].join('\n');
  const at = enclosingFunctionLookup(source);
  assert.equal(at(source.indexOf('executor.mergeChanges')), 'pullBatchOnce');
});

test('控制流的花括号不是函数体', () => {
  const source = ['function outer() {', '  if (ready) {', '    run();', '  }', '}', ''].join('\n');
  const at = enclosingFunctionLookup(source);
  assert.equal(at(source.indexOf('run()')), 'outer');
});

test('顶层语句没有外层具名函数', () => {
  const at = enclosingFunctionLookup('await executor.mergeChanges(actions);\n');
  assert.equal(at(0), null);
});

// ---------------------------------------------------------------------------
// 声明与调用的提取
// ---------------------------------------------------------------------------

test('findDeclarations 认出真实形状，并解析出外层具名函数', () => {
  const found = findDeclarations(trustedCallsite());
  assert.equal(found.length, 1);
  assert.deepEqual(
    { scope: found[0].scope, file: found[0].file, symbol: found[0].symbol, intent: found[0].intent },
    // `verifiedAtLine` 是登记表的存档列，调用点不自报它，所以这里只比对自报的四段。
    { scope: 'executor', file: SAMPLE.file, symbol: SAMPLE.symbol, intent: SAMPLE.intent }
  );
  assert.equal(found[0].enclosing, SAMPLE.symbol);
});

test('注释与字符串里的 declareTrustedWrite 不算声明', () => {
  const decoy = [
    '/**',
    ' * @example',
    ` * declareTrustedWrite(adapter, { file: '${SAMPLE.file}', symbol: '${SAMPLE.symbol}', intent: TrustedWriteIntent.${SAMPLE.intent} });`,
    ' */',
    `const hint = "declareTrustedWrite(executor, { file: '${SAMPLE.file}', symbol: '${SAMPLE.symbol}', intent: TrustedWriteIntent.${SAMPLE.intent} })";`,
    ''
  ].join('\n');
  assert.deepEqual(findDeclarations(decoy), []);
});

test('findPrimitiveCalls 不认注释与字符串里的调用', () => {
  const source = [
    '/** @example adapter.upsertMany("Product", rows) */',
    "const hint = 'this.adapter.deleteByIds(name, ids)';",
    'export function real() {',
    '  return this.localAdapter.upsertMany(entityName, rows);',
    '}',
    ''
  ].join('\n');
  assert.deepEqual(
    findPrimitiveCalls(source).map(call => `${call.receiver}.${call.method}`),
    ['this.localAdapter.upsertMany']
  );
});

test('接口成员与 abstract 声明没有接收者，不算调用点', () => {
  const source = [
    'export interface LocalWritePort {',
    '  upsertMany(entityName: string, rows: object[]): Observable<void>;',
    '  deleteByIds(entityName: string, ids: string[]): Observable<void>;',
    '}',
    'abstract mergeChanges(actions: Actions): Promise<void>;',
    ''
  ].join('\n');
  assert.deepEqual(findPrimitiveCalls(source), []);
});

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

test('形状完整的受信调用点通过', () => {
  assert.deepEqual(audit(trustedCallsite()), []);
});

test('没有意图标记的批量重写按未知入口拒绝', () => {
  const source = [
    'export const merge_branch = async (version) => {',
    '  await executor.mergeChanges(actions, undefined, false);',
    '};',
    ''
  ].join('\n');
  const offenders = audit(source);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /没有 declareTrustedWrite\(\)：未携带意图标记的批量重写按未知入口拒绝/);
});

test('symbol 报成委托门面会被指出来', () => {
  // 这是运行时的 declareTrustedWrite 查不出来的一类：键在表里，自报的函数却不是发起写的那个。
  const source = [
    'export const merge_branch = async (version) => {',
    '  return await doMerge(version);',
    '};',
    'const doMerge = async (version) => {',
    declaration(),
    '  await executor.mergeChanges(actions, undefined, false);',
    '};',
    ''
  ].join('\n');
  const offenders = audit(source);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /最内层具名函数却是 'doMerge'.*不是委托门面/s);
});

test('登记键不在表里就报出来', () => {
  const offenders = audit(trustedCallsite(), { rows: [] });
  assert.ok(
    offenders.some(offender => offender.includes('不在 TRUSTED_CALLSITE_REGISTRY 里')),
    offenders.join('\n')
  );
});

test('自报的文件名与真实文件不符会被指出来', () => {
  const offenders = audit(trustedCallsite(), { relPath: 'rxdb-plugin-history/src/other-file.ts' });
  assert.ok(
    offenders.some(offender => offender.includes("自报 file 为 'merge-branch.ts'，实际在 other-file.ts")),
    offenders.join('\n')
  );
});

test('声明挂在不是写原语宿主的变量上会被指出来', () => {
  const source = [
    'export const merge_branch = async (version) => {',
    declaration({ scope: 'repo' }),
    '  await executor.mergeChanges(actions, undefined, false);',
    '};',
    ''
  ].join('\n');
  const offenders = audit(source);
  assert.ok(
    offenders.some(offender => offender.includes('作用域实参是 `repo`')),
    offenders.join('\n')
  );
});

test('QueryCache 那两处批量写放行，换个接收者就拒绝', () => {
  for (const allowed of QUERY_CACHE_BULK_WRITE_CALLSITES) {
    const [relPath, receiver] = allowed.split('·');
    const source = `export function save() {\n  return ${receiver}.upsertMany(this.entityName, rows);\n}\n`;
    assert.deepEqual(audit(source, { relPath }), [], allowed);
  }

  const [relPath] = QUERY_CACHE_BULK_WRITE_CALLSITES[0].split('·');
  const drifted = audit(`export function save() {\n  return this.remoteAdapter.upsertMany(name, rows);\n}\n`, {
    relPath
  });
  assert.equal(drifted.length, 1);
  assert.match(drifted[0], /只许打 QueryCache/);
});

test('存档行号漂出文件就报出来', () => {
  // 行号落到文件外意味着核对的根本不是这一版代码；US-025 抽包时 #1 就是这么漂的。
  const offenders = audit(trustedCallsite(), { rows: [{ ...SAMPLE, verifiedAtLine: 9001 }] });
  assert.equal(offenders.length, 1, offenders.join('\n'));
  assert.match(offenders[0], /落在 merge-branch\.ts（共 \d+ 行）之外/);
});

test('存档行号漂过容差就报出来，容差之内放行', () => {
  const padding = Array.from({ length: 100 }, () => '').join('\n');
  const source = [padding, trustedCallsite(), padding].join('\n');
  const declaredLine = source.split('\n').findIndex(line => line.includes('declareTrustedWrite')) + 1;

  assert.deepEqual(audit(source, { rows: [{ ...SAMPLE, verifiedAtLine: declaredLine + LINE_DRIFT_TOLERANCE }] }), []);

  const drifted = audit(source, { rows: [{ ...SAMPLE, verifiedAtLine: declaredLine + LINE_DRIFT_TOLERANCE + 1 }] });
  assert.equal(drifted.length, 1, drifted.join('\n'));
  assert.match(drifted[0], new RegExp(`相差 ${LINE_DRIFT_TOLERANCE + 1} 行`));
});

test('业务实体上的两个批量写方法都拒绝', () => {
  for (const method of BULK_WRITE_METHODS) {
    const offenders = audit(`export function save() {\n  return this.adapter.${method}(this.entityName, rows);\n}\n`, {
      relPath: 'rxdb/src/repository/ProductRepository.ts'
    });
    assert.equal(offenders.length, 1, method);
    assert.match(offenders[0], /绕开了工作树捕获/);
  }
});

test('登记在案的门面与远端重载放行', () => {
  for (const receiver of Object.keys(KNOWN_NON_PRIMITIVE_RECEIVERS)) {
    const source = `export function run() {\n  return ${receiver}.switchBranch(branchId);\n}\n`;
    assert.deepEqual(audit(source, { relPath: 'rxdb-devtools/src/connector.ts' }), [], receiver);
  }
});

test('没登记过的接收者按未知入口拒绝，而不是静默跳过', () => {
  // 有人把 `const { adapter } = …` 改名成 `const { localAdapter } = …`，那处受信写就会从第 1 类
  // 掉进「不认识」。静默跳过的话，门禁安静地少管一个地方——而那正是它存在的理由。
  const source = 'export function run() {\n  return someHandle.mergeChanges(actions);\n}\n';
  const offenders = audit(source, { relPath: 'rxdb-plugin-history/src/other.ts' });
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /按未知入口拒绝/);
  assert.ok(
    TRUSTED_PRIMITIVE_SCOPES.every(scope => offenders[0].includes(scope)),
    '拒绝信息要写清楚合法的宿主名是哪几个'
  );
});

test('不在具名函数里的受信写拒绝', () => {
  const offenders = audit('await executor.mergeChanges(actions, undefined, false);\n');
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /不在任何具名函数里/);
});

// ---------------------------------------------------------------------------
// 扫描范围
// ---------------------------------------------------------------------------

test('isScannedSourcePath 排除 dist / out-tsc / __tests__ / suite / spec', () => {
  const excluded = [
    'rxdb/dist/repository/QueryCacheRepository.js',
    'rxdb/dist/repository/QueryCacheRepository.ts',
    'rxdb/out-tsc/vitest/version/merge-branch.ts',
    'rxdb/src/__tests__/working-tree/entry-fold.spec.ts',
    'rxdb/src/__tests__/working-tree/fixtures/probe.ts',
    'rxdb/src/working-tree/testing/commit.suite.ts',
    'rxdb-plugin-history/src/merge-branch.spec.ts',
    'rxdb/src/index.d.ts',
    'rxdb/node_modules/dep/index.ts'
  ];
  assert.deepEqual(excluded.filter(isScannedSourcePath), []);
  assert.ok(isScannedSourcePath('rxdb-plugin-history/src/merge-branch.ts'));
  assert.ok(isScannedSourcePath('rxdb/src/distributed/plan.ts'), '排除的是路径段，不是子串');
});

test('collectSourceFiles 按同一套规则过滤真实目录树', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, 'pkg/src/keep.ts', '');
    await writeSourceFile(root, 'pkg/src/skip.spec.ts', '');
    await writeSourceFile(root, 'pkg/src/skip.suite.ts', '');
    await writeSourceFile(root, 'pkg/src/__tests__/skip.ts', '');
    await writeSourceFile(root, 'pkg/dist/skip.ts', '');
    await writeSourceFile(root, 'pkg/out-tsc/skip.ts', '');
    await writeSourceFile(root, 'pkg/src/readme.md', '');
    assert.deepEqual(await collectSourceFiles(root), ['pkg/src/keep.ts']);
  });
});

// ---------------------------------------------------------------------------
// 真实仓库
// ---------------------------------------------------------------------------

test('真实仓库当前没有漂移，9 行登记全部找得到', async () => {
  const result = await auditRepository({ packagesRoot: PACKAGES_ROOT });
  assert.deepEqual(result.offenders, [], result.offenders.join('\n'));
  assert.equal(result.seenKeys.size, result.registry.rows.length);
  assert.ok(result.files > 500, `只扫到 ${result.files} 个文件，扫描范围疑似塌了`);
});
