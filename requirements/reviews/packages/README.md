# packages 深度评审索引

日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。已按目录与 Nx 项目交叉核对 **51/51** 个包，每包一份报告；执行顺序和判据见 [评审计划](PLAN.md)。本 PR 仅涉及评审文档，没有修改产品源码或测试。

共 **32 个包内修复点：P0 0、P1 7、P2 23、P3 2**。其中 EntityDetail 切换目标、QueryBuilder 空 schema 同步各有三端独立实现；将这两组分别合并后，共 **28 个问题族（P1 5、P2 21、P3 2）**。共享 SQLite 内核和共享模型问题在责任包登记，受影响包装包仅引用，不重复计数。

结论等级描述本轮已检查路径，不能推出整个包没有风险；“0”表示没有新增独立修复点。源码静态推导、原函数隔离执行、真实组件/SQL 组合验证及未验证的宿主边界均写在各报告中。

## 优先处理的问题

| 问题族 | 责任包与证据 |
| --- | --- |
| P1：目录重命名失败后丢失完整副本 | [storage / STORAGE-002](rxdb-plugin-storage.md)：复制分支的源目录部分删除失败后，补偿删除了完整目标副本；真实补偿函数故障注入与独立调用链复核均确认。限定 OPFS 无目录 move 或自定义文件系统。 |
| P1：离线队列丢失 namespace | [sync / SYNC-001](rxdb-plugin-sync.md)：重放使用裸实体名仍推进水位；实际 HTTP 资源映射可路由到公共同名实体。 |
| P1：切换详情目标期间保存旧记录 | [Angular](rxdb-model-angular.md)、[React](rxdb-model-react.md)、[Vue](rxdb-model-vue.md)：新 id 尚未到货时仍保存旧实例；React 真实组件接缝复现，三端保存链均独立复核。 |
| P1：Activity 恢复丢失编辑文本 | [code-editor-react](code-editor-react.md)：真实 React Activity 与 EditorView 隔离复现。 |
| P1：SharedWorker 实例推断遗漏共享治理 | [sqlite-wasm / SWM-001](rxdb-adapter-sqlite-wasm.md)：只传实例时跳过跨标签锁并走整连接关闭；源码链已交叉复核，双标签实测待补。 |

[SQLC-001](rxdb-adapter-sqlite-core.md) 当前为 P2：加密 Id 后缀列跳过转换，普通 CRUD 解密回填失败并回滚。完整公开 `entity.save()` 及真实 SQLite 诊断确认锁定/解锁两种失败后原始行均为空；低层参数绕过不能等同于普通保存已提交明文。

## 逐包报告与校验结果

