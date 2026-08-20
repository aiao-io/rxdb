---
id: RV-010
title: next-lifecycle 相对 main 的独立复审（RV-009 修完之后）
status: Open
created: 2026-08-21
updated: 2026-08-21
pr:
---

# Review：`next-lifecycle` vs `main`（复审）

**判定：🟡 修完 #1 再合，不修也能合但要知情。** 前置：[RV-009](./RV-009-next-lifecycle-vs-main.md) 的 8 项已修，不在此重复。

## 范围

| 项                 | 值                                      |
| ------------------ | --------------------------------------- |
| 分支               | `next-lifecycle`                        |
| 对比基线           | `main...next-lifecycle`                 |
| merge-base         | `c25f93b`                               |
| 变更量             | 56 文件，+3952 / -570                   |
| 相对 `main` 提交数 | 22                                      |
| 前置评审           | [RV-009](./RV-009-next-lifecycle-vs-main.md) |

相对 RV-009 多出来的 diff 就是它自己的修。工作区相对 HEAD 有未提交的缩进 / 术语改写，不在本次评审里。

## Findings

### 1. P2：search 的 `destroy()` 是为跨纪元状态机留的，`init()` 失败路径却不调它

[RxDB.ts](../../packages/rxdb/src/RxDB.ts#L333-L362) 的 `init()`：`#install_plugin()` 在 try 外；schema / entity / version 抛错只做 `#rxdb_initialized = false` + `void #release_connection_scope()`。`#destroy_plugin()` 只在 `#shutdown()` 里走（[:747](../../packages/rxdb/src/RxDB.ts#L747)）；`#plugin_install_promises` 也只在 `#shutdown` 清空（[:766](../../packages/rxdb/src/RxDB.ts#L766)）。

[search plugin](../../packages/rxdb-plugin-search/src/plugin.ts#L151-L191) **不**声明 `lifecycle: 'scoped'`。注释写得很清楚：entity 事件已经交给作用域，但 `#phase` / `#installEpoch` / `#searchPlans` / `#installPromise` 描述的是插件实例**跨纪元**的可用性，不属于「本次连接产生的宿主改动」，所以宿主释放完作用域后仍应调用 `destroy()` 把状态机复位。部分迁移的判断是对的——配套路径漏了。

被文档明确支持的失败序列：

1. 第一次 `init()` 装 search：`epoch++`（[:155](../../packages/rxdb-plugin-search/src/plugin.ts#L155)），绑事件，踢出 `#runInstall`，填 `#installPromise`，`#primeSearchEntries` 写入 plans。
2. schema 炸 → scope 释放（事件解绑）→ **不** `destroy()` → epoch / plans / `#installPromise` / `#phase = 'installing'` 全留着。
3. 同步重试 `init()` 走 `#install_one_plugin`（[:862](../../packages/rxdb/src/RxDB.ts#L862)）**覆盖** map，再装一遍。第二次 `install()` 再 `epoch++`。
4. 陈旧 `#runInstall` 写 `#engine` 被挡住（[:432](../../packages/rxdb-plugin-search/src/plugin.ts#L432)）。
5. 陈旧 `#runInstall` 的 **FTS DDL 挡不住**。它和重试那一轮都在等同一个 `adapterConnected$`。注释写「DDL 打在捕获的死适配器上，纪元换了自己会失败」——这条路径适配器从来没连上，重试 `connect()` 之后两边拿到的是**同一条活连接**。

`#primeSearchEntries` 在 `#searchPlans.length > 0` 时直接 return（[:443](../../packages/rxdb-plugin-search/src/plugin.ts#L443)）。没有 `destroy()` 清 plans，重试那一轮不会重扫实体——碰巧用上一轮的 plans，schema 真变了才会 silently 用旧计划。

对照 `main`：`init()` 失败本来就不调 `destroy()`。那边更糟——重复绑监听、两个 `#runInstall` 都能写 engine。本分支解绑 + epoch 挡住写 engine，是进步。**不是进步的是**：专门把 `destroy()` 留下来处理状态机，然后在唯一不走 `#shutdown` 的回滚上跳过它。

测试缺口两边都空：

- [plugin-lifecycle.spec.ts](../../packages/rxdb-plugin-search/src/__tests__/plugin-lifecycle.spec.ts#L452-L491) 的「旧纪元迟到 install」**默认 `destroy()` 被调用**（`await stale.scope.dispose(); plugin.destroy();`）。
- 宿主 `init()` 失败用例（[RxDB.plugin-scope.spec.ts](../../packages/rxdb/src/__tests__/RxDB.plugin-scope.spec.ts#L379)）只覆盖 `'scoped'` 插件。

FTS installer 有迁移水位线和认领冲突，重复 DDL 大概率不毁库，所以不是 🔴。但「文档支持的重试路径 + 唯一非 scoped 插件」没有测试，不算可忽略。

**修复**（二选一，别两头空）：

- `init()` 回滚对非 `'scoped'` 插件补调 `destroy()`，和 `#shutdown` 对称；或
- search 在 scope 上登记一条 disposer：释放时 `epoch++`、清 `#installPromise` / plans / phase。

无论哪条，加宿主级测试：search 已 `install`、schema `init` 抛、同步重试 `connect()`，断言 `installFtsForEntity` 只跑一轮（或陈旧 DDL 被中止），`ready` / plans 一致。

最低限度不修代码的退路：接受「`init()` 失败后必须 `disconnectAll()` 再连，不能同步重试 `init()` / `connect()`」并写进迁移文档——现在文档说的是相反的话。

### 2. P3：`#release()` 不进 `#inDisposerFrame`

[lifecycle-scope.ts](../../packages/utils/src/lifecycle/lifecycle-scope.ts#L241-L252) 手动句柄直接跑 disposer。RV-009 #1 的重入保护只圈住 `#callDisposer`（[:217](../../packages/utils/src/lifecycle/lifecycle-scope.ts#L217)）。

生产插件都丢掉了 `acquire()` 返回值，目前打不着。句柄 disposer 里 `return scope.dispose()` 会拿到 in-flight Promise，跟文档里「`await` 之后再 `dispose()` 自己会互锁」同一类坑。

**修复**：`#release()` 同样走 `#callDisposer`（或自己套同一对标志），或在 TSDoc 写明句柄这条路不支持自释放。

### 3. P3：workspace `ready` 未安装即 resolve

[RxDBPluginWorkspace.ts](../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L230-L232) 仍是 `#installPromise ?? Promise.resolve()`。search 同等条件下 reject（`destroyed` / `not installed`）。

对照 `main`：workspace 就是这样，`flush` 仍会抛，**不是回归**。但 [plugin-scope.md](../../website/docs/migration/plugin-scope.md) 把两个插件并列讲「断连后 ready」，读者会以为口径一致。

**修复**：迁移文档点明差异；不强制改 workspace 语义（那是既有契约）。

### 4. 过程，不是代码：提交信息不可用

22 条全是 `123` / `123123` / `23213`。合进去 history 就是噪声。squash 或重写成能读的再合。没有 PR。

## 总评

🟡 search 作为唯一非 scoped 插件，跟 `init()` 失败回滚对不齐
🔴 没有。重复 FTS DDL 有水位线兜底，不构成毁数据证据

## 解决记录

- [ ] #1 search 在 `init()` 失败路径复位状态机（宿主补 `destroy()`，或 search 把 epoch/plans/promise 挂到 scope disposer）+ 宿主级回归用例
- [ ] #2 `#release()` 套 `#inDisposerFrame`，或 TSDoc 写明句柄不支持自释放
- [ ] #3 迁移文档点明 workspace / search 的 `ready` 口径差异
- [ ] #4 squash / 重写提交信息
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
