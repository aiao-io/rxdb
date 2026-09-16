# next-0912 分支评审报告（vs main）

- **评审日期**：2026-09-16
- **评审对象**：`next-0912` 与 `main` 的全部差异（含未提交改动）
- **评审强度**：max（recall 优先，宁可多报不漏报）

## 评审基准（SHA）

> ⚠️ **main 即将更新。本报告的全部结论（含行号与"是否已在 main 上存在"的判断）基于以下快照，重新对齐时以此为准。**

| 角色                    | SHA                                        | 说明                                                          |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `main` 评审时顶端       | `68b0ba97dd25fe158564ce194f6fea37fefc8bd1` | commit `chore(aiao): bump uuid (#59)`，2026-09-15 00:44 +0800 |
| `next-0912` 评审时 HEAD | `e4f2813cf9fe709e320184ac44ace0ae823212c9` | commit `123`，2026-09-16 12:32 +0800                          |
| merge-base              | `68b0ba97dd25fe158564ce194f6fea37fefc8bd1` | 与 main 顶端相同：分支从当时的 main 干净分叉                  |

- 评审 diff 范围 = `git diff 68b0ba9..e4f2813c` 全部 337 文件（4.4 万行），**外加** HEAD 之上未提交的工作区改动（`packages/`、`scripts/` 下的代码部分）。
- **重新对齐方法**：main 更新后，用 `git diff 68b0ba9..<新对齐点>`（或 rebase 后 `git range-diff 68b0ba9..e4f2813c <新对齐点>`）重跑差异；文件中所有 `file:line` 行号会漂移，需以各发现的**缺陷描述与触发场景**为准重新锚定行号，并重新验证"该行是否已被后续提交改动"。
- 记录 SHAs 的等价命令：`git rev-parse main` / `git rev-parse HEAD` / `git merge-base main HEAD`。

## 1. 范围与方法

代码差异约 **4.1 万行 / 337 文件**，核心区域：

