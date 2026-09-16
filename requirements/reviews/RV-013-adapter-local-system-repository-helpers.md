---
id: RV-013
title: 适配器上的 localRxDBBranch() / localRxDBChange() 应删除，及其带出的 PGlite 孤儿 createBranch
status: Open # Open / Resolved
created: 2026-09-16
updated: 2026-09-16
pr: # 修复 PR 链接，Resolved 时填
---

# Review：删除 `localRxDBBranch()` / `localRxDBChange()`

## 问题

两个适配器各自挂了一对取系统表仓储的便捷方法，做的事只有一行：

```ts
// RxDBAdapterSqliteBase
localRxDBBranch() {
  return this.getRepository(RxDBBranch) as SqliteRepository<typeof RxDBBranch>;
}
```

[`RxDBAdapterSqliteBase`](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 与
[`RxDBAdapterPGlite`](../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts) 各一对，
pglite 那对只是把 cast 换成了泛型参数。它们包住的
[`getRepository`](../../packages/rxdb/src/rxdb-adapter.ts) 本身就是核心适配器上的 `public abstract`：

```ts
public abstract getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;
```

### 1. 不在任何契约里，也没有第三个适配器实现

`RxDBAdapter` 抽象类上没有这两个方法（复验：`grep -n "localRxDB" packages/rxdb/src/rxdb-adapter.ts` 零命中）。
supabase / http / electron / miniprogram 适配器都没有同名方法。也就是说它们既不是抽象基类要求的，
也不是适配器间约定的写法，只是两个包各自长出来的局部习惯。

### 2. sqlite-core 那一对零生产调用者

复验：`grep -rn "localRxDBBranch\|localRxDBChange" packages --include='*.ts'` 排除
`__tests__` / `*.spec.ts` / `*.suite.ts` 后，sqlite-core 侧只剩定义本身。

### 3. pglite 那一对的唯一生产调用者，是一条没人走的分支创建实现

[`create_branch.ts`](../../packages/rxdb-adapter-pglite/src/version/create_branch.ts)（100 行）开头就取这两个仓储：

```ts
const localRxDBBranch = adapter.localRxDBBranch();
const localRxDBChange = adapter.localRxDBChange();
```

它由 `RxDBAdapterPGlite.createBranch` 调用，而这条链是孤儿：

| 判据                                 | 结果                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 核心适配器契约里有 `createBranch` 吗 | ❌ `grep -rn createBranch packages/rxdb/src`（排除测试）零命中。对比 `switchBranch` 是 `abstract switchBranch(options: SwitchBranchOptions)` |
| 别的适配器有吗                       | ❌ `grep -rn "async createBranch" packages/rxdb-adapter-*/src` 只命中 pglite 一处                                                            |
| 生产代码调用它吗                     | ❌ 全仓非测试的 `.createBranch(` 调用点（devtools ×2、angular/supabase demo ×3、rxdb-test suite ×1）全部是 `versionManager.createBranch`     |

真正在跑的是 [`VersionManager.createBranch`](../../packages/rxdb-plugin-history/src/VersionManager.ts) →
[`create_branch`](../../packages/rxdb-plugin-history/src/create-branch.ts)（154 行）。

而且孤儿版本不只是重复，是**更弱的**重复。plugin-history 版把「查重 → 解析分叉点 → 写入」
包进 `adapter.transaction`，并在事务里用 `executor.getRepository(...)`：

```ts
// 事务里还会再查一次。这一次是快速失败：它挡在远端往返之前，
```

pglite 孤儿版**没有事务、没有 executor、没有远端 `branchExists` 预检**
（复验：`grep -n "transaction\|branchExists\|executor" packages/rxdb-adapter-pglite/src/version/create_branch.ts` 零命中），
直接在适配器上拿仓储读写。plugin-history 的注释写明了这样做的后果：

> 一个在删除之前就解析完父分支的 `create_branch`，仍会在删除之后把子分支写进去，留下孤儿。

## 根因

`localRxDBBranch()` / `localRxDBChange()` 是**在适配器这一层**取系统仓储的入口。
而在适配器层取系统仓储，恰好等于「绕开事务 executor」——两个用途相反的东西共用了同一个便捷入口。

核心已经给出了两个分场景的规范入口：

- 事务外、需要等 `localAdapter$` 就绪：[`getLocalSystemRepositories(rxdb)`](../../packages/rxdb/src/system/system-repositories.ts)
- 事务内：`executor.getRepository(RxDBBranch)`

孤儿 `create_branch` 正是「有了便捷入口，就在错误的层写了一遍业务」的产物。

## 修复方案

拆两个 PR，减法方向一致但风险不同级。

### PR-1：删 sqlite-core 那一对（纯减法）

| 文件                                                                                                                          | 改动                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`RxDBAdapterSqliteBase.ts`](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)                            | 删两个方法                                                                            |
| `__tests__/RxDBAdapterSqliteBase.spec.ts`                                                                                     | 删「`localRxDBBranch` 与 `localRxDBChange` 返回系统实体仓库」整个用例（5 处断言）     |
| `__tests__/shared-version-branch.suite.ts`、`shared-system-schema-migration.suite.ts`、`shared-bigint-binary-entity.suite.ts` | 7 处断言改 `adapter.getRepository(RxDBChange) as SqliteRepository<typeof RxDBChange>` |