| 项目包                                                                  | 结论 | 新增独立修复点 | 首轮 `test` 结果                                                            |
| ----------------------------------------------------------------------- | ---- | -------------- | --------------------------------------------------------------------------- |
| [code-editor](code-editor.md)                                           | 🟢 | 0 | 107 passed (107)（实际执行）                                                |
| [code-editor-angular](code-editor-angular.md)                           | 🟢 | 0 | 79 passed (79)（实际执行）                                                  |
| [code-editor-react](code-editor-react.md)                               | 🟡 | P1 × 1 | 41 passed (41)（实际执行）                                                  |
| [code-editor-vue](code-editor-vue.md)                                   | 🟢 | 0 | 68 passed (68)（实际执行）                                                  |
| [rxdb](rxdb.md)                                                         | 🟡 | P2 × 1 | 2653 passed ； 1 skipped (2654)（实际执行）                                 |
| [rxdb-adapter-electron](rxdb-adapter-electron.md)                       | 🟡 | 0 | 4 failed ； 1386 passed ； 8 skipped (1398)；失败文件复跑见下文（实际执行） |
| [rxdb-adapter-encrypted](rxdb-adapter-encrypted.md)                     | 🟢 | 0 | 321 passed (321)（实际执行）                                                |
| [rxdb-adapter-http](rxdb-adapter-http.md)                               | 🟡 | P2 × 2 | 501 passed (501)（实际执行）                                                |
| [rxdb-adapter-miniprogram](rxdb-adapter-miniprogram.md)                 | 🟡 | 0 | 359 passed (359)（实际执行）                                                |
| [rxdb-adapter-pglite](rxdb-adapter-pglite.md)                           | 🟡 | P3 × 1 | 1562 passed (1562)（实际执行）                                              |
| [rxdb-adapter-sqlite](rxdb-adapter-sqlite.md)                           | 🟡 | 0 | 834 passed ； 13 skipped (847)（实际执行）                                  |
| [rxdb-adapter-sqlite-core](rxdb-adapter-sqlite-core.md)                 | 🟡 | P2 × 1 | 1576 passed ； 21 skipped (1597)（实际执行）                                |
| [rxdb-adapter-sqlite-wasm](rxdb-adapter-sqlite-wasm.md)                 | 🟡 | P1 × 1 | 994 passed ； 13 skipped (1007)（实际执行）                                 |
| [rxdb-adapter-sqliteai](rxdb-adapter-sqliteai.md)                       | 🟡 | 0 | 843 passed ； 10 skipped (853)（实际执行）                                  |
| [rxdb-adapter-supabase](rxdb-adapter-supabase.md)                       | 🟡 | P2 × 1 | 620 passed (620)（实际执行）                                                |
| [rxdb-adapter-tauri](rxdb-adapter-tauri.md)                             | 🟡 | P2 × 1 | 39 passed (39)（实际执行）                                                  |
| [rxdb-adapter-wa-sqlite](rxdb-adapter-wa-sqlite.md)                     | 🟡 | 0 | 1007 passed ； 14 skipped (1021)（实际执行）                                |
| [rxdb-angular](rxdb-angular.md)                                         | 🟢 | 0 | 266 passed (266)（实际执行）                                                |
| [rxdb-client-generator](rxdb-client-generator.md)                       | 🟡 | P2 × 1 | 382 passed (382)（实际执行）                                                |
| [rxdb-devtools](rxdb-devtools.md)                                       | 🟡 | P2 × 1 | 1008 passed (1008)（实际执行）                                              |
| [rxdb-model](rxdb-model.md)                                             | 🟡 | P2 × 2 | 1034 passed (1034)（实际执行）                                              |
| [rxdb-model-angular](rxdb-model-angular.md)                             | 🟡 | P1 × 1、P2 × 1 | 344 passed (344)（本地缓存）                                                |
| [rxdb-model-react](rxdb-model-react.md)                                 | 🟡 | P1 × 1、P2 × 2 | 302 passed (302)（本地缓存）                                                |
| [rxdb-model-vue](rxdb-model-vue.md)                                     | 🟡 | P1 × 1、P2 × 1 | 338 passed (338)（本地缓存）                                                |
| [rxdb-plugin-graph](rxdb-plugin-graph.md)                               | 🟡 | P2 × 1 | 192 passed (192)（实际执行）                                                |
| [rxdb-plugin-history](rxdb-plugin-history.md)                           | 🟢 | 0 | 439 passed (439)（实际执行）                                                |
| [rxdb-plugin-querycache](rxdb-plugin-querycache.md)                     | 🟡 | P2 × 1 | 206 passed (206)（实际执行）                                                |
| [rxdb-plugin-replay](rxdb-plugin-replay.md)                             | 🟢 | 0 | 149 passed ； 1 skipped (150)（实际执行）                                   |
| [rxdb-plugin-replay-angular](rxdb-plugin-replay-angular.md)             | 🟢 | 0 | 32 passed (32)（实际执行）                                                  |
| [rxdb-plugin-replay-react](rxdb-plugin-replay-react.md)                 | 🟢 | 0 | 15 passed (15)（实际执行）                                                  |
| [rxdb-plugin-replay-vue](rxdb-plugin-replay-vue.md)                     | 🟢 | 0 | 11 passed (11)（实际执行）                                                  |
| [rxdb-plugin-search](rxdb-plugin-search.md)                             | 🟢 | 0 | 302 passed (302)（实际执行）                                                |
| [rxdb-plugin-search-angular](rxdb-plugin-search-angular.md)             | 🟢 | 0 | 40 passed (40)（实际执行）                                                  |
| [rxdb-plugin-search-react](rxdb-plugin-search-react.md)                 | 🟢 | 0 | 42 passed (42)（实际执行）                                                  |
| [rxdb-plugin-search-vue](rxdb-plugin-search-vue.md)                     | 🟢 | 0 | 40 passed (40)（实际执行）                                                  |
| [rxdb-plugin-storage](rxdb-plugin-storage.md)                           | 🟡 | P1 × 1、P2 × 1 | 277 passed (277)（实际执行）                                                |
| [rxdb-plugin-sync](rxdb-plugin-sync.md)                                 | 🟡 | P1 × 1 | 500 passed (500)（实际执行）                                                |
| [rxdb-plugin-tree](rxdb-plugin-tree.md)                                 | 🟡 | P2 × 1 | 7 passed (7)（实际执行）                                                    |
| [rxdb-plugin-tree-angular](rxdb-plugin-tree-angular.md)                 | 🟢 | 0 | 15 passed (15)（实际执行）                                                  |
| [rxdb-plugin-tree-react](rxdb-plugin-tree-react.md)                     | 🟢 | 0 | 16 passed (16)（实际执行）                                                  |
| [rxdb-plugin-tree-vue](rxdb-plugin-tree-vue.md)                         | 🟢 | 0 | 35 passed (35)（实际执行）                                                  |
| [rxdb-plugin-working-tree](rxdb-plugin-working-tree.md)                 | 🟢 | 0 | 1285 passed (1285)（实际执行）                                              |
| [rxdb-plugin-working-tree-angular](rxdb-plugin-working-tree-angular.md) | 🟢 | 0 | 77 passed (77)（实际执行）                                                  |
| [rxdb-plugin-working-tree-react](rxdb-plugin-working-tree-react.md)     | 🟢 | 0 | 67 passed (67)（实际执行）                                                  |
| [rxdb-plugin-working-tree-vue](rxdb-plugin-working-tree-vue.md)         | 🟢 | 0 | 68 passed (68)（实际执行）                                                  |
| [rxdb-plugin-workspace](rxdb-plugin-workspace.md)                       | 🟡 | P2 × 1 | 112 passed (112)（实际执行）                                                |
| [rxdb-react](rxdb-react.md)                                             | 🟡 | P2 × 3 | 205 passed (205)（实际执行）                                                |
| [rxdb-taro](rxdb-taro.md)                                               | 🟢 | 0 | 72 passed (72)（实际执行）                                                  |
| [rxdb-test](rxdb-test.md)                                               | 🟢 | 0 | 249 passed (249)（实际执行）                                                |
| [rxdb-vue](rxdb-vue.md)                                                 | 🟢 | 0 | 227 passed (227)（实际执行）                                                |
| [utils](utils.md)                                                       | 🟡 | P2 × 1、P3 × 1 | 982 passed (982)（实际执行）                                                |

