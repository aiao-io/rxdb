# claude/worktree-rename-contexts 分支评审

原始评审确认 10 个问题：3 个 P1、7 个 P2。现已全部修复并补正式回归，分步验证完成；下文保留原始触发场景作为修复依据。

评审日期：2026-10-23。独立 worktree：`/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb`。

比较本地 `main`（`3ca26f7e4a239a6b1e4567c7d45402bab4c250da`）与目标分支（`c3a105449285edf49d3c0a570f29a2c853089854`），585 个文件，新增 33785 行、删除 2785 行。修复分支为 `codex/fix-rename-contexts-review`，基于该目标提交。临时复现已整理为正式回归。

## 修复对照

| 原问题 | 已完成的修复                                                                                            | 实现                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | 重做按检出位隔离，应用与收尾都核对分支/会话                                                             | [undo/redo](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/undo-redo-apply.ts:151)                     |
| 2      | 同名数据库的打开/删除串行，关闭时取消排队操作                                                           | [Electron host](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-electron/src/electron-sqlite-host.ts:192)          |
| 3      | 推送规划及每批发送检查主检出位；首批成功即按来源分支/会话推进撤销边界，覆盖部分成功且不清其他检出位历史 | [推送](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-sync/src/push-repository.ts:867)                             |
| 4      | raw 门禁跟随物理目录，同事务重查其他实例新建的影子表                                                    | [raw 门禁](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:2056)          |
| 5      | normal 预览保留真实执行的删除，文档同步策略差异                                                         | [合并预览](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/branch-compare.ts:440)                       |
| 6      | 分叉点随当前分支刷新，并拒绝迟到查询回写                                                                | [继承屏障](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/HistoryManager.ts:842)                       |
| 7      | 检出位生命周期串行，卸载失败保留仍在使用的认领                                                          | [检出位生命周期](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:450) |
| 8      | wa-sqlite 和 sqlite-wasm 的 OPFS 路径按 VFS 规则规范化                                                  | [存储删除](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts:88)                  |
| 9      | 超长 schema 使用 UTF-8 安全前缀及哈希，保留完整表集后缀                                                 | [schema 解析](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-pglite/src/table-name-resolver.ts:34)                |
| 10     | 三端内容刷新后重读当前对比，清除操作不会被迟到刷新撤回                                                  | [三端对比](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/apps/dev-rxdb-react/src/app/pages/working-tree/index.tsx:126)                 |

验证期间同时修正：

- React 模型包的测试夹具从 lib 项目移到 spec 项目，防止构建清空 dist 后类型检查引用缺失声明。
- React/Vue 应用的工作树依赖通过 pnpm workspace 命令补齐。
- Angular 和 Tauri 应用测试改用独立进程池，并关闭 Node 原生 Web Storage，修正 TestBed 跨文件污染及 Node 26 存储冲突。
- 只读一致性套件等待真实实体事件；事务提交前暂存、提交后投递的确定性回归放在核心单测中，以明确的 BEGIN/COMMIT 事件建立上下文。
- Angular 指令测试在预加载公开入口后 spy 真实 getter，修正包级 mock 未覆盖缓存模块的问题，原有 16 条行为断言保留。
- React 键盘 E2E 等待历史行出现，并按明确目标 testid 结束 Tab 遍历，保留 80 步上限和全部可达性、焦点指示断言。
- 三端 ESLint 将含真实 expect 断言的 expectFitsHorizontally 辅助函数加入现有识别名单；规则保留，三端零警告通过。

## 修复后验证

- 最终静态门禁：80 个受影响项目、233 个任务的 lint/typecheck/build/audit-lazy-backend 全部通过；最后三个 E2E 项目额外以 --max-warnings=0 复核通过。
- rxdb 核心：149 个文件、2604 条测试通过、1 条跳过，分支覆盖率 92.08%。
- working-tree：81 个文件、1268 条测试通过，分支覆盖率 91.15%。
- history：29 个文件、429 条测试通过，包含换挂隔离、原会话失效及 normal 幽灵删除边界。
- sync：35 个文件、499 条测试通过，包含分批推送部分成功后换挂的来源会话失效。
- PGlite：完整 183 个浏览器测试文件、1505 条测试全部通过；Node 侧 18 条也通过。
- Electron：完整 40 个文件、1348 条测试通过、8 条跳过，行覆盖率 96.54%；共享事件等待修正后额外定向验证通过。
- SQLite 基类：68 个文件分两片执行并合并，1561 条测试通过、21 条跳过，行覆盖率 94.02%、分支覆盖率 88.92%；lint/typecheck 通过。
- 其他 SQLite 后端的完整套件已通过；PGlite、sqlite-wasm、Electron 的最终实体事件回归均通过。
- React 模型：282 条测试通过，行覆盖率 95.22%；实际构建清空 dist 后的严格类型检查通过。
- 应用全套 Angular 493、React 355、Vue 289、Tauri 350 条通过；Angular 绑定包 266 条通过；根脚本 457 条通过。
- 三端公开 API 对称检查通过。
- 七套 E2E 分步全部通过：Angular 195、React 191、Vue 174、Electron 56（4 跳过）、HTTP 23、Supabase 4、扩展 2，共 645 条通过、4 条跳过。
- 收集到的六个失败目标均已修复并完整复跑通过；没有调整三端合并预览 E2E 的原有断言。