| 区域                               | 内容                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/rxdb/src`                | capture 拦截器、raw-write-gate、trusted-write、插件系统、sha256 / sql-literal、capability 水印、active-branch-guard、version 切换逻辑重写 |
| `rxdb-plugin-working-tree`（新包） | commit 图（CAS / codec / 指纹）+ working-tree（捕获钩子 / 冷重放 / 判断矩阵）约 8k 行源码                                                 |
| 三框架绑定（新包）                 | Angular / React / Vue 的 `useWorkingTree`                                                                                                 |
| 6 个存储适配器                     | pglite / sqlite-core / wa-sqlite / sqlite / sqlite-wasm / sqliteai / electron：switch_branch、system schema 迁移、一致性套件              |
| `scripts/audit`                    | 四个新审计脚本（core 边界、需求一致性、callsite 漂移、套件调用点）+ 发布门                                                                |

**流程**：16 个 finder agent × 10 个角度（逐行 ×5 区域、删除行为审计、跨文件追踪 ×3、语言陷阱、包装器正确性、复用、简化、效率、根因深度、规范）产出 74 条候选 → 去重后经 8 个验证 agent 逐条裁决（CONFIRMED / PLAUSIBLE / REFUTED）→ 1 个查漏 agent 补充 3 条新发现。

**结论**：15 条 CONFIRMED 正确性发现（已进入评审面板），12 条次要发现，约 30 条清理类发现。最突出的系统性问题是：**捕获层的实体身份解析损坏、系统实体隔离失效、以及多处"写了但没接线"的失效保险**。

## 2. 核心正确性发现（Top 15，全部 CONFIRMED）

| #   | 严重度 | 位置                                                                                                      | 缺陷                                                                                                        | 触发与后果                                                                                                                                                                                      |
| --- | ------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 严重   | [capture-hook.ts:167](packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:167)             | action key 用 `split(':')` 解析，而 core 的 key 内嵌 `rxid1:`+hex 身份前缀 → entityId 恒为字面量 `'rxid1'`  | **每次** mergeBranch / restore / undo 均触发：同实体多行折进同一条 entry（唯一索引 branchId+namespace+entity+entityId），行合并或丢失，冷重放与业务表分叉。一致性套件用手工裸 ID key 掩盖了问题 |
| 2   | 严重   | [capture-hook.ts:263](packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:263)             | 受信 merge/restore 的事务经被拦截的 `runInTransaction` 重入 mount point 1，同一写入被捕获两遍（无抑制标志） | workingTreeRevision 每行 +2（其他 tab 的 CAS 凭据被无效化）、重复 unit、entryCount 污染                                                                                                         |
| 3   | 严重   | [SchemaManager.ts:78](packages/rxdb/src/schema/SchemaManager.ts:78)                                       | 模块级 `SYSTEM_ENTITIES` 注册表进程全局、只增不减；`init()` 无条件注入 `config.entities`                    | 同进程一个实例装插件，**未装插件的实例**的库也会长出 10 张插件表（无初始行、无能力水印），破坏 FR-046 隔离；后续装插件会在此类库上跑 0004 迁移                                                  |
| 4   | 严重   | [capture-hook.ts:491](packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:491)             | raw-write 判定域未过滤系统实体，`rxdb_branch` / `rxdb_change` 等落入 `versionedTables`                      | `rawQuery` 写系统表被拒（`WorkingTreeWriteRejectedError`），与 spec 第 5 步（系统表 out_of_domain 放行）及其他 4 个挂载点的判定相悖                                                             |
| 5   | 高     | [system-entities.ts:90](packages/rxdb/src/system/system-entities.ts:90)                                   | 系统实体按**裸名**判定（无命名空间），bulk 拦截只传 entityName                                              | 用户实体名 `Commit` / `WorkingTreeState` 的 save / upsertMany 被分类为 system，**静默绕过捕获**，改动不进工作树与提交                                                                           |
| 6   | 高     | [write-commit.ts:303](packages/rxdb-plugin-working-tree/src/commit/write-commit.ts:303)                   | `assertCommitUnitsEncryptedAtRest` 零生产调用，指纹先于断言计算                                             | 明文值落进不可变提交历史并在 `contentFingerprint` 留下确证（FR-038 fail-closed 失效，`CommitEncryptedAtRestError` 永不触发）                                                                    |
| 7   | 高     | [raw-write-judgment.ts:178](packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:178) | SET 子句正则遇子查询里的 `FROM` / `WHERE` 提前截断                                                          | `UPDATE todo SET updatedAt=(SELECT max(updatedAt) FROM todo), title='x' ...` 只看到 updatedat（未跟踪字段）→ 判 untracked_only 放行，受跟踪列 title 被改而无捕获条目                            |
| 8   | 高     | [list-commits.ts:251](packages/rxdb-plugin-working-tree/src/commit/list-commits.ts:251)                   | `decodeCommitChangeSetUnit(s)` 导出但从未接入读路径                                                         | `getCommitDetail` 返回 `{$rxdbChangeValue:…}` 包络（bigint/binary 类型丢失）；按序重放会把包络写回业务表                                                                                        |
| 9   | 中     | [switch-result.utils.ts:259](packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:259)    | 移除 `...adapter.rxdb.context` 展开 → `updatedBy` 不再盖章，且**无条件**移除                                | 未启用提交能力的 sqlite 系库执行 undo/merge 后"最后修改人"错归他人（FR-046 逐字节不变被违反），无任何报错                                                                                       |
| 10  | 中     | [working-tree-suite-callsites.mjs:264](scripts/audit/working-tree-suite-callsites.mjs:264)                | 套件调用出现在**死函数**里也算 covered                                                                      | 6×2 适配器一致性矩阵静默缩水为 0 真实运行，CI 保持绿色（假阴性，已实测复现）                                                                                                                    |
| 11  | 中     | [working-tree-suite-callsites.mjs:99](scripts/audit/working-tree-suite-callsites.mjs:99)                  | 禁用修饰符正则是文件级的                                                                                    | 无关的 `it.todo(...)` 让有效顶层套件调用点被误判为缺失，CI 假阳性（已实测复现）                                                                                                                 |
| 12  | 中     | [write-commit.ts:387](packages/rxdb-plugin-working-tree/src/commit/write-commit.ts:387)                   | 幂等重放指纹里 author 原样哈希、message 却修剪                                                              | 重试时 author 仅空白差异（" Alice " vs "Alice"）+ 同 operationId → 抛 `CommitOperationMismatchError` 而非返回 `{status:'reused'}`                                                               |
| 13  | 中     | [diff.ts:186](packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:186)                             | `limit:0` 时 `page[page.length-1].id`                                                                       | `diff({limit:0})` 抛 `TypeError: Cannot read properties of undefined`；limit 全链路未校验                                                                                                       |
| 14  | 中     | [diff.ts:161](packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:161)                             | `entities:[]` 无空守卫 → 生成 `IN ()`                                                                       | `diff({entities:[]})` 拼出语法错误的 SQL；spec 用 mock 仓库掩盖了问题                                                                                                                           |
| 15  | 中     | [async-state.ts:232](packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:232)               | 判空只看 `entries`，transaction 粒度时 entries 恒为 `[]`                                                    | 三框架 hook 的 `diff({granularity:'transaction'})` 恒发 `phase:'empty'`，UI 显示空态而真实改动在 `transactions` 里                                                                              |

## 3. 验证中被修正与排除的候选

评审过程对每条发现做了对抗式验证，以下候选被修正或排除：

- **排除（REFUTED）**：restore-session 实体的 `activeKey` 列级唯一约束"全局唯一"判定——`activeKey` 的值就是 branchId（非终态时 = branchId，committed 时置 null），列级唯一恰好实现"每分支至多一个未结束会话"语义，不是缺陷。
- **修正**：双重捕获（#2）的"origin 被覆盖成 local / push echo"子断言不成立——现有路径内外两次捕获的 origin 都是 local，真实危害是重复条目 + revision 双跳；且因 #1 的存在，外层捕获（裸 ID）根本不与内层条目（`'rxid1'`）折叠，而是各写各的。
- **修正**：capability 水印盲区（旧 watermark 4/5 库被无插件客户端打开）的触发条件仅限**从未发布的 dev 构建**创建的库；且"被移除的旧全局版本门"归属有误——旧门本来就只拒"库比进程新"，真正移出 core 的是严格相等的能力三元断言。代码在 `migration.ts:36-38` 自己承认了这个缺口。

## 4. 次要发现（验证通过但未进 Top 15）

| 位置                                                                                                                                                                                                                     | 缺陷                                                                                            | 验证结论与触发条件                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [activation-state.ts:144](packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:144)                                                                                                                    | `allocateBranchGeneration` 读-改-写无 CAS，两连接可发出相同分支代际 → 同 operationId 撞唯一索引 | PLAUSIBLE：rollback-journal 模式静默丢失更新；WAL/OPFS 下是响亮的 `SQLITE_BUSY_SNAPSHOT`；PGlite 无跨进程共享                                                         |
| [migrate_system_schema.ts:146](packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts:146)                                                                                                                     | 零 active 且无 main 行时恢复 UPDATE 静默 no-op，水印照写提交                                    | PLAUSIBLE：状态难以到达（remove_branch 拒删 main），且 pull 路径会先走 resolve 自愈；sqlite 侧注释称该 no-op 为刻意设计                                               |
| [testing.ts:180](packages/rxdb-adapter-pglite/src/testing.ts:180)（sqlite-core 同）                                                                                                                                      | `cleanup_db` 清库后不恢复插件单例行                                                             | PLAUSIBLE：代码注释承认是刻意取舍并计划加"由调用方传入初始行"入口；当前仓内无触发路径                                                                                 |
| [capture-hook.ts:285](packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:285) + [trusted-write-scope.ts:85](packages/rxdb/src/trusted-write/trusted-write-scope.ts:85)                                   | adapter 级受信声明每 scope 只存一个且声明在事务内才消费，两个并发 merge/restore 声明互相覆盖    | CONFIRMED：后者声明丢失 → `WorkingTreeWriteRejectedError` 且业务写入回滚；switchBranch 同步消费不受影响                                                               |
| [capture-hook.ts:358](packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:358)                                                                                                                            | raw-write 判定从不传入 intent，step 2 受信放行是死代码                                          | CONFIRMED（前瞻性）：当前注册表无 rawQuery 调用点，但管道结构上无法携带 intent                                                                                        |
| [commit-graph-guard.ts:238](packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts:238) / [commit-capability.ts:216](packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:216)                  | `corruptedAt` / `enabledAt` 用客户端时钟                                                        | CONFIRMED：违反本子系统自己的 DB 时钟规则（`write-commit.ts:284` 明确禁止）；时钟偏斜产生误导性诊断时间戳                                                             |
| [use-working-tree.ts:130](packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts:130)（React/Vue 同）                                                                                                         | 三框架 hook 不校验 `workingTree` 存在性直接传给命令构造器                                       | CONFIRMED：未装插件时 hook 返回全 idle 状态，首个命令调用抛裸 TypeError，而非文档承诺的创建期拒绝                                                                     |
| [working-tree-fixture.ts:369](benchmarks/working-tree-fixture.ts:369)                                                                                                                                                    | 基准 fixture 从不调用 `database.use(rxDBPluginWorkingTree)`                                     | CONFIRMED：fixture 即死——`workingTree` 为 undefined，且 connect 时不会建插件表                                                                                        |
| [switch_branch.ts:203](packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts:203)                                                                                                                               | switch_branch 把事务体所有错误重新包装成 `RxDBAdapterSqliteError`                               | CONFIRMED（状态级不一致）：与分支新加的 rethrow-as-is 契约（`RxDBAdapterSqliteBase.ts:1364-1375`）自相矛盾；pglite 侧包装成另一个类，两端 `instanceof` 领域错误都失败 |
| [RxDBAdapterSqliteBase.ts:620](packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:620)                                                                                                                       | 迁移重建的变更触发器不传 branchId，回落 `'main'`，而 pglite 侧读 active 分支传入                | CONFIRMED（不对称，损失窗口窄）：默认事务每次会按真实当前分支重建触发器自愈；仅绕过事务日志的窗口期写入会被标错分支                                                   |
| [migrate_system_schema.ts:111](packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts:111)（sqlite-core:155 同）                                                                                               | 旧库含 2+ 行 `activated=true` 时迁移抛错，connect 永久失败，无库内恢复路径                      | CONFIRMED（有意的 FR-048 行为）：旧 schema 无约束允许该状态，守卫文档明确"不挑一个留下"；升级即无法打开库                                                             |
| [core-plugin-boundary.mjs:71](scripts/audit/core-plugin-boundary.mjs:71) / [126](scripts/audit/core-plugin-boundary.mjs:126)、[working-tree-suite-callsites.mjs:185](scripts/audit/working-tree-suite-callsites.mjs:185) | 审计脚本另 3 个解析缺陷                                                                         | CONFIRMED（已实测）：字符串字面量里的 `from '…'` 被当 import；嵌套 `__tests__` 目录被扫进边界门；`if (cond) /['"]/` 正则字面量导致词法器清空文件其余部分              |

## 5. 清理与架构类发现

### 5.1 复用（重复实现）

| 位置                                                                                          | 内容                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [sql-literal.ts:43](packages/rxdb/src/system/sql-literal.ts:43)                               | SQL 标识符/字符串引号工具共 3 份副本（core 新写 + pglite.utils + sqlite-core.utils），且 NUL 处理策略已分歧                                        |
| [pglite.utils.ts:503](packages/rxdb-adapter-pglite/src/pglite.utils.ts:503)                   | `normalizeEntity` 逐行复制 core `normalizeUpdateEntity`（sqlite-core 是 re-export）；两份副本已有分歧（readonly FK 过滤不同）                      |
| [migration.ts:133](packages/rxdb/src/system/migration.ts:133)                                 | `isUniqueConstraintViolation` 三份实现，sqlite-core keyring 版缺少 `23505` 分支，冲突分类不一致                                                    |
| 各 adapter `__tests__/*-factory.ts`                                                           | 6 个测试工厂复制同一骨架（QueryCounting 子类、WeakMap、插件先于 connect 的顺序规则仅靠复制的注释维系）                                             |
| [switch-result.utils.ts](packages/rxdb-adapter-pglite/src/version/switch-result.utils.ts:127) | 约 300 行 switch 结果 SQL 脚手架跨 pglite / sqlite-core 复制，注释自承"两家在这一格上必须长得一样"，但 `hasNoWritableColumn` 已调用不同 normalizer |
| [testing.ts:219](packages/rxdb-adapter-pglite/src/testing.ts:219)                             | `cloneEntityClasses` 逐字复制 sqlite-core 版，走 `ɵMetadata` 内部符号                                                                              |
| [test-utils.ts:55](packages/rxdb-adapter-sqlite-core/src/__tests__/test-utils.ts:55)          | `cleanup_db` 重复实现 `@aiao/rxdb-test` 的 `cleanupSqliteTestAdapter`                                                                              |

### 5.2 简化（冗余状态与复制粘贴）

| 位置                                                                                                                                                                                                    | 内容                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [branch.ts:50](packages/rxdb/src/system/branch.ts:50)                                                                                                                                                   | `activeKey` 是 `activated` 的第二份拷贝（`activated ? '*active*' : null`），约 10 处生产写点手工共写，每处都带"漏写一处就绕过唯一约束"注释；生成列或部分唯一索引可一处编码不变量 |
| [sha256.ts](packages/rxdb/src/system/sha256.ts)                                                                                                                                                         | 151 行手写 FIPS 180-4 实现（实现本身经核验正确）；指纹写入不可变历史，算法换不动；引入同步同构依赖更简单                                                                         |
| `columnOf`                                                                                                                                                                                              | 同一 helper 三份副本（commit-capability / write-commit / working-tree-state-sql），仅错误消息不同                                                                                |
| [commit-graph-guard.ts:168](packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts:168)                                                                                                     | `nextParents` 与 `list-commits.ts:124` 的 `nextFrontier` 字节级相同，应导入而非重定义                                                                                            |
| `MAIN_BRANCH_ID = 'main'`                                                                                                                                                                               | 3+ 包重复声明 + 裸字面量，各带"与其他一致"注释                                                                                                                                   |
| [migrate_system_schema.ts:80](packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts:80) / [RxDBAdapterSqliteBase.ts:126](packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:126) | 约 90 行 activeKey 回填序列跨两后端复制（仅方言差异），且两端的语句收集协议也不同（逐个执行 vs `---STATEMENT_SEPARATOR---` 拼接）                                                |
| [bulk-write-gate.ts:20](packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:20)                                                                                                       | `BulkWriteOperation` 重声明 core 的 `InterceptedBulkWrite` + 三张按操作键的查找表；类型漂移无编译错误                                                                            |
| [rxdb-plugin-system.ts:47](packages/rxdb/src/rxdb-plugin-system.ts:47)                                                                                                                                  | 单字段 context 包装对象（文档理由"以后加字段"），增加间接层                                                                                                                      |

### 5.3 效率

| 位置                                                                                                | 内容                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [commit-graph-guard.ts:208](packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts:208) | 每次 commit/discard/switch 全量重验整张可达提交图：每提交一次顺序查询 + 全部变更单元重哈希，1 万提交时每次保存 O(N) 查询——图是只追加的，可持久化"最后已验证 HEAD"水位 |
| [capture-runtime.ts:245](packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:245) | 每个被捕获变更重读 active-branch token（同事务里上一行刚读过）：一实体一写 4 次查询，M 实体 2M 次冗余查询                                                             |
| [capture-runtime.ts:254](packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:254) | `persistEntry` 重复 `readEntry` 刚做过的 findEntry 唯一索引查询；`bumpWorkingTreeRevision` 每变更读/写一次状态行而非每批一次                                          |
| [list-commits.ts:158](packages/rxdb-plugin-working-tree/src/commit/list-commits.ts:158)             | 线性历史下 BFS 每层一次往返 = 每提交一次顺序查询；`idx_commit_first_parent` 索引与批量 `in` 查询已存在却未用                                                          |
| [status.ts:152](packages/rxdb-plugin-working-tree/src/working-tree/status.ts:152)                   | 两个顺序 COUNT(*) 而非一个 `GROUP BY origin`；三框架 hook 每次 commit/discard/enable 后都自动调 status                                                                |
| [RxDB.ts:1407](packages/rxdb/src/RxDB.ts:1407)                                                      | 每次 connect 约 14 次顺序 `isTableExisted` 探测（系统实体）                                                                                                           |
| [write-commit.ts:374](packages/rxdb-plugin-working-tree/src/commit/write-commit.ts:374)             | `writeCommit` / `readCommitLogPage` 在同一事务里二次读取刚读过的 CommitBranchRef 行                                                                                   |

### 5.4 根因深度

| 位置                                                                                                        | 内容                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [trusted-write-scope.ts:77](packages/rxdb/src/trusted-write/trusted-write-scope.ts:77)                      | 受信写标记是公开导出的自报（文件·符号·意图）字符串键，运行时只查表不校验调用方；唯一机械校验是词法审计脚本且只扫 `packages/`——第三方适配器可仿冒已注册键让写入无条件受信。深层修复：把意图做成写入原语选项上的结构化字段 |
| [working-tree-callsite-drift.mjs:68](scripts/audit/working-tree-callsite-drift.mjs:68)                      | 审计脚本硬编码接收者变量名/文件名清单与运行时闸门策略重复——变量一改名就要改脚本，包外代码又完全扫不到                                                                                                                    |
| [versioned-domain.ts:234](packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:234)       | 插件用 `'$'` 字符串拼接重建各后端物理表名（复制 sqlite-core 的命名规则），而非由拥有命名规则的适配器暴露解析——命名规则一变，raw-write 门对受版本表静默放行（文件注释自承"漏登记的后果是静默放行"）                       |
| [active-branch-guard.ts:47](packages/rxdb/src/system/active-branch-guard.ts:47)                             | `'*active*'` 哨兵与用户数据同命名空间，安全性仅靠"`*` 不是合法分支 ID"的注释级约定，无任何创建/导入路径校验                                                                                                              |
| [capture-mount-points.ts:60](packages/rxdb-plugin-working-tree/src/working-tree/capture-mount-points.ts:60) | 挂载点注册表第三处编码 core 的原语清单（参数名序列靠源文本 spec 对齐），且运行时从不调用——漏改只会在测试里响                                                                                                             |
| [working-tree-callsite-drift.mjs:324](scripts/audit/working-tree-callsite-drift.mjs:324)                    | 漂移扫描器用字段顺序正则重新解析 TS 里的受信注册表（第二份编码）——无害格式化改动即断 CI，或部分匹配静默审计旧形状                                                                                                        |
| [active-branch-guard.ts:95](packages/rxdb/src/system/active-branch-guard.ts:95)                             | 错误码字符串 core 与 plugin 各一份，靠"钉住两者的测试"维系——只修一边则 catch 分支匹配不到                                                                                                                                |
| [switch_branch.ts:78](packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts:78)                    | 分支翻转修复与 activeKey 回填按后端各写一遍，且两端修复同一根因（多语句 RETURNING 丢行）用了不同机制                                                                                                                     |

### 5.5 规范符合性（CLAUDE.md / AGENTS.md）

- **[AGENTS.md:36 / CLAUDE.md:69](AGENTS.md)「ESLint 零警告，禁止忽略警告」**：4 处新增 `// eslint-disable-next-line @nx/enforce-module-boundaries`（[trusted-callsite-registry.spec.ts:61](packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts:61)、[capture-mount-points.spec.ts:35](packages/rxdb-plugin-working-tree/src/__tests__/working-tree/capture-mount-points.spec.ts:35)、[trusted-callsite-capture.spec.ts:26](packages/rxdb-plugin-working-tree/src/__tests__/working-tree/trusted-callsite-capture.spec.ts:26)、[write-entry-matrix.spec.ts:47](packages/rxdb-plugin-working-tree/src/__tests__/working-tree/write-entry-matrix.spec.ts:47)）——均为跨包读 `specs/` 契约原文或核心源码 `?raw`。注：均为单行、有注释理由的定向抑制，lint 仍报零警告，属"字面违反禁令、实质争议"。
- **[read_current_branch_id.ts:38-39](packages/rxdb-adapter-pglite/src/version/read_current_branch_id.ts:38)「无 fallback 兜底」**：`metadata.propertyMap?.get('id')?.columnName ?? 'id'` 元数据缺失时静默兜底裸列名——本仓 `write-commit.ts` 的 `columnOf` 明确拒绝的正是这个形态（"列名一旦被改，兜底会拼出一条语法正确、却永远匹配不到任何行的 UPDATE"），且同包 `migrate_system_schema.ts:87-89` 对同样场景是抛错。

## 6. 修复优先级建议

**第一批（数据完整性与捕获语义，建议合并前修复）**

1. #1 entityId 解析——改用 core 已有的 `parseRxDBChangeKey` → `parseRxDBEntityIdentityKey`；同时给一致性套件换用 `getRxDBChangeKey` 构造真实 key，防止再次被掩盖
2. #2 双重捕获——为钩子自开的事务加抑制标志或"原始事务"逃生口（文件头自述的设计意图："钩子要在原语外面加一层，必须能拿到不含自己的那一层"）
3. #3 SYSTEM_ENTITIES 污染——注册表从模块级改为实例级，或 `init()` 只注入当前实例贡献的实体
4. #4/#5 系统实体域判定——`targetClassOf` 改为命名空间 + 名字双匹配；raw-write 域构建时过滤系统实体
5. #6/#8 失效保险接线——`writeCommit` 在指纹前调用加密断言；`getCommitDetail` 返回解码后的 changeSet
6. #7 raw SQL 判定——正则换成真正的词法切分（或至少把子查询排除在终止符匹配外），并为"未跟踪列 + 受跟踪列"混写场景补测试

**第二批（API 正确性）**

7. #13/#14/#15 diff API 三兄弟（limit 校验、空数组守卫、判空看 granularity）
8. #12 author 统一修剪；#9 updatedBy 恢复（至少对未启用能力的库）；#10/#11 审计脚本假阴/假阳

**第三批（次要正确性与架构）**

9. 并发声明覆盖、错误重包装契约、三框架 hook 校验、benchmark fixture、客户端时钟 → DB 时钟
10. 5.4 根因类逐项：受信标记结构化、表名解析归属适配器、错误码单源、跨后端脚手架共享
11. 5.1–5.3 复用/简化/效率按成本收益排期（commit 图全量重验与 capture 热路径冗余查询是两项高收益优化）
