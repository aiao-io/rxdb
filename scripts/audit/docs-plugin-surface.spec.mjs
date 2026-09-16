import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditDoc, auditMovedList, MOVED_SYNC_METHODS } from './docs-plugin-surface.mjs';

const HISTORY_SOURCE = ['  async createBranch(branchId) {', '  history(options) {'].join('\n');
const SYNC_SOURCE = MOVED_SYNC_METHODS.map(name => `  async ${name}(options) {`).join('\n');

test('名单里的方法都在 SyncManager 上、都不在 VersionManager 上', () => {
  assert.deepEqual(auditMovedList(HISTORY_SOURCE, SYNC_SOURCE), []);
});

test('方法被搬回 VersionManager —— 名单先炸，不等文档扫描', () => {
  const offenders = auditMovedList(`${HISTORY_SOURCE}\n  async push(options) {`, SYNC_SOURCE);

  assert.deepEqual(offenders, ['VersionManager 上仍有 push()：它没有真的搬走']);
});

test('SyncManager 上找不到名单里的方法 —— 名单已过期', () => {
  const offenders = auditMovedList(HISTORY_SOURCE, '  async push(options) {');

  assert.ok(offenders.some(o => o.includes('SyncManager 上没有 syncRepository()')));
});

test('versionManager 上直接调用已搬走的同步方法被抓出来', () => {
  const text = [
    '# 同步',
    '',
    'await rxdb.versionManager.syncRepository("public", "Todo");',
    '',
    '装 @aiao/rxdb-plugin-history 才有这个槽位。'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/sync.md', text), [
    'docs/sync.md:3 -> versionManager.syncRepository() 已移到 syncManager'
  ]);
});

test('```diff 块里的删除行不算 —— 迁移指南必须展示旧写法', () => {
  const text = [
    '```diff',
    '-await rxdb.versionManager.push();',
    '+await rxdb.syncManager.push();',
    '```',
    '装 @aiao/rxdb-plugin-history 与 @aiao/rxdb-plugin-sync'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/migration.md', text), []);
});

test('普通代码块里的删除行照抓 —— 只有 diff 围栏才有豁免', () => {
  const text = ['```ts', '-await rxdb.versionManager.push();', '```', '@aiao/rxdb-plugin-history'].join('\n');

  assert.ok(auditDoc('docs/x.md', text).some(o => o.includes('versionManager.push()')));
});

// 这才是 next-0915 评审里 collaboration/sync.md 在 merge-base 上的真实形态：
// `const vm = rxdb.versionManager` 之后全程调 `vm.syncRepository()`，
// 调用行里根本不出现 `versionManager.` —— 只看调用行的判据一条都抓不到
test('别名调用：const vm = rxdb.versionManager 之后调 vm.syncRepository()', () => {
  const text = [
    '# 同步',
    '',
    '```ts',
    'const vm = rxdb.versionManager;',
    'await vm.syncRepository("public", "Todo");',
    '```',
    '',
    '装 @aiao/rxdb-plugin-history 才有这个槽位。'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/sync.md', text), [
    'docs/sync.md:5 -> vm.syncRepository() 走的是 versionManager，已移到 syncManager'
  ]);
});

test('别名绑的是 syncManager 就不算 —— 那正是迁移之后的写法', () => {
  const text = ['```ts', 'const sync = rxdb.syncManager;', 'await sync.push();', '```', '@aiao/rxdb-plugin-sync'].join(
    '\n'
  );

  assert.deepEqual(auditDoc('docs/sync.md', text), []);
});

test('```diff 删除行里的别名绑定不登记 —— 那是「旧写法长这样」', () => {
  const text = [
    '```diff',
    '-const vm = rxdb.versionManager;',
    '-await vm.push();',
    '+const sync = rxdb.syncManager;',
    '+await sync.push();',
    '```',
    '@aiao/rxdb-plugin-history 与 @aiao/rxdb-plugin-sync'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/migration.md', text), []);
});

test('用到 versionManager 却不提 history 包', () => {
  const offenders = auditDoc('docs/branch.md', 'await rxdb.versionManager.createBranch("f1");');

  assert.deepEqual(offenders, ['docs/branch.md -> 用到 versionManager 却没提 @aiao/rxdb-plugin-history']);
});

test('提了 history 包就放行 —— core 不再自动创建这个实例，说清来源是全部要求', () => {
  const text = [
    'import { rxDBPluginHistory } from "@aiao/rxdb-plugin-history";',
    'await rxdb.versionManager.createBranch("f1");'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/branch.md', text), []);
});

test('用到 syncManager 却不提 sync 包', () => {
  const offenders = auditDoc('docs/s.md', 'await rxdb.syncManager.push();');

  assert.deepEqual(offenders, ['docs/s.md -> 用到 syncManager 却没提 @aiao/rxdb-plugin-sync']);
});

// 评审 P1#2 的原形：指南只叫人装 querycache，engine 护栏过了、outbox 护栏抛
test('QueryCache 示例只列一个包 —— 缺的 sync / history 被点名', () => {
  const text = ['pnpm add @aiao/rxdb-plugin-querycache', 'rxdb.use(rxDBPluginQueryCache);'].join('\n');

  // 包名与 use() 是两条独立判据：这份示例两条都不满足，两条都要点名
  assert.deepEqual(auditDoc('docs/qc.md', text), [
    'docs/qc.md -> QueryCache 示例缺包：@aiao/rxdb-plugin-sync、@aiao/rxdb-plugin-history',
    'docs/qc.md -> QueryCache 示例缺 use()：rxDBPluginSync、rxDBPluginHistory'
  ]);
});

// 列全包名 ≠ 装全插件：这正是 packages/rxdb-adapter-http/README.md 的真实形态
test('QueryCache 示例包名列全了、却只 use() 了一个 —— 照抄仍然 connect() 失败', () => {
  const text = [
    'pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache',
    'rxdb.use(rxDBPluginQueryCache);'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/qc.md', text), [
    'docs/qc.md -> QueryCache 示例缺 use()：rxDBPluginSync、rxDBPluginHistory'
  ]);
});

test('三个包装齐、也都 use() 了才放行', () => {
  const text = [
    'pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache',
    'rxdb.use(rxDBPluginHistory);',
    'rxdb.use(rxDBPluginSync);',
    'rxdb.use(rxDBPluginQueryCache);'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/qc.md', text), []);
});

test('只在正文提到工厂名、没有 use() 调用的文档不被牵连', () => {
  const text = [
    '本包导出 rxDBPluginQueryCache。',
    '@aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/qc.md', text), []);
});