SQLite 基类的整包浏览器任务未能单次跑完：断连落在不同文件的 `createTesters` RPC 阶段，未出现断言失败。Playwright 诊断确认 Vite 服务连接先断，随后浏览器以 `exitCode=0, signal=null` 正常关闭，尚未定位服务断连原因。没有为此修改业务、关闭文件隔离或覆盖率。两片各执行 34 个文件，blob 合并后核对了 68 个唯一 suite、0 failures、0 errors；原始报告保留在 `/tmp/rxdb-sqlite-core-shards`。

## 原始发现

以下描述保留原始缺陷的触发场景；位置链接指向修复后对应的方法。

### 1. [P1] 换挂后旧分支的 redo 会写进新表集

位置：[HistoryManager.ts:740](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/HistoryManager.ts:740)。

换挂只更新 undo session，`redoStack` 仍由整个实例共享。真实 PGlite 复现：main 将 `title=a` 改为 `b` 后撤销，再挂到 held 并调用 `redo()`，held 被写成 `b`，main 仍为 `a`；同时 main 变更的撤销标记被清除。原分支的日志与实际数据因此不一致。

换挂时需要清理或按分支保存 redo；应用重做前也应校验历史所属分支与执行器的持有分支。

复现：[PGlite 第一个用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-pglite/src/__tests__/worktree-history-isolation.spec.ts)。

### 2. [P1] Electron 并发 drop/open 会删除活连接的数据库文件

位置：[electron-sqlite-host.ts:269](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-electron/src/electron-sqlite-host.ts:269)。

`drop()` 只在开始检查一次 sessions，随后逐个 `await` 删除旁文件和主文件；等待期间，`open()` 可以建立同名库的新连接。复现 `dropping = host.handle(drop); await host.handle(open); await dropping` 后，结果是 `dropped: true`、会话数为 1、数据库文件已不存在。POSIX 下连接继续写入已被 unlink 的 inode，关闭后写入数据丢失。

应以规范化库名互斥整个打开和删除过程，覆盖会话检查到最后一次删除。

复现：[Electron host 用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-electron/src/__tests__/electron-sqlite-host.spec.ts)。

### 3. [P1] 推送规划期间换挂，会把检出位数据上传远端

位置：[SyncManager.ts:393](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-sync/src/SyncManager.ts:393)。

主检出位检查只发生在入口。之后多次异步等待期间可以换挂，规划阶段的 `getCurrentBranch()` 随之读到检出位持有的分支。阻塞首次远端解析、换挂再继续，实际远端 `mergeChanges()` 收到了 `private-checkout` 分支和 `private data`，并成功登记 `remoteId=101`。现有回执检查仅覆盖被拒条目的对齐，不能阻止这次上传。

推送规划和每次远端发送需要使用固定的主检出位身份，并在发送前核对表集及切换代际；仅检查最终落库已经太晚。

复现：[同步用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-sync/src/__tests__/push-worktree-isolation.spec.ts)。

### 4. [P2] SQLite 换挂后 raw 门禁不认识影子表，可直接 DROP 掉业务表

位置：[RxDBAdapterSqliteBase.ts:1264](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1264)。

捕获运行时的版本化域在安装时固化物理表名，换挂只清行号缓存，没有更新该域。换挂后，`rawQuery('DROP TABLE "public$todos$wt_…"')` 被当作域外写放行；真实 Electron 复现中物理表已消失，登记行仍是 `ready`。raw INSERT 也被放行，不过会由事务钩子捕获，不能把这个 INSERT 误称为“未捕获写入”。

应让门禁覆盖实际存在的影子表，并在表集生命周期或换挂时同步更新域。五个继承此基类的 SQLite 后端共享此逻辑。

