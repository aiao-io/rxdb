---
title: packages 2026-10-26 增量评审
status: IncrementalReview
baseline: ffed57da2d9b736f05e5b28c3876c4a7eefbefb9
incrementalFrom: 18ea576f144d10b0adfdbc570ea9970707d5a5db
reviewed: 2026-10-26
---

# packages 2026-10-26 增量评审

## 基线与方法

✅ 值得做。上轮报告最终随 PR #128 提交在 `18ea576f`（2026-10-16）；它记录的首轮 `94df0a04` 不能用作这次增量起点，否则会重复审 PR #126 已修复的内容。本轮固定代码终点 `ffed57da2d9b736f05e5b28c3876c4a7eefbefb9`，工作区开始时干净。评审不修改生产代码。

使用 `git log 18ea576f..ffed57da -- packages` 确认提交，再用同一区间 `git diff` 区分实现、测试/测试工具、配置/文档/版本。原 51 包均有路径变化，共 605 个文件、+31,580/-2,447 行；23 包有实现/测试工具源码变化，28 包没有实现源码变化。两份统计均基于受控 Git 文件，临时复现文件不计入。

重点走查 PR #122 引入的表集隔离、持有分支、快照导入/封印/回收、事务与通知、undo/redo、FTS、同步 outbox、草稿分区和三端生命周期；US-209 复核 VFS 余量扩容；依赖升级复核版本、glue 入口和补丁联动。大范围重构以高风险路径与相关测试为主，不声称把所有变更行重新做了一次全量审计。

旧发现以原报告为准逐项检查关闭证据。直接问题代码无增量的保留原结论；改过的 sqlite-core 加密辅助路径、核心 Repository 和小程序工厂接口重新看当前调用链。已修复的 6 条移出报告；模型的 IPv4 子情形移出同条描述。旧 43 条未关闭，新增 2 P2，去重共 **45 条（4 P1 + 26 P2 + 15 P3）**。它们属于代码缺陷清单，不等价于已验证所有触发环境。

## 提交清单

- `e644e68a 2026-10-26 chore(aiao): refresh package knowledge artifacts`
- `07d74e55 2026-10-26 fix(miniprogram): patch sqlite-wasm 1.4.0 global fallback`
- `a55af975 2026-10-26 chore(aiao): refresh package knowledge artifacts`
- `61e5a424 2026-10-26 fix(rxdb-adapter-pglite): keep verified pglite release`
- `be7353e3 2026-10-26 fix(rxdb-adapter-sqlite-core): skip unsupported coverage workers`
- `8b1f50e5 2026-10-26 chore(aiao): refresh package knowledge artifacts`
- `e75284f0 2026-10-26 fix(deps): address dependency review findings`
- `c425f414 2026-10-26 chore(deps): safely upgrade workspace dependencies`
- `967aa658 2026-10-26 12313`
- `9361d916 2026-10-26 q`
- `b109ba33 2026-10-26 feat(aiao): 重构 worktree 功能 (#122)`
- `23d8a098 2026-10-24 chore(aiao): release 0.0.28 (#153)`
- `4e544ee5 2026-10-22 fix(aiao): 小程序 VFS 追加写按余量扩容，不再每页整库重拷（US-209） (#146)`

`9361d916`、`967aa658` 的提交标题不足以说明范围，按实际 diff 审查；知识产物刷新与 0.0.28 发布不视为关闭缺陷的依据。两条新增问题均由 `b109ba33` 引入。

## 逐包覆盖矩阵

「实现」含 `src` 业务源码与测试工具，排除测试文件及共享测试套件；「测试」含 `__tests__`、`conformance`、共享 `testing`；其余为配置、文档、版本等。重命名按 Git diff 的目标路径计。问题跨包重复列示，汇总按根因去重。