### PR-2：删 pglite 那一对 + 孤儿 `createBranch`

| 文件                                                                                                  | 改动                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`RxDBAdapterPGlite.ts`](../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)                 | 删两个方法 + `createBranch` + `rxdb_adapter_create_branch` import                                      |
| `src/version/create_branch.ts`                                                                        | 整个删                                                                                                 |
| `__tests__/version/create_branch.spec.ts`、`create_branch.unit.spec.ts`                               | 整个删（unit spec 的 mock 里那两个方法随之消失）                                                       |
| `__tests__/RxDBAdapterPGlite.residual.unit.spec.ts`                                                   | 删 `expect(ad.localRxDBBranch()).toBeTruthy()` 两行                                                    |
| `__tests__/system-schema-migration.spec.ts`、`bigint-binary.spec.ts`、`version/remove_branch.spec.ts` | 4 处断言改 `adapter.getRepository<typeof RxDBChange, PGliteRepository<typeof RxDBChange>>(RxDBChange)` |

**两个 PR 都不动 `requirements/api-baseline/*.json`**：基线只记顶层导出的 `{name, kind}`，类成员不在其中
（`createBranch` 也一样——它是 `RxDBAdapterPGlite` 的成员，不是顶层导出）。
`website/docs/api/**` 随 typedoc 重生成会变。

## 权衡

### 收益

| 收益                                                                            | 强度                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 删掉「在适配器层取系统仓储」这个入口，堵住绕开事务 executor 的写法              | 实证：现存的唯一一处用法（孤儿 `create_branch`）正是这么翻车的样本 |
| 删掉一份与 plugin-history 平行、且缺事务保护的分支创建实现（100 行 + 2 份测试） | 实证：三条判据都指向无人调用                                       |
| 两个适配器的公开面向核心契约收敛                                                | 推断：真正的收敛要等适配器契约本身梳理，本项只是不再往外长         |

### 代价

| 代价                                                     | 量级                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 破坏性变更：删 4 个适配器公开方法 + 1 个 PGlite 公开方法 | 0.0.25 pre-1.0；取系统表仓储本就不是应用侧该做的事                                                                       |
| 测试改写                                                 | 20 处引用 / 9 个文件。其中 7 处（3 个用例）是断言方法自身存在，随方法一起删；其余替换成 `getRepository(...)`，一行对一行 |
| 少了一个「顺手取系统仓储」的口子                         | 这正是目的；确有需要时用 `getLocalSystemRepositories(rxdb)`                                                              |

### 替代方案

| 方案                                           | 判定                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. 两对都删，孤儿 `createBranch` 一并删**    | ✅ 采纳。分两个 PR：sqlite-core 无争议先走，pglite 单独复核                                 |
| B. 只删 sqlite-core 那对，pglite 保留          | ⚠️ 半步。留着的那对仍然只服务孤儿代码，下次读到 `createBranch` 的人还是会以为它是活路径     |
| C. 上提到 `RxDBAdapter` 抽象类，统一五个适配器 | ❌ 反向：把一个「绕开 executor 的口子」标准化成契约，还要求另外三个适配器实现零调用者的方法 |
| D. 维持现状                                    | ❌ 孤儿实现继续被 CI 跑着、被读到、被当成参考实现抄                                         |

### 与 RV-012 的关系

无耦合。[RV-012](./RV-012-rxdb-branch-detree.md) 动的是 `RxDBBranch` 的实体元数据，
本项动的是适配器的方法面，两边改的文件不相交，可并行也可任意先后。

## 风险与复验

| 风险                                            | 处置                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 外部使用者直接调用了这两个方法                  | 迁移说明写明 `getLocalSystemRepositories(rxdb)` 与 `executor.getRepository(E)` 两个替代入口及适用场景                                        |
| `createBranch` 删除后 PGlite 的 NOTIFY 冲刷丢失 | 该方法体只是 `create_branch` + `#flushPendingChangePipeline()`；活路径的冲刷由 `switchBranch` / 变更管道各自负责，需在 PR-2 里跑分支用例确认 |

```bash
pnpm nx test rxdb-adapter-sqlite-core # shared-version-branch / shared-bigint-binary-entity / shared-system-schema-migration
pnpm nx test rxdb-adapter-pglite      # __tests__/version/* 与 bigint-binary、system-schema-migration
pnpm nx test rxdb-adapter-sqlite
pnpm nx run-many -t lint build --projects=rxdb-adapter-pglite,rxdb-adapter-sqlite-core,rxdb-adapter-sqlite
```

## 决策

✅ **值得做**。纯删除，不新增抽象。

PR-1（sqlite-core）零争议，可直接开。
PR-2（pglite）需在 PR 描述里单独说明 `createBranch` 的三条孤儿判据，便于复核人独立验证。

## 解决记录

- [ ] PR-1：删 sqlite-core 的两个方法
- [ ] PR-2：删 pglite 的两个方法 + 孤儿 `createBranch` / `version/create_branch.ts`
- [ ] 两个 PR 均合并，`status: Resolved`