复现：[raw 门禁用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-electron/src/__tests__/worktree-write-isolation.spec.ts)。

### 5. [P2] normal 合并预览遗漏真正会删除目标数据的操作

位置：[branch-compare.ts:438](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/branch-compare.ts:438)。

所有策略都使用 `squash_source_changes()` 构造预览。feature 创建后删除 `x`，main 独立创建同主键 `x` 时，normal 真合并会先替换再删除 main.x，但预览 `entries=[]`，既没有删除项，也没有冲突。用户确认的是一个没有展示实际破坏效果的预览。

normal 预览需要按实际逐条重放语义计算目标最终效果，不能复用会抹掉幽灵操作的 squash 结果。

复现：[合并预览用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/__tests__/normal-merge-preview.spec.ts)。

### 6. [P2] 换挂后沿用旧分支的继承屏障，错误禁用撤销

位置：[HistoryManager.ts:242](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-history/src/HistoryManager.ts:242)。

分叉点查询只跟随连接和显式刷新，没有跟随表集或当前分支。真实 PGlite 复现：held 有 id2 的自有修改且没有子分支，main 后来建立 sibling（fork id3）；挂到 held 后，历史已切到 held，但 `undoCount=0`，继承屏障仍指向 main 的 sibling。界面持续禁用本来合法的撤销。

当前分支变化时，应清除并重查对应分支的 forks，且防止旧异步结果回写到新分支。

复现：[PGlite 第二个用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-pglite/src/__tests__/worktree-history-isolation.spec.ts)。

### 7. [P2] 同实例 mount/remove 并发后，仍挂载的检出位会失去锁

位置：[worktree-manager.ts:450](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:450)。

已认领但当前未挂载的检出位，同时执行 `mount(id)` 和 `remove(id)`。两个操作的校验和换挂没有整体串行：remove 检查时还在主表集，实际删表时 mount 已完成；SQLite 随后重建已被删除表的触发器失败，事务回滚。`finally` 却无条件删除 claim 并释放锁。复现结果：mount 成功、remove 失败，当前仍挂在完整的影子表上，但 `navigator.locks.query()` 已没有它的锁。此后别处可认领仍在使用的检出位，当前实例的 `release(id)` 也因 claim 丢失而不再卸载。

需要串行化同一检出位的生命周期操作，并保证失败时仍挂载的检出位保留认领。

复现：[并发生命周期用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-electron/src/__tests__/worktree-write-isolation.spec.ts)。

### 8. [P2] wa-sqlite 中文或带空格的库名删不掉持久存储

位置：[RxDBAdapterSqlite.ts:88](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts:88)。

VFS 按 `new URL(zName, 'file://').pathname` 保存路径，删除时却直接拼原始库名。真实 Chromium 中，`中文 review-…` 可正常连接，实际 IDB key 是 `/%E4%B8%AD%E6%96%87%20review-…@0_1.sqlite`；断开并调用 `dropStorage()` 成功返回后，这条 metadata 仍在，存储没有删除。两个 IDB VFS 都使用此分支，OPFS 分支也没有复用打开时的规范化。

应以 VFS 打开时相同的规范化规则定位主文件和旁文件。

复现：[wa-sqlite 用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-wa-sqlite/src/__tests__/drop-storage.spec.ts)。

### 9. [P2] PGlite 合法长 namespace 无法建立隔离表集

位置：[table-name-resolver.ts:34](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-pglite/src/table-name-resolver.ts:34)。

主库接受 63 字节的合法 namespace，拼上 `$wt_review` 后 PostgreSQL 将 schema 标识符截断回原 namespace。真实 Chromium 中主库连接正常，创建影子表集却报 `42P07 relation "LongNamespaceNote" already exists`。只限制后缀长度，无法保证拼接结果不超过 63 字节；更长的多字节命名也有同类问题。

物理 schema 名需要长度受限、可区分且删除时可定位的生成规则，不能依赖 PostgreSQL 截断。

复现：[PGlite 长命名空间用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/packages/rxdb-adapter-pglite/src/__tests__/worktree-long-namespace.spec.ts)。

### 10. [P2] 丢弃改动后，三端 History 仍显示旧分支对比

位置：[React index.tsx:894](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/apps/dev-rxdb-react/src/app/pages/working-tree/index.tsx:894)；[Angular working-tree.page.ts:887](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.ts:887)；[Vue WorkingTreePage.vue:860](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/apps/dev-rxdb-vue/src/pages/WorkingTreePage.vue:860)。

