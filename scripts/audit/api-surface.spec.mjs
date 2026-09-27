import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditNaming, extractExports } from './api-surface.mjs';

const fixtureSrc = fileURLToPath(new URL('./__fixtures__/api-surface/type-only-reexport/src/', import.meta.url));
const kindOf = (exports, name) => exports.find(e => e.name === name)?.kind;

test('`export type { Klass }` 记为 type —— 运行时没有这个值', () => {
  // 门禁存在的意义是拦「破坏性 API 变化」。把 `export { X }` 改成 `export type { X }`
  // 会抽掉运行时的值，所有 `new X()` / `extends X` 的使用者当场炸；若两种形式都记成
  // `both`，这次改动在基线 diff 里完全看不见。
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'Widget'), 'type');
});

test('逐 specifier 的 `export { type Klass }` 同样记为 type', () => {
  // 与语句级 type-only 是不同的 AST 形状（ExportSpecifier.isTypeOnly 而非
  // ExportDeclaration.isTypeOnly），只认一种就会漏掉另一种。
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'Gadget'), 'type');
});

test('值形式转出的类仍是 both —— 不能把所有类一律降级', () => {
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'Sprocket'), 'both');
});

test('纯类型与纯值不受影响', () => {
  const exports = extractExports(`${fixtureSrc}index.ts`, fixtureSrc);

  assert.equal(kindOf(exports, 'WidgetOptions'), 'type');
  assert.equal(kindOf(exports, 'VERSION'), 'value');
});

// —— SC-014 命名门禁（contracts/core-api.md §0）——————————————————————————————
//
// 这张表原先只写在契约文档里，宿主一栏指着本脚本，而本脚本一个字都没实现：基线 diff 只回答
// 「增没增」，从不回答「增的这个叫什么」。下面六条把那张表搬成断言。

test('核心新增导出不是 Commit* / WorkingTree* 前缀时拦下来', () => {
  // 名字故意挑一个只犯前缀这一条的：用 `IndexHint` 的话它同时撞上 `Index*` 禁用前缀，
  // 两条规则一起红，这条断言就分不清自己验的是哪一条了。
  const problems = auditNaming({ pkg: 'rxdb', currentNames: ['BranchSwitchHint'], addedNames: ['BranchSwitchHint'] });

  assert.equal(problems.length, 1);
  assert.match(problems[0], /BranchSwitchHint/);
});

test('核心新增导出是 Commit* / WorkingTree* 前缀时放行', () => {
  const added = ['CommitResult', 'WorkingTreeStatus'];

  assert.deepEqual(auditNaming({ pkg: 'rxdb', currentNames: added, addedNames: added }), []);
});

test('三个 RxDBBranch* 扩展点类型是**逐名登记**的例外，不是放宽前缀', () => {
  // 例外列成名单而不是加一条 `RxDBBranch` 前缀：加前缀之后，第四个同前缀的名字会静默通过，
  // 而这三个是插件系统扩展点（与既有 `RxDBBranchCreationContext` 同族），不是工作树契约。
  const added = ['RxDBBranchSwitchContext', 'RxDBBranchSwitchPreconditions', 'RxDBBranchRemovalContext'];
  assert.deepEqual(auditNaming({ pkg: 'rxdb', currentNames: added, addedNames: added }), []);

  const problems = auditNaming({
    pkg: 'rxdb',
    currentNames: ['RxDBBranchMergeContext'],
    addedNames: ['RxDBBranchMergeContext']
  });
  assert.equal(problems.length, 1);
});

test('`@aiao/rxdb/testing` 的测试台符号逐名放行，主入口同名照样拦', () => {
  // 这个子路径依赖 vitest（可选 peer），不进生产主入口，本就不在「核心共享契约」的射程内；
  // 但正向规则读的是整个 diff，所以只能逐名登记。第七个测试台符号得自己再走一遍这段理由。
  const added = ['collectEmissions', 'createHarnessQueryTask', 'EntityCache', 'METADATA'];
  assert.deepEqual(auditNaming({ pkg: 'rxdb', currentNames: added, addedNames: added }), []);

  const problems = auditNaming({ pkg: 'rxdb', currentNames: ['HarnessEntityMap'], addedNames: ['HarnessEntityMap'] });
  assert.equal(problems.length, 1);
});

test('US-217 备份契约的核心导出全部逐名登记——基线与导出同批提交时 diff 看不见它们', () => {
  // 正向规则只在名字第一次出现的那次运行里有效；备份契约的导出和基线在同一个分支里一起落地，
  // 门禁运行时 `added` 已经是空的。所以这里把基线里的备份族当成「新增」重判一次，
  // 第 N+1 个没登记理由的备份导出会在这里红，而不是悄悄进表面。
  const baseline = JSON.parse(
    readFileSync(new URL('../../requirements/api-baseline/rxdb.json', import.meta.url), 'utf8')
  );
  const added = baseline.entries['.']
    .map(entry => entry.name)
    .filter(name => /backup|^RxDBRestore|SchemaFingerprint$|^createSha256$|^Sha256Hasher$/i.test(name));

  assert.equal(added.length, 33);
  assert.deepEqual(auditNaming({ pkg: 'rxdb', currentNames: added, addedNames: added }), []);
});

test('前缀规则只管核心；插件包的新增导出不受它约束', () => {
  const added = ['assertSwitchBranchPreconditions'];

  assert.deepEqual(auditNaming({ pkg: 'rxdb-plugin-working-tree', currentNames: added, addedNames: added }), []);
});

test('`Index*` / `Workspace*` 按**当前全集**判，不是按 diff —— 否则更新一次基线就再也拦不住', () => {
  // 反向规则的失效方式很隐蔽：新增 `IndexHint` → 门禁红 → 有人跑 `--update` → 从此它进了基线，
  // `addedNames` 空了，规则永远绿。所以这两条读 `currentNames`。
  const problems = auditNaming({
    pkg: 'rxdb-plugin-search',
    currentNames: ['IndexHint', 'WorkspaceDraft'],
    addedNames: []
  });

  assert.equal(problems.length, 2);
});

test('workspace 插件自己那四个 Workspace* 与核心的 SwitchBranchOptions 是既有导出，不重复报', () => {
  // 名单是封闭的：本特性之前就在基线里的那几个，逐名列出。少了这一条，门禁从第一次运行起
  // 就是红的，而一条恒红的门禁与没有门禁是同一件事。
  assert.deepEqual(
    auditNaming({
      pkg: 'rxdb-plugin-workspace',
      currentNames: ['WorkspaceCacheEntry', 'WorkspaceCacheId', 'WorkspaceCorruptedEntry', 'WorkspaceFlushError'],
      addedNames: []
    }),
    []
  );
  assert.deepEqual(auditNaming({ pkg: 'rxdb', currentNames: ['SwitchBranchOptions'], addedNames: [] }), []);
});

test('复活 staging 词汇的导出在任何包里都拦', () => {
  for (const name of ['stagedChange', 'unstageChange', 'stagedCount']) {
    const problems = auditNaming({ pkg: 'rxdb-plugin-working-tree', currentNames: [name], addedNames: [name] });

    assert.equal(problems.length, 1, name);
  }
});

test('别的包复用 SwitchBranchOptions 这个名字照样拦', () => {
  const problems = auditNaming({
    pkg: 'rxdb-plugin-working-tree',
    currentNames: ['SwitchBranchOptions'],
    addedNames: ['SwitchBranchOptions']
  });

  assert.equal(problems.length, 1);
});
