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

// 这一条正是 next-0915 评审里 collaboration/sync.md 的真实形态：
// 文档写 `const vm = rxdb.versionManager` 之后全程调 `vm.syncRepository()`，
// 单看调用行看不出问题 —— 所以判据取「同一文件里出现过 versionManager.<movedMethod>(」
test('versionManager 上调用已搬走的同步方法被抓出来', () => {
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

test('用到 versionManager 却不提 history 包', () => {
  const offenders = auditDoc('docs/branch.md', 'await rxdb.versionManager.createBranch("f1");');

  assert.deepEqual(offenders, ['docs/branch.md -> 用到 versionManager 却没提 @aiao/rxdb-plugin-history']);
});

test('提了 history 包就放行 —— core 不再自动创建这个实例，说清来源是全部要求', () => {
  const text = ['import { rxDBPluginHistory } from "@aiao/rxdb-plugin-history";', 'await rxdb.versionManager.createBranch("f1");'].join('\n');

  assert.deepEqual(auditDoc('docs/branch.md', text), []);
});

test('用到 syncManager 却不提 sync 包', () => {
  const offenders = auditDoc('docs/s.md', 'await rxdb.syncManager.push();');

  assert.deepEqual(offenders, ['docs/s.md -> 用到 syncManager 却没提 @aiao/rxdb-plugin-sync']);
});

// 评审 P1#2 的原形：指南只叫人装 querycache，engine 护栏过了、outbox 护栏抛
test('QueryCache 示例只列一个包 —— 缺的 sync / history 被点名', () => {
  const text = ['pnpm add @aiao/rxdb-plugin-querycache', 'rxdb.use(rxDBPluginQueryCache);'].join('\n');

  assert.deepEqual(auditDoc('docs/qc.md', text), [
    'docs/qc.md -> QueryCache 示例缺包：@aiao/rxdb-plugin-sync、@aiao/rxdb-plugin-history'
  ]);
});

test('三个包齐全时放行', () => {
  const text = [
    'pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache',
    'rxdb.use(rxDBPluginQueryCache);'
  ].join('\n');

  assert.deepEqual(auditDoc('docs/qc.md', text), []);
});