| 包                                                                        | 实现文件 | 测试文件 | 其他文件 | 当前发现           |
| ------------------------------------------------------------------------- | -------: | -------: | -------: | ------------------ |
| [code-editor](./code-editor.md)                                           |        0 |        0 |        1 | 无确认问题         |
| [code-editor-angular](./code-editor-angular.md)                           |        0 |        0 |        1 | 无确认问题         |
| [code-editor-react](./code-editor-react.md)                               |        0 |        0 |        1 | 无确认问题         |
| [code-editor-vue](./code-editor-vue.md)                                   |        0 |        0 |        1 | 无确认问题         |
| [rxdb](./rxdb.md)                                                         |       37 |       21 |        2 | 2 P2               |
| [rxdb-adapter-electron](./rxdb-adapter-electron.md)                       |        3 |        7 |        1 | 1 P2 / 3 P3        |
| [rxdb-adapter-encrypted](./rxdb-adapter-encrypted.md)                     |        0 |        0 |        1 | 1 P2 / 1 P3        |
| [rxdb-adapter-http](./rxdb-adapter-http.md)                               |        0 |        0 |        1 | 1 P2               |
| [rxdb-adapter-miniprogram](./rxdb-adapter-miniprogram.md)                 |        5 |        3 |        3 | 2 P3               |
| [rxdb-adapter-pglite](./rxdb-adapter-pglite.md)                           |       40 |       44 |        2 | 1 P2               |
| [rxdb-adapter-sqlite](./rxdb-adapter-sqlite.md)                           |        1 |        4 |        2 | 无确认问题         |
| [rxdb-adapter-sqlite-core](./rxdb-adapter-sqlite-core.md)                 |       44 |       40 |        3 | 1 P1 / 1 P2 / 1 P3 |
| [rxdb-adapter-sqlite-wasm](./rxdb-adapter-sqlite-wasm.md)                 |        4 |       20 |        3 | 无确认问题         |
| [rxdb-adapter-sqliteai](./rxdb-adapter-sqliteai.md)                       |        1 |        4 |        2 | 无确认问题         |
| [rxdb-adapter-supabase](./rxdb-adapter-supabase.md)                       |        0 |        2 |        2 | 3 P2 / 1 P3        |
| [rxdb-adapter-tauri](./rxdb-adapter-tauri.md)                             |        0 |        2 |        3 | 1 P2 / 2 P3        |
| [rxdb-adapter-wa-sqlite](./rxdb-adapter-wa-sqlite.md)                     |        6 |       12 |        3 | 无确认问题         |
| [rxdb-angular](./rxdb-angular.md)                                         |        0 |        1 |        1 | 无确认问题         |
| [rxdb-client-generator](./rxdb-client-generator.md)                       |        0 |        0 |        1 | 无确认问题         |
| [rxdb-devtools](./rxdb-devtools.md)                                       |        0 |        0 |        1 | 1 P1 / 3 P2        |
| [rxdb-model](./rxdb-model.md)                                             |        6 |        4 |        2 | 1 P1 / 1 P2 / 3 P3 |
| [rxdb-model-angular](./rxdb-model-angular.md)                             |        2 |        2 |        1 | 1 P2               |
| [rxdb-model-react](./rxdb-model-react.md)                                 |        1 |        3 |        2 | 1 P1 / 2 P2        |
| [rxdb-model-vue](./rxdb-model-vue.md)                                     |        1 |        2 |        1 | 无确认问题         |
| [rxdb-plugin-graph](./rxdb-plugin-graph.md)                               |        4 |        2 |        3 | 无确认问题         |
| [rxdb-plugin-history](./rxdb-plugin-history.md)                           |       15 |       22 |        3 | 无确认问题         |
| [rxdb-plugin-querycache](./rxdb-plugin-querycache.md)                     |        0 |        1 |        2 | 1 P2               |
| [rxdb-plugin-replay](./rxdb-plugin-replay.md)                             |        0 |        0 |        3 | 无确认问题         |
| [rxdb-plugin-replay-angular](./rxdb-plugin-replay-angular.md)             |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-replay-react](./rxdb-plugin-replay-react.md)                 |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-replay-vue](./rxdb-plugin-replay-vue.md)                     |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-search](./rxdb-plugin-search.md)                             |        8 |       10 |        2 | 1 P3               |
| [rxdb-plugin-search-angular](./rxdb-plugin-search-angular.md)             |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-search-react](./rxdb-plugin-search-react.md)                 |        0 |        0 |        1 | 1 P2               |
| [rxdb-plugin-search-vue](./rxdb-plugin-search-vue.md)                     |        0 |        0 |        1 | 1 P2               |
| [rxdb-plugin-storage](./rxdb-plugin-storage.md)                           |        0 |        0 |        2 | 无确认问题         |
| [rxdb-plugin-sync](./rxdb-plugin-sync.md)                                 |        9 |       20 |        2 | 无确认问题         |
| [rxdb-plugin-tree](./rxdb-plugin-tree.md)                                 |        0 |        0 |        2 | 无确认问题         |
| [rxdb-plugin-tree-angular](./rxdb-plugin-tree-angular.md)                 |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-tree-react](./rxdb-plugin-tree-react.md)                     |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-tree-vue](./rxdb-plugin-tree-vue.md)                         |        0 |        0 |        1 | 无确认问题         |
| [rxdb-plugin-working-tree](./rxdb-plugin-working-tree.md)                 |       35 |       48 |        2 | 1 P2               |
| [rxdb-plugin-working-tree-angular](./rxdb-plugin-working-tree-angular.md) |        3 |        3 |        2 | 无确认问题         |
| [rxdb-plugin-working-tree-react](./rxdb-plugin-working-tree-react.md)     |        3 |        4 |        2 | 无确认问题         |
| [rxdb-plugin-working-tree-vue](./rxdb-plugin-working-tree-vue.md)         |        3 |        3 |        2 | 无确认问题         |
| [rxdb-plugin-workspace](./rxdb-plugin-workspace.md)                       |        2 |        2 |        2 | 无确认问题         |
| [rxdb-react](./rxdb-react.md)                                             |        0 |        0 |        2 | 无确认问题         |
| [rxdb-taro](./rxdb-taro.md)                                               |        0 |        0 |        1 | 1 P3               |
| [rxdb-test](./rxdb-test.md)                                               |        1 |        0 |        1 | 无确认问题         |
| [rxdb-vue](./rxdb-vue.md)                                                 |        0 |        0 |        1 | 无确认问题         |
| [utils](./utils.md)                                                       |        0 |        0 |        1 | 6 P2               |