## 校验范围

本次执行：

```bash
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t test --projects='packages/*' --parallel=1 --skipRemoteCache --output-style=static
```

51 个包的 `test` 目标全部完成，**50 个通过、1 个失败**。其中 3 个目标命中本地缓存、48 个实际执行；依赖的 build 和 PGlite `test-node` 另由 Nx 调度。首轮失败为 `rxdb-adapter-electron:test`：4 个测试文件中 4 个用例超时，另有 1 条 ErrnoError 未处理拒绝；首轮其余 1386 个用例通过、8 个跳过。全局 Nx 串行不会限制 Vitest 文件 worker，因此按仓库约定对失败文件单 worker 复跑。

```bash
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run rxdb-adapter-electron:test --maxWorkers=1 --run src/__tests__/electron-pglite-host.spec.ts src/__tests__/pglite-data-directory.spec.ts src/__tests__/backup/electron-pglite-restore-concurrency.spec.ts src/__tests__/backup/electron-pglite-restore-kill.spec.ts --skipRemoteCache --output-style=static
```

定点复跑通过：4 个文件、36 个用例全部通过，目标实际执行，耗时约 3 分 52 秒；未再出现超时或未处理拒绝。按仓库约定，本轮将首轮失败归为并发/资源相关抖动，不另计业务缺陷。此结论只针对失败文件的定点复跑，没有再次执行整个 Electron 测试目标。

测试结果只代表所列目标；没有运行 `pnpm test-all`、全包 lint/typecheck、覆盖率专用门禁或完整 e2e。部分 `test` 本身使用 Chromium，不能一概称为纯 Node 单测；另行配置的 `test-memory` / `test-browser`、Rust 与真机目标未被本次命令自动等同为通过。测试绿色与本次新发现可以同时成立：各报告列出了未被现有断言覆盖的具体场景。

## 三端与历史问题处理

实际对照了 code-editor、rxdb、rxdb-model、search、tree、replay、working-tree 七组的公开入口与共享类型，按 Angular inject/input/output、React hook/props、Vue composable/emit 归一核对，未把框架惯例差异当作缺失。行为问题分别落在责任包，三端同类缺陷保留各自修复位置。

10 月 27 日清理记录只作查证线索：已修问题不复报。Vue EntityDetail 异步 provider 快照、PGlite 自定义主键完整 CRUD 限制、原生 DevTools 文件覆盖策略等已有事实，在各报告单列，不算本轮新增；US-315 已有实现与 Done 记录，不按旧症状重新登记。

## 提交前验证与独立复核

交叉换组重新核对全部 51 份报告，沿公开调用方、事务包装与回填链寻找反证。确认当前 32 个修复点：HTTP 在飞请求代次、QueryCache 在线写回执、React Provider/Action/QueryBuilder 的调度，以及目录复制补偿均有可控时序或故障注入实证。只读列问题的结论限定于入口产生写入/回调，不推断最终内存必然不恢复；oo1 客户端明确禁止多方并发租用，不将违反该约定的接入计作新问题。

根级核心与工具的原始诊断也重新执行：异步工厂失败跳过清理、对象特殊键、稀疏数组转换、DevTools 切实例订阅及生成器首次软链输出冲突仍可复现。各诊断的替身与真实运行边界见责任包报告。追加诊断不计入上表既有 51 个 `test` 目标的用例总数；源码未变，没有重新执行整套包测试。

提交前使用 `affected-ci` 核对影响范围，`pnpm nx show projects --affected --base=origin/main --json` 仅返回 `@aiao/source`。执行以下全档目标组合，实际匹配并通过的是根项目 `lint`（约 9.9 秒，实际执行）；该根项目没有其余同名目标，不能将它描述为全包 lint/typecheck/test 全绿。

```bash
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx affected -t lint typecheck test test-browser build e2e --base=origin/main --exclude=website,benchmarks --parallel=1 --nxBail --skipRemoteCache --output-style=static
```
