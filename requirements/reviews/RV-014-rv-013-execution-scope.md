---
id: RV-014
title: RV-013 的继承 API 面与测试处置清单不完整
status: Open # Open / Resolved
created: 2026-09-16
updated: 2026-09-16
pr: # 修复 PR 链接，Resolved 时填
---

# Review：补齐 RV-013 的真实执行范围

## 结论

[RV-013](./RV-013-adapter-local-system-repository-helpers.md) 的核心判断成立：

- `localRxDBBranch()` / `localRxDBChange()` 不属于核心适配器契约；
- SQLite 侧没有生产调用者；
- PGlite 侧只被适配器自带的孤儿 `create_branch` 使用；
- 仓库内的活路径是 `VersionManager.createBranch()`，并不调用 `RxDBAdapterPGlite.createBranch()`；
- PGlite 孤儿实现缺少 history 插件实现已有的事务、executor 与远端查重。

因此删除方向不变。本项只补充 RV-013 漏掉或判错的执行范围；RV-013 原文不作为本项的修改目标。

## 问题

### 1. 活路径集成测试被误列为删除对象

[`version/create_branch.spec.ts`](../../packages/rxdb-adapter-pglite/src/__tests__/version/create_branch.spec.ts)
显式安装 `rxDBPluginHistory`，调用的是活路径：

```ts
db.use(rxDBPluginHistory);
const result = await rxdb.versionManager.createBranch('branch_01');
```

它没有导入或调用 `rxdb-adapter-pglite/src/version/create_branch.ts`，不能随孤儿实现删除。

相反，[`create_branch.unit.spec.ts`](../../packages/rxdb-adapter-pglite/src/__tests__/version/create_branch.unit.spec.ts)
直接导入孤儿实现，并在 mock 上提供 `localRxDBBranch` / `localRxDBChange`，应随实现一起删除。

### 2. 两组直接调用 `adapter.createBranch()` 的测试未完整纳入

[`RxDBAdapterPGlite.residual.unit.spec.ts`](../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.residual.unit.spec.ts)
的同一个用例不仅断言两个 helper，还直接调用待删方法：

```ts
expect(ad.localRxDBBranch()).toBeTruthy();
expect(ad.localRxDBChange()).toBeTruthy();
const branch = await ad.createBranch(`residual-branch-${Date.now()}`);
```

只删前两条断言会留下编译错误；这个用例应整体删除。

[`RxDBAdapterPGlite.mock-residual.spec.ts`](../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.mock-residual.spec.ts)
还 mock 了 `../version/create_branch.js`，并用 `adapter.createBranch()` 驱动 5 条 NOTIFY 管线断言：

```ts
vi.mock('../version/create_branch.js', () => ({ default: state.createBranch }));
await adapter.createBranch('generation-barrier');
```

删除模块与类方法后，这些测试不能原样保留。其真实被测对象是
[`flushPendingChangePipeline()`](../../packages/rxdb-adapter-pglite/src/change-pipeline.ts)，应把 generation barrier、
长通知链和超时诊断测试迁到该函数的直接单测；`switchBranch()` 的入口级冲刷与事件抑制断言继续留在适配器测试。

### 3. SQLite helper 的公开影响面不止一个基类

RV-013 以“定义出现在哪个文件”代替了“用户能从哪些公开类调用”。下列公开类都继承
[`RxDBAdapterSqliteBase`](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)，因而当前都具有两个 helper：

- `RxDBAdapterElectron`
- `RxDBAdapterTauri`
- `RxDBAdapterSqlite`（官方 SQLite）
- `RxDBAdapterSqlite`（sqlite-wasm）
- `RxDBAdapterWaSqlite`
- `RxDBAdapterSqliteai`
- `RxDBAdapterWaSqliteMiniProgram`

同理，公开子路径 `@aiao/rxdb-adapter-electron/pglite` 导出的
[`RxDBAdapterElectronPGlite`](../../packages/rxdb-adapter-electron/src/pglite/RxDBAdapterElectronPGlite.ts)
继承 `RxDBAdapterPGlite`，也会同时失去两个 helper 与 `createBranch()`。