先比较显示 `dirty → feature`，切到 Changes 丢弃当前修改，回 History 并点击 Fetch，仍显示已经被丢弃的 `dirty → feature`。对比取的是分支当前状态，但缓存只在选择比较分支时重算；discard、状态刷新、Fetch 没有失效旧值。页面复现已确认该行为。

当前分支内容变化或手动刷新时，应重新比较或清除旧比较结果；三端同时修复。

复现：[React 页面用例](/Users/jimmy/.codex/worktrees/review-rename-contexts/rxdb/apps/dev-rxdb-react/src/app/pages/working-tree/working-tree.compare.spec.tsx)。

## 覆盖范围

| 范围                            | 变更文件数 | 检查内容                                                            |
| ------------------------------- | ---------: | ------------------------------------------------------------------- |
| rxdb 核心                       |         37 | 只读写入口、类克隆、实体与关系缓存、表集与当前分支                  |
| 全部 adapter                    |        207 | SQL 生成、表集、触发器、迁移、快照、存储回收、OPFS 重试、小程序 VFS |
| working-tree 核心与三端绑定     |        100 | 捕获、提交分叉点、检出位生命周期、异步状态、实际公开导出            |
| history / sync / workspace      |         56 | 分支比较、合并预览、undo/redo 屏障、同步与换挂并发、草稿排除        |
| model 与三端模型                |         20 | 只读能力、编辑列、实体列表、拖动与历史提示                          |
| apps 与 e2e 代码                |        106 | 三端工作树交互、对话框、焦点、连接失败提示、路由、测试变化          |
| graph / search / storage / test |          6 | 表名调用迁移、插件集成及共享测试夹具                                |
| CI、脚本、需求、基线及文档等    |         53 | 新门禁、API 基线与实现对应、范围与已知限制                          |

三端公开 API 对称；没有把需求中明确延后的 B2/C 能力（多标签页事件隔离、检出位内切分支/合并、三端可写检出位绑定等）列作缺陷。

## 原始评审验证

- `rxdb:test`：149 文件通过，2603 测试通过、1 跳过；分支覆盖率 92.06%。
- `rxdb-plugin-working-tree:test`：通过；分支覆盖率 91.12%。
- 三端应用变更相关测试：React 115、Angular 94、Vue 90，全部通过。
- `@aiao/source:test-scripts`：457 测试全部通过。
- 新增 8 个复现文件，共 11 条测试按预期失败，对应上面 10 个问题（raw CRUD 与 DDL 共用一个根因）。
- PGlite、wa-sqlite 复现使用真实 Chromium；Electron 使用真实 Node 26 `node:sqlite` host；页面复现使用 happy-dom，history/sync 的规划复现使用真实入口配可控存储/远端替身。

所有任务通过 `pnpm nx` 执行。测试使用 `/Users/jimmy/.nvm/versions/node/v26.12.0/bin`，禁用 Nx Daemon 与 Nx Cloud；并发验证过程中曾遇到共享 dist 被另一构建重建引起的模块缺失，停止依赖并发构建后已重新完成相关复现，未将其算作生产缺陷。

截至原始评审完成时，完整 affected 门禁、浏览器 E2E、模型全套尚未执行；修复后的验证进展见上方。

修复后的定向复跑示例（工作目录为本 worktree，依赖构建已完成）：

```bash
export PATH=/Users/jimmy/.nvm/versions/node/v26.12.0/bin:$PATH
export NX_DAEMON=false NX_NO_CLOUD=true VITEST_MAX_WORKERS=1
pnpm nx run rxdb-adapter-electron:test --run worktree-write-isolation.spec.ts --coverage.enabled=false --excludeTaskDependencies --output-style=static
pnpm nx run rxdb-adapter-pglite:test --run worktree-history-isolation.spec.ts worktree-long-namespace.spec.ts --coverage.enabled=false --excludeTaskDependencies --output-style=static
pnpm nx run rxdb-plugin-history:test --run normal-merge-preview.spec.ts --coverage.enabled=false --excludeTaskDependencies --output-style=static
pnpm nx run rxdb-plugin-sync:test --run push-worktree-isolation.spec.ts --coverage.enabled=false --excludeTaskDependencies --output-style=static
pnpm nx run rxdb-adapter-wa-sqlite:test --run drop-storage.spec.ts --coverage.enabled=false --excludeTaskDependencies --output-style=static
pnpm nx run dev-rxdb-react:test --args='--run --maxWorkers=1 --config=vite.config.mts --environment=happy-dom src/app/pages/working-tree/working-tree.compare.spec.tsx' --excludeTaskDependencies --skipRemoteCache --output-style=static
```