## 新增问题的动态反例

INC-001：在已有 `worktree-manager.spec.ts` 替身框架中建立 persistent 视图并 release；再次 attach 时让 `sealSnapshot` reject，同时让快照 `disconnectAll` reject。attach 结束后检查 `navigator.locks.query()`，该 id 的锁仍在：预期 `false`、实际 `true`。这是 Chromium 真实 Web Lock，连接/封印用故障注入。

INC-002：用真实内存 PGlite 注册一个 `log: false` 实体，保存一行并订阅 `ENTITY_LOCAL_REMOVE`；在显式适配器事务中 `executor.getRepository(Entity).remove(row)` 后抛错。回滚后 `count() === 1` 已通过，但零删除通知的断言失败，实际收到一条。SQLite 实现紧邻 DELETE 的通知顺序相同，按源码同源登记。

临时用例均在复现后移除，原测试文件恢复；没有为使测试通过修改生产实现。修复时应把两条反例固化为回归测试。

## 验证

环境：Node `26.12.0`、pnpm `10.34.9`；所有任务通过 `pnpm nx`，设 `NX_NO_CLOUD=true NX_DAEMON=false`、禁远程缓存；多个项目按串行运行。下面的测试任务本身重新执行，部分依赖构建命中本地缓存，未把它们算成全量重新构建。

| 范围                       | 结果                                                                       | 证据边界                                       |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| working-tree 全量          | 81 文件 / 1,284 例通过；四项覆盖率 96.39 / 90.27 / 97.50 / 97.55%          | Chromium，原有套件；未覆盖 INC-001 的双重失败  |
| history 全量               | 439 例通过；四项覆盖率 97.58 / 91.56 / 96.46 / 98.34%                      | Chromium；四项均超过 90%                       |
| PGlite worktree 定向       | 5 文件 / 53 例通过                                                         | Node 真实 PGlite，非本包全量与浏览器持久化矩阵 |
| miniprogram 全量           | 29 文件 / 357 例通过                                                       | Node，非小程序真机                             |
| sync 全量                  | 35 文件 / 500 例通过；四项覆盖率 93.52 / 86.22 / 95.49 / 94.73%            | Chromium，现有任务门槛通过                     |
| working-tree 三端          | Angular 5 文件 / 77 例；React 4 文件 / 67 例；Vue 4 文件 / 68 例，全部通过 | 三个包各自任务，串行                           |
| INC-001 / INC-002 临时反例 | 两例均按预期失败                                                           | 证明缺陷存在，不能计为门禁通过                 |

常规任务：

```bash
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree:test --skipRemoteCache --output-style=static
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run rxdb-plugin-history:test --skipRemoteCache --output-style=static
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run rxdb-adapter-miniprogram:test --skipRemoteCache --output-style=static
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run rxdb-plugin-sync:test --skipRemoteCache --output-style=static
NX_NO_CLOUD=true NX_DAEMON=false pnpm nx run-many -t test -p rxdb-plugin-working-tree-angular,rxdb-plugin-working-tree-react,rxdb-plugin-working-tree-vue --parallel=1 --skipRemoteCache --output-style=static
NX_NO_CLOUD=true NX_DAEMON=false RXDB_PGLITE_NODE_TEST=true RXDB_PGLITE_TEST_FILE='src/__tests__/worktree-{isolation,table-set,history-isolation,long-namespace,lifecycle-recovery}.spec.ts' pnpm nx run rxdb-adapter-pglite:test --skipRemoteCache --output-style=static -- --maxWorkers=1
```

checkout 定向 102 例另外复跑通过。首次定向调用把 coverage 参数放在 Nx 的 `--` 之前，实际未转发到 Vitest，导致仅跑子集却校验整个包 90% 覆盖率而退出非零；改为 `-- --coverage.enabled=false --maxWorkers=1 src/__tests__/checkout/` 后定向通过，随后完整包带覆盖率通过。该次退出不登记为产品缺陷，也不隐去。

两条临时反例分别用 working-tree 的 `-t '增量评审复现'` 和 PGlite 的 `RXDB_PGLITE_TEST_FILE` 选取，均通过 Nx 执行。

## 未覆盖

未运行 51 包全工作区 lint/typecheck/build/e2e，也未逐条动态复现旧 43 条。未跑真实 Supabase/PostgREST、Electron/Tauri 宿主、小程序真机、跨 tab 崩溃/进程中断与发布包消费。28 个没有实现增量的包仍可能因共享核心或第三方依赖升级受影响，静态未新增缺陷不代表这些运行矩阵已通过。

文档收尾：59 份 Markdown 的本地链接、51 包矩阵与 605 文件计数、去重问题数量及源码锚点检查通过；Nx 格式检查与 `git diff --check` 通过。`packages/` 无工作区差异，临时复现已清理。