这不改变“可以在 0.0.25 删除”的决策，但 PR 的破坏性说明、迁移说明和验证项目不能只写
`rxdb-adapter-sqlite-core`、`rxdb-adapter-pglite`、`rxdb-adapter-sqlite`。

### 4. 删除 helper 不能从机制上堵住绕开 executor

[`RxDBAdapterBase.getRepository()`](../../packages/rxdb/src/rxdb-adapter.ts) 仍是公开抽象方法：

```ts
public abstract getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;
```

删除两个一行别名后，调用方仍能在事务体内错误地写
`adapter.getRepository(RxDBBranch)`。因此准确收益是“删除冗余且误导性的公开捷径，并删除现存错误样本”，
不是“从机制上堵住绕开事务 executor”。真正的事务纪律仍由调用约定、代码审查和事务测试保证。

## 修复方案

### PR-1：SQLite helper

1. 按 RV-013 删除 `RxDBAdapterSqliteBase` 的两个 helper。
2. 删除基类中只验证 helper 存在的整个用例。
3. 将 3 个共享套件的 7 个调用改为显式 `getRepository(...)`。
4. 迁移说明列出所有继承该基类的公开适配器，而不是只写 sqlite-core。
5. 除 RV-013 已列项目外，至少对 electron、tauri、wa-sqlite、sqlite-wasm、sqliteai、miniprogram 做 typecheck/build 验证。

### PR-2：PGlite helper 与孤儿 `createBranch`

1. 删除 `RxDBAdapterPGlite` 的两个 helper、`createBranch()`、对应 import 和 `src/version/create_branch.ts`。
2. 删除直接测试孤儿实现的 `version/create_branch.unit.spec.ts`。
3. 保留 `version/create_branch.spec.ts` 和 `rxdb_adapter_create_branch.spec.ts`；两者测试的是 history 插件活路径。
4. 删除 `RxDBAdapterPGlite.residual.unit.spec.ts` 中组合 helper / `createBranch()` 的整个用例。
5. 从 `RxDBAdapterPGlite.mock-residual.spec.ts` 移除孤儿模块 mock 与直接调用；把纯变更管线行为迁到 `flushPendingChangePipeline()` 单测。
6. 按 RV-013 将其余 4 个 helper 调用改为显式 `getRepository(...)`。
7. 验证 `rxdb-adapter-pglite`，并对继承它的 `rxdb-adapter-electron/pglite` 做 typecheck/build。

## 不变项

- `requirements/api-baseline/*.json` 只记录顶层导出 `{ name, kind }`，不记录类成员，本项不更新基线。
- [`getLocalSystemRepositories()`](../../packages/rxdb/src/system/system-repositories.ts) 仍是事务外等待本地适配器就绪的公开替代入口。
- 事务内仍使用 `executor.getRepository(EntityType)`。

## 复验

```bash
rg -n --glob '*.ts' 'localRxDBBranch|localRxDBChange' packages
rg -n --glob '*.{ts,tsx}' '\.createBranch\(' apps modules packages
pnpm nx test rxdb-adapter-sqlite-core --skipRemoteCache
pnpm nx test rxdb-adapter-pglite --skipRemoteCache
pnpm nx run-many -t typecheck build --projects=rxdb-adapter-pglite,rxdb-adapter-electron,rxdb-adapter-sqlite-core,rxdb-adapter-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-wa-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-miniprogram,rxdb-adapter-tauri --skipRemoteCache
```

## 决策

✅ 继续执行 RV-013 的删除方向，但以本补充评审的影响面和测试处置清单为准。PR-1 是简单删除，
不是零破坏；PR-2 不能删除 history 插件的活路径集成测试。

## 解决记录

- [ ] PR-1 纳入继承 API 面与扩展验证矩阵
- [ ] PR-2 修正测试保留、删除与迁移清单
- [ ] 两个 PR 均合并，`status: Resolved`
