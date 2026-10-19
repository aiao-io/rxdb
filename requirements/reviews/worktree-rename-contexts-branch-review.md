# claude/worktree-rename-contexts 分支评审报告（PR #122）

> 评审对象：`claude/worktree-rename-contexts` @ `0c1cfee4`（PR [#122](https://github.com/aiao-io/rxdb/pull/122)「feat(aiao): 重构 working tree」）。
> 范围：与 `main`（merge-base `b49c8b50`）的净差异，363 个文件、约 2.4 万行新增。四个评审切片：核心库（rxdb / rxdb-model / plugin-history / plugin-working-tree）、六个存储后端适配器、三端 demo 应用、需求工件与文档一致性；另有 CI 证据、分支卫生与 PR 过程独立核对。
> 结论标注复验方式：读符号 / 跑命令 / 仅文档推理（标「推断」）。

## 结论（TL;DR）

- 主体工程质量高、叙事完整（PR 描述详尽、TDD 证据链清晰、三端对称与审计面齐备），**但当前 tip 的 CI 门禁是红的**：`ci / setup` 的 `nx format:check` 失败导致所有 lane 被跳过、`ci / gate` FAILURE。根因是 a11y e2e 改写 `benchmarks/reports/working-tree-ui-first-visible-angular.json` 后键序未按 `prettier-plugin-sort-json` 恢复——一行的修复量，修完必须重跑 CI 才能验证其余 lane。
- tip 提交 `0c1cfee4`（消息 "12"）引入了 **PR 描述完全没有提及的 US-314 阶段 A**（三端 `CreateBranchDialog` + e2e），而 `status-overview.md` 却声称 US-314 阶段 A「与 #122 一起交付」。评审者从 PR 页面上无法得知这段范围。
- 代码本体无 P1；两条 P1 都在需求工件：`roadmap.md` 状态汇总表头与自身正文矛盾（1/29 vs 2/30），`status-overview.md` 新行「阶段 4～5 尚无故事认领」与紧邻的 US-314 行（= 阶段 5）矛盾。均为一两行修复。
- 四个切片合计：**1 P0 + 2 P1 + 13 P2 + 12 项待人工确认**。P2 多为一行修复的收尾项；只有 3 条值得评审时逐条确认：P2-3（新系统表升级重开测试）、P2-11（重连后回收失活）、P2-13（探针错误盖原始错误）。
- 分支落后 main 3 个提交（#133/#134/#135），零文件重叠、MERGEABLE。

## 阻断问题（P0）

### P0-1 CI 门禁红：format:check 失败于被 e2e 改写的基准报告

- **证据**：PR #122 最新 run（head `0c1cfee4`，started 2026-10-17T21:37Z）`ci / setup` 在 `check-format`（`nx format:check`）列出 `benchmarks/reports/working-tree-ui-first-visible-angular.json` 后 ELIFECYCLE exit 1；`ci / gate` FAILURE，`ci / lint + typecheck`、`ci / test`、`ci / e2e` 等全部 SKIPPED。复验：`gh run view --job 117510505362 --log-failed` + `gh api .../check-runs`。
- **根因链**：a11y e2e 的 `working-tree.a11y.spec.ts` 里 `writeFile` 的对象字面量键序是 `metric, framework, route, firstPhase, firstVisibleMs, recordedAt, note`（main 上就是这序，本分支未改写入序）；`prettier-plugin-sort-json` 要求字母序（`firstPhase, firstVisibleMs, framework, metric, note, recordedAt, route`，main 上 checked-in 文件即此序）。tip 提交把一次 e2e 运行改写的文件按**写入序**提交了——即仓库已知噪音「e2e 每跑必改写该文件且键序过不了 prettier」的一次实弹。
- **修复（推荐根治）**：把三端 a11y spec 的 `writeFile` 键序改成 sort-json 字母序（`note` 提到 `recordedAt` 前），文件按该序提交——此后每次 e2e 改写都天然 prettier 合规，噪音永久消除。最小修复：仅还原该文件到 main 的排序版本。
- **修复后**：必须重推并等 CI 全部 lane 绿（当前 tip 上从未跑过 lint / test / e2e lane，分支的「全绿」结论只对旧提交成立）。

## 必须修（P1）

### P1-1 roadmap.md 状态汇总表头与自身正文、status-overview 矛盾

- **证据**：`requirements/roadmap.md` 表头 `| 🚧 In Progress | 1 |`、`| **未完成合计** | **29** |`，紧接着的正文写「仓库还剩 **30 条**未关闭故事（**2** In Progress + 6 In Review + 22 Backlog + 0 Blocked）」。本分支只改了 In Review（2→6）与合计两格，In Progress 那格是 context 行没动。status-overview 汇总为 2 In Progress（US-211 + US-314）、未完成 30（75/105 已交付，README.md 已同步）。
- **修复**：表头改为 `In Progress | 2`、`未完成合计 | 30`。

### P1-2 status-overview「阶段 4～5 尚无故事认领」与紧邻的 US-314 行矛盾

- **证据**：`requirements/status-overview.md` 新增行写「多检出位（v1 之后）阶段 4～5 尚无故事认领」，其上数行刚写入 `🚧 US-314 … 是多检出位阶段 5`，epic-006 分期表也明确「阶段 5 = US-314」且阶段 A 已随 #122 交付。
- **修复**：改为「阶段 4 尚无故事认领；阶段 5 是 US-314（阶段 A 已随 #122 交付，B/C 未开始）」。

## 建议（P2）

### P2-1 tip 提交引入的 US-314 阶段 A 未进 PR 描述

- **证据**：`gh pr view 122 --json body` 中 `US-314` 与 `createBranchFromCommit` 出现次数均为 0；而 tip 提交 `0c1cfee4` 新增三端 `CreateBranchDialog`（angular/react/vue 各 +193/+189/+202 行）、三端 `working-tree.spec.ts` 与 `working-tree-branches.ts` 的对应 e2e，且 `requirements/status-overview.md` 写明 US-314 阶段 A「三端 demo 的 History 右键与 New branch 共用「Create a branch」对话框，与 #122 一起交付」。
- **影响**：评审者看不到这段范围；PR 描述里的验证清单（`nx format:check` 通过等）对 tip 也不再成立。
- **建议**：在 PR 描述补一节 US-314 阶段 A 的说明，或把该提交拆出本 PR。

### P2-2 分支历史含 14 个杂项消息提交

- **证据**：`git log --oneline --no-merges main..review-target` 中有 12 个 `"123"` 类消息、1 个 `"1212"`、tip 提交消息 `"12"`（均为带真实内容的 checkpoint 提交）。历史中还保留着「改名 → 撤回」的完整往返（`ffb66c62` 改名、`31a0838c` 撤回）。
- **影响**：仓库合并采用 squash（main 上提交均带 `(#NNN)`），对 main 历史无实际污染；但若任何人需要保留合并提交，这些消息会进历史。
- **建议**：维持 squash 合并即可；如要保留历史需交互式 rebase 整理（本 PR 已声明「没有改写历史」，可接受现状）。

### P2-3 两条新插件系统表缺「既有库升级重开」回归测试（本仓库已知坑）

- **证据**：新增表 `rxdb_worktree`（`packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts`）与 `rxdb_commit_fork_point`（`commit/commit-fork-point.entity.ts`）；`system-entity-registration.spec.ts` 断言贡献表 10→12 张；全包 grep `reopen|重开` 只命中同版本重开（`commit-atomicity.spec.ts`），没有「旧代码建库（无这两张表）→ 新代码重开 → 表补建、旧数据完好」的用例。
- **为什么是问题**：仓库惯例要求新增实体表必须测升级重开（e2e 只测新库）。缓解因素（agent 复核属实）：核心 `RxDB.#ensureSystemTables` 连接期对每个系统实体 `isTableExisted` + 补建，两表均为 `log: false`，不触发「重建不存在表的触发器」的旧坑；但补建路径对插件贡献表生效这一点没有回归锁定。
- **建议**：在迁移类 spec 补一条：10 张表形态建库 → 重开 → 断言两新表存在、旧提交可读、`createBranchFromCommit` 对旧提交返回 `fork_point_unknown`（实体 TSDoc 已声明该语义）。

### P2-4 compareBranches / previewMerge 缺跨后端一致性用例（建议）

- **证据**：`branch-compare.spec.ts`（629 行）全部基于内存夹具，两函数依赖的区间规则（`id > min AND id <= max AND revertChangeId = null`）在六后端规则引擎的翻译无直接测试。缓解：与 `switchBranch` 共用 `compute_branch_transition_actions`（后者已接六后端 conformance），pglite 端有 `merge_branch.spec.ts` 锁合并分组。
- **建议**：任一 SQLite 系 + PGlite 各加一条真库冒烟：建分支 → compare/preview → 与切换后状态对照。

### P2-5 US-313 实现文件清单与故事自身的范围修正矛盾

- **证据**：`requirements/stories/collaboration/US-313-read-only-checkout.md` 实现文件清单写「demo — 菜单「Open read-only」、只读查看器…」，同一文件的 Out of Scope 与设计决定 8 明确「demo 不提供只读入口」，且三端 demo/e2e 里 grep 不到任何 `Open read-only` 入口（`fda96304` 已撤）。
- **修复**：把该行改为「demo 不提供只读入口（见设计决定 8）；worktree 界面随 US-314」或直接删除。

### P2-6 working-tree 插件 README 系统表计数自相矛盾

- **证据**：`website/docs/plugins/rxdb-plugin-working-tree/README.md` 顶部写「**十一张**系统表」，底部系统表一节（同一次 diff 改的）写「**十二张**」并列出 12 个实体（含 `Worktree`、`CommitForkPoint`）。源码确为 12 张。
- **修复**：顶部改为「十二张」。

### P2-7 CHANGELOG 缺 US-314 阶段 A 条目

- **证据**：`CHANGELOG.md` Unreleased 覆盖了 US-312 / US-313 / US-221 / US-311 与改名撤回（措辞正确，未写「已改名」），但 `createBranchFromCommit()` / `checkBranchFromCommit()` / `rxdb_commit_fork_point`（本分支合入的新公开 API）无条目。
- **修复**：补一条 Features（US-314 阶段 A）。

### P2-8 Angular 残留死样式与死导入（三端清理不对称）

- **证据**：`apps/dev-rxdb-angular/src/styles.scss` 保留 `.gd-branch-create-popover`（React/Vue 已删，全仓无引用）；`branch-menu.component.ts` 的 `Trash2` 导入与类字段在模板中零引用（React/Vue 无）。
- **修复**：各删一行。

### P2-9 Angular 缺 db-open-contention e2e（有文档化理由）

- **证据**：React/Vue 有逐字节一致的 `db-open-contention.spec.ts`（102 行），Angular 无；文件头注释与 `playwright.config.ts` 说明 Angular e2e 端口强制 IDB（失败现场归档要读同一个库），无法复现 OPFS 句柄争用。单元级覆盖三端齐（`db-connection.spec.ts` + alert spec）。
- **建议**：接受并在 PR 描述知会；长期可给 Angular e2e 补一个可切 OPFS 的端口配置。

### P2-10 US-311 草稿缓存 e2e 仅 Angular

- **证据**：两条用例（工作树系统表草稿、StorageFileMeta 草稿）只在 Angular e2e；React/Vue 有 /workspace 页面但无等价落盘断言。
- **建议**：PR 描述注明「US-311 e2e 仅 Angular 参考端」，或补另两端等价用例。

### P2-11 启动回收 `take(1)`：页内重连后新孤儿不再回收

- **证据**：`packages/rxdb-plugin-working-tree/src/plugin.ts` 的 `adapterConnected$.pipe(filter(Boolean), take(1)).subscribe(() => void this.#pruneWorktrees())`；`bootstrapExisting` 每次连接都重新判定并置 `#reclaimPending`，但 `take(1)` 只消费第一次。同实例 disconnect→reconnect 后，新判定的孤儿没有订阅消费，`#reclaimPending` 滞留到整页刷新或手动 `prune()`。
- **影响**：空间泄漏，非数据正确性。
- **修复**：去掉 `take(1)`（内部 pending 标志已防重复），或断开时重置订阅。

### P2-12 PGlite 封印的 `set_config` 会话设置孔（文档自认，可选收紧）

- **证据**：`raw-write-judgment.ts` 的 `breaksReadOnly` 中 `isSessionStatement` 只认首词 `pragma` / `set`，`SELECT set_config('default_transaction_read_only','off',false)` 首词是 `select` → 放行；`sealWorktreeReadOnly` 的 TSDoc 明确承认并说明每事务 `SET TRANSACTION READ ONLY` 是主要防线。当前快照库封后无适配器内部写路径，与「防误写不防蓄意」口径一致。
- **建议（可选）**：`breaksReadOnly` 对含 `set_config(` 的语句按改 session 状态拒掉。

### P2-13 OPFS 占用探针的 SecurityError 会盖掉重试用尽后的原始错误

- **证据**：`packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts` 的 `isOpfsAccessHandleBusy` 用 `file.createSyncAccessHandle()` 探测，非专用 Worker 上下文（主线程）该方法直接抛 `SecurityError`——重试用尽后把最后一次 `SQLITE_CANTOPEN` 换成与原因无关的 `SecurityError`。
- **修复**：探针把 `SecurityError` 归入 `return false`（原样抛出 CANTOPEN），或至少在 JSDoc 注明。

## 观察与正面事实（独立核对）

- 故事 YAML 状态自洽：US-221 / US-311 / US-312 / US-313 均 `In Review`，US-314 `In Progress`，与 status-overview 描述一致；`US-314-storage-options.md` 是无 frontmatter 的辅助文件（符合 CONVENTIONS 约定）。
- `US-310-named-worktrees.md` 与 `specs/011` 已按 PR 描述删除；全仓（requirements / roadmap / README）无 `epic-010` 残留引用。
- 系统 schema 版本仍为 7（`migration.spec.ts` 断言 `RXDB_SYSTEM_SCHEMA_VERSION` toBe(7)）——检出位登记表与提交分叉点是主库新增的系统表（插件贡献表，`log: false`），补建路径由核心连接期 `#ensureSystemTables` 覆盖，缺的是升级重开回归测试（见 P2-3）。
- `.github/workflows/ci-template.yml` 净变化为零；变更文件全部落在 packages / apps / requirements / website / scripts / benchmarks / .vscode，无敏感文件。
- 分支与 main 的 3 个新提交（#133/#134/#135）零文件重叠，GitHub 报告 MERGEABLE（BEHIND）。
- 不依赖 setup 的独立 workflow 在分支上 SUCCESS：electron-smoke ×3、tauri-smoke ×3、backup-cross-os ×3、desktop-gate、adapter-consumer——桌面端烟测信号是绿的。
- 拼写字典新增 "Worktree"（`.vscode/settings.json` 的 `cSpell.words`，插入位置 `Wechat` 与 `Wujie` 之间，字母序正确）。
- PR 描述本身质量极高：8 项变更说明、TDD 证据链、验证记录、破坏性变更说明齐全；唯一问题是它止步于 tip 提交之前。

## 分片详细发现

### 核心库（rxdb / rxdb-model / plugin-history / plugin-working-tree）

切片结论：**质量高，无 P0/P1**。逐项核实为真的关键声称：

- 「预览与真实合并共用压缩逻辑」：`preview_merge` 逐字调用 `find_source_changes` + `squash_source_changes`（与 `merge_branch` 同一函数引用），`merged` 口径两种策略与真实合并逐条对照一致，含 `netCount === 0` 早退。
- 「只读、不切换分支」：两函数全程只用 readers 的 `find`，无 `adapter.transaction` / `mergeChanges`；`VersionManager.orchestration.spec.ts` 新用例断言比较/预览不派发事件、不动 undo 栈。
- 只读实例公开写入口拦截清单完整：`Repository.create/update/remove/reorder` 在权限判定与 `primary$` 之前 `#assertWritable`；`EntityManager.mutations`（单条/批量/实例 save/remove 唯一汇聚点）第一行抛 `RxDBReadOnlyError`；`read-only-instance.spec.ts` 用 `it.each` 覆盖 10 个入口并断言仓储桩与适配器批量入口零调用。漏网面仅为适配器直写，由快照库的只读捕获钩子 + 引擎封印（`PRAGMA query_only` / 只读事务）兜底，TSDoc 明示分层设计。
- `RxDBReadOnlyError` 已导出且带 TSDoc，api-baseline 记录 `kind: "both"`。
- 只读实例静态解析修复属实：`resolveEntityManager` 改为「唯一实例直返；多个时优先唯一可写」，两条新 spec（`read-only-static-resolution.spec.ts`、`clone-entity-classes.many-to-many.spec.ts`）锁定。
- 主库 schema 未动：`RXDB_SYSTEM_SCHEMA_VERSION` 仍为 7，`packages/rxdb/src/system/` 无新增文件；新表是插件贡献表（`log: false`），由核心连接期 `#ensureSystemTables` 补建。
- US-311 落地属实：草稿缓存判定、`untracked` 第四类、m2m 中间表 `log: false && log: false` 不记日志（含两个切分支修复）、`cloneEntityClasses({ log: false })` 不回流源类。`query_cache_maintenance` entrance 名保留属有意（受信写登记表稳定标识），非遗漏。
- `branch-compare.spec.ts` 测试强度高：以夹具重放的「终点−起点」为独立判定基准（非手抄期望），四类覆盖断言到字段级，merge-base 语义覆盖父/子/兄弟/孙/多根/无自有变更等形态。
- conformance 约束遵守：US-313/314 用例收在新增 `worktree.suite.ts`（明示调用点建得了分支），capture 套件刻意绕开 `createBranch()`，套件接满六后端。
- 三端对称：`useWorktrees` 三端同名同字段（Angular Signal / React 渲染快照 / Vue ComputedRef）；entity-list 三端改动逐字对称（`buildEditableColumns({ readOnly })` + `deriveEntityCapabilities`）。
- api-baseline 与导出一致（rxdb +32、history +48、model 四包各 +4、working-tree +140）。

### 六个存储后端适配器

切片结论：**质量高，无 P0/P1**（3 条 P2 见上文）。核实为真的关键声称：

- **六端快照原语语义一致**：SQLite 系五端经 `RxDBAdapterSqliteBase` 共用 `sqlite-core` 的 `worktree-snapshot.ts`（rowid 分页、`PRAGMA table_info` 列对齐、形状不符抛「必须是同一种后端」）；PGlite 独立实现（`to_jsonb(t)::text` 读、`jsonb_populate_recordset` 写）。差异只在行编码与游标形状；读在主库单事务内、写一个事务，原子性与错误路径一致。`importWorktreeSnapshot` 拒装捕获运行时的库、不派发事件；加密列信封直通；`adoptWorktreeEncryption` 共享同一 keyring。封印对称：SQLite `PRAGMA query_only=1` + 封印后事务改延迟 `BEGIN;`（注释解释了 `BEGIN IMMEDIATE` 拿不到写锁）；PGlite 会话级 + 每事务 `SET TRANSACTION READ ONLY`。
- **drop-storage 六端行为一致**：位置推导与连接同一套；断开守卫真实（`#client_promise` 置 undefined）；占用探测各有实义（electron 宿主按库名大小写折叠扫会话、pglite 数 Web Lock 共享锁、OPFS `removeEntry` 退避重试）；`canDropStorage` 只读配置不碰存储；`fs-handle` / `AccessHandlePoolVFS` / `opfs-ahp://` / ElectronPGlite 均 false 且 `dropStorage` 同步拒绝——不会「建得出删不掉」。
- **US-221 重试机制逐项为真**：退避 `[50,100,200,400,800,1600]` 合计 3150ms；「失败那次的句柄先交出」真实（sqlite-wasm `openOpfsOnce` catch 调 `releaseOpfsCoopSyncHandles`，机制经上游 dist 源码核实；wa-sqlite dispose 链先 `vfs.close()`）；重试用尽后探针区分占用/其他 CANTOPEN；只对 OPFS 生效（逐 VFS 注释理由，与上游 OPFSCoopSyncVFS 源码逐行吻合）。
- **孤儿判定不会误删活跃快照**：`open()` 先拿锁再写登记行；`hasOrphanedWorktree` 用 Web Lock 持有状态做活性信号（锁名 `rxdb-worktree:<主库名>:<id>`，跨库命名空间隔离）；`prune()` 只碰 `ifAvailable` 拿得到锁的；判定放进连接期引导事务——避开了「连上后再开事务撞系统迁移锁」的仓库已知坑。
- **桩/真实分层成立**：node 下桩只限共享层单元（退避时刻 0/50/150/350/750/1550/3150 与实现逐毫秒对齐）；真实路径另有覆盖：`opfs-reload-race.spec.ts` 用真 module Worker + `opfs-handle-holder.worker.ts`（真 `FileSystemSyncAccessHandle`、不拿 Web Lock）复现竞态；六包 `drop-storage.spec.ts` 断言真实存储消失；AC10 经 `createDatabaseWithPersistentSnapshots` 落真 OPFS（`opfsFallback: 'throw'`）。
- **基线与 TSDoc 一致**：sqlite-core index.ts 新增 9 个导出与 baseline +36 行逐项对应；guard/preload 白名单同步加 `drop`；electron drop 协议不升版本的理由成立（老 host 在任何副作用前拒绝）；host drop 先旁文件后库文件、AC#3 不回显物理路径均有 spec 钉住。
- **conformance 是真行为断言且不违反 capture 约束**：判据「只读检出位读到的与真的切过去读到的逐行一致」；建分支走 `versionManager.createBranch`，套件头注释明示 capture 套件建不了分支的约束处理。
- **miniprogram 2 行改动必要且无害**：`WaSqliteClientRuntime` 新增必选 `open` 成员后的补位（`attempt => attempt()`）；不补该包编译失败；作为快照目标会被 `asSnapshotTarget` 以缺方法拒绝，行为一致。
- **PGlite 无已知坑重犯**：新增代码不含裸 `CREATE TRIGGER` 或带引号触发器函数名；`idbConnectionOf` 在 `close()` 拆 Module 前关掉 IdbFs 泄漏连接，`dropStorage` 不卡 `blocked`；删库后簿记删除失败时错误上抛、登记行留存由下次 prune 自愈——无吞错兜底。
- 观察级：官方 sqlite / sqliteai 的 OPFS 打开无 CANTOPEN 退避（US-221 只覆盖 OPFSCoopSyncVFS 双端，见待人工确认 9）；`SwitchSqlOptions` 有 TSDoc 但未进 index.ts / 基线（仅包内使用）；Electron drop 的跨进程占用盲区已文档化（依赖快照库名唯一 + Web Lock 独占）。

### 三端 demo 应用

切片结论：**质量高，无 P0/P1；三端对称性基本成立**。核实为真的关键声称：

- **三端 `branch-diff.ts` 逻辑一字不差**（三份 132 行 pairwise diff 为空，仅 import 路径不同）；`focus-trap.ts` 三端逐字节一致；`ime.ts` 逻辑一致。
- **branch-diff 对历史插件的假设全部为真**：`BranchDiffOperation` 三值映射穷尽、`MergePreviewConflict` 恰四种且文案与插件 TSDoc 语义逐一对应、`sideText` 用 `Object.hasOwn` 区分显式 null、覆盖计数取自 `preview.merged`、`HIDDEN_FIELDS` ⊇ `ENTITY_BOOKKEEPING_FIELDS`。
- **「选好来源即带预览」三端行为一致**：`openMergeDialog(sourceBranchId)` 立即 `loadMergePreview(source, 'squash')`；换来源/策略带请求代号防迟到结果落错；预览失败只显示错误、Merge 照常可点（设计意图）。
- **验收口径入口三端一致**：分支下拉底部合并入口（`wt-branch-merge-into`）、History 顶部对比下拉（`wt-compare-select`）+ 对比视图底部合并入口、History 右键「Create branch from commit」、点行即切换 + 脏工作树弹 Switch branch。
- **e2e 用例清单三端一致**：working-tree.spec 三端同 10+5 组用例；`working-tree-branches.ts` react/vue 逐字节一致、angular 复用本端 helper 同口径；a11y spec 三端逐条对齐。
- **a11y 断言真材实料**：`aria-haspopup="dialog"`、`aria-current="true"`、`aria-modal="true"`、焦点进名字框、`toHaveAccessibleName`、Escape 关闭、axe 扫描、live region 与键盘 Tab 走查（含焦点可见性）。
- **单测断言强度达标**：`focus-trap.spec.ts` 覆盖 Tab 尾回绕 / Shift+Tab 首回绕 / 非首尾不拦 / restoreFocus 连不连；`ime.spec.ts` 锁 `isComposing` 与 `keyCode === 229` 两条判据。
- **db-connection 与连接失败提示三端对称**：启动即连 + 守卫同一函数形态（canActivate / beforeEnter / loader）；错误捕获面为 `connect()` 全部异常；`DbConnectionAlert` 三端同 testid `app-db-error`、`role="alert"`、整页重载按钮；React 的 `RouteLoadError` + `isReportedDbConnectionError` 是 React Router errorElement 换壳这一框架差异的对应物，语义对称。
- **只读查看器撤除干净**：除三处 `focus-trap.ts` 注释外无组件/路由/死导入残留；旧 `wt-branch-create-popover` testid 全清。
- **search 页小改动**为纯样式重构（clsx / 静态 class 替换模板字符串拼接），三端成对；拖放修复的 `expectUndoCount` 去 flake 手法与 Angular/Vue 既有做法一致，并补 double-drop 回归单测。
- 观察级（既有差异，非本分支引入）：Vue 页无 keepLastGood（重读期间列表闪空，另两端停在上一份已知值）；Vue `requestDiscard` 读 status 与另两端快照口径不同——建议另开小 PR 对齐，不阻塞本 PR。

### 需求工件与文档一致性

切片结论：**无 P0；两条 P1（上文）与三条 P2（上文）均为一两行的文档修复**。核实为真的关键声称：

- **US-314 阶段 A 声称全部属实**：分叉点记在 `rxdb_commit_fork_point`（`CommitForkPoint` 实体，字段与故事技术笔记一一对应）；`createBranchFromCommit` / `checkBranchFromCommit` 实现于 facade（`branch-from-commit.ts`、`working-tree-facade.ts`），三端绑定与 demo 全部接线；六个后端各有 capture/commit/worktree 三套 conformance，从提交建分支用例收在 `worktree.suite.ts`（套件头注明 US-314 阶段 A）；三端 demo History 右键「Create branch from commit」与 New branch 共用 Create a branch 对话框。
- **US-313 抽查 AC 全绿**：`drop-storage.spec.ts` × 6 后端、`worktree-startup-prune.spec.ts` 连接期判定逻辑、sqlite/sqliteai 套件默认内存档仅 AC10 落 OPFS、三端 `useWorktrees()` 齐全。
- **US-312**：四类覆盖标注与 `branch-compare.ts` 定义 1:1；`UNTRACKED_BOOKKEEPING_FIELDS` 有测试断言 `toBe(ENTITY_BOOKKEEPING_FIELDS)`。
- **US-311**：`query_cache`→`untracked` 在代码与文档均无旧类别残留；Angular e2e 两条草稿缓存用例存在。
- **US-221**：`opfs-open-retry.ts` 退避序列 `[50,100,200,400,800,1600]` 合计 3150ms，与「合计约 3 秒」一致；实现文件清单 9/9 存在。
- **epic-010 并入干净**：review-target 上 epic-010 / US-309 / US-310 / specs/011 零残留（main 上本无 epic-010，分支内建又删），合并内容与删除前的 300 行 epic-010 一致，路径已同步。
- **api-baseline 与源码 1:1**（抽查 history / rxdb / working-tree / sqlite-core 各 4~6 个新导出，均在 index 链上真实导出）。
- **审计脚本**：`working-tree-suite-callsites.mjs` 6×3 = 18 个调用点与真实矩阵一致，spec 期望值同步；`api-surface.mjs` 例外清单注释充分。
- **website/docs**：`branch.md` 示例与真实类型形状一致；US-014 / US-216 行号引用更新准确；域名无漂移。
- 观察级（轻微陈旧，建议顺手修）：US-909 里「十张表」旧计数；epic-006 分期表阶段 5 未拆「阶段 A 已交付」；`worktree-startup-prune.spec.ts:62` 测试 dbName 残留旧包名 `rxdb-plugin-worktree`（全仓唯一，仅字符串）。

## 待人工确认

1. **mergeBasePoint 的回滚边界**（`branch-compare.ts` `mergeBasePoint` 计算）：共同祖先分支 tip 因回滚退到某子分支分叉点之下时，min 取回退后 tip，而该子分支 fork point 指向已回滚变更（被 `revertChangeId = null` 过滤跳过）。基准与「切换后读到什么」同口径，但冲突标注可能失真，且该角落无回归用例。建议补「分叉点之后回滚 + 再分叉」用例确认语义。
2. **`!= null` 规则翻译**（`commit-fork-point.entity.ts` 的 where 规则 `{ field: 'revertChangeId', operator: '!=', value: null }`）：依赖六后端规则引擎对可空列的 `!=` 翻译与 SQL NULL 语义一致。conformance 应能暴露，建议显式确认。
3. **`preview_merge` 非事务读**（TSDoc 已声明）：预览期间另有合并/切换落库，`merged`/entries 可能由两个时刻的变更日志拼成；读得再一致也保证不了随后那次合并落的就是预览。文档化取舍，由调用方判定可接受性。
4. **package-knowledge digest**：`requirements/generated/package-knowledge.{json,md}` 仅 digest 变化、正文一字未动。需实跑生成/审计命令确认与最新工作区一致（本评审未跑）。
5. **措辞口径分歧**：epic-006 写只读检出位展示「文件的**当前内容**」，storage / working-tree 两份 README 写「**打开那一刻**」。US-313 技术笔记支持「快照时点」语义。以哪个为准需 owner 拍板后统一。
6. **e2e 实跑状态**：本评审只读不跑测试。测试断言与 testid 链路闭合，但三个 e2e 套件（US-312 serial 用例、db-open-contention 的 Worker 占句柄路径）是否受仓库已知 flake 影响，以修复 P0-1 后的 CI 结果为准。
7. **Angular e2e 的 IDB 强制是端口硬编码**（`location.port === '8200'`）：未来 Angular e2e 换端口该前提即失效，届时应补 Angular 版 db-open-contention。
8. **benchmarks JSON 的 311ms** 出自本分支自身 e2e 重跑（recordedAt 在提交窗口内）；根治 P0-1 后重跑只会改 `firstVisibleMs`/`recordedAt`/`firstPhase` 三个值，不再有键序问题。
9. **官方 sqlite（oo1 `OpfsDb`）与 sqliteai 的 OPFS 打开路径是否有与 US-221 同形的刷新竞态**，以及三端 demo 的默认后端是否为这两个之一——决定退避重试是否需扩展覆盖。
10. **`SET CONSTRAINTS ALL DEFERRED` 在 PGlite 只读事务内的兼容性**（本评审未运行测试，仅由 conformance 间接覆盖）。
11. **`@subframe7536/sqlite-wasm` 的 `idb-memory` VFS 落库名是否同为 `<库名>.sqlite.db`**（dropStorage 按该名删，若不同则静默 no-op），库内未找到该 VFS 的命名证据。
12. **页内重连时 `adapterConnected$` 再次触发与 `bootstrapExisting` 再次运行的时序**（P2-11 的前提；无论订阅是否随作用域拆卸，缺口方向都成立）。
