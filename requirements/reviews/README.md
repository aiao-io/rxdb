# AI Review 规则与记录

这个目录集中存放**给 AI 做代码 review 用的规则/检查清单**，以及 review 过程中产出的结论记录。

## 用途

- **规则文件**：告诉 AI「review 时看什么、按什么标准判」的 md 文件
- **结论记录**：某次 review 发现的问题 + 根因 + 修复方案，修复后标记解决

## 目录结构

评审报告只留**尚未处理**的条目。复核确认已修、或判定不值得做的条目直接删除——修法与判据都写在代码注释里，报告再留一份副本只会与代码漂移。整份报告清空即删文件。

| 文件                             | 说明                                                                                     | 剩余项                       |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| `README.md`                      | 本说明与状态约定                                                                         | —                            |
| `review.template.md`             | 新建 review 记录的模板                                                                   | —                            |
| `next-0915-branch-review.md`     | next-0915 分支相对 main 的插件拆包与依赖调度评审（四轮）                                 | 4 条 P2                      |
| `next-0912-branch-review.md`     | next-0912 分支相对 main 的 epic-006「工作树 + 提交历史」评审（2026-09-23 复核 + 修复轮） | 4 条 P1 + 5 条 P2 + 其余待办 |
| `next-0912-branch-review-max.md` | 同上，max 独立复核轮（已修条目已删）                                                     | 4 条 Top + 3 顺延            |
| `next-11-rxdb-package-review.md` | next-11 分支 `packages/rxdb` 包评审                                                      | 4 块 + 1 条规格决策          |
| `REVIEW-rxdb-tree-vs-main.md`    | `rxdb-tree` 分支相对 main 的评审                                                         | C8 + 2 条 PR 说明            |

> **2026-09-23 清理**：`RV-013` 与 `RV-014` 两份整份删除——删除方向已全部落地。`RxDBAdapterSqliteBase` 与 `RxDBAdapterPGlite` 的 `localRxDBBranch()` / `localRxDBChange()`、`RxDBAdapterPGlite.createBranch()` 与 `src/version/create_branch.ts` 一并删除，调用点改显式 `getRepository(...)`（sqlite-core 侧不需要 cast：它的 `getRepository` 默认泛型就是 `SqliteRepository<T>`；pglite 侧必须写显式泛型，因为默认的 `IRepository` 上没有 `findAll`——RV-013 这两处的建议写法都不准）。**这是破坏性变更**，影响面不止定义所在的两个包：继承 `RxDBAdapterSqliteBase` 的 `RxDBAdapterElectron` / `RxDBAdapterTauri` / `RxDBAdapterSqlite`（官方与 sqlite-wasm）/ `RxDBAdapterWaSqlite` / `RxDBAdapterSqliteai` / `RxDBAdapterWaSqliteMiniProgram` 一起失去这两个方法，子路径 `@aiao/rxdb-adapter-electron/pglite` 的 `RxDBAdapterElectronPGlite` 还一并失去 `createBranch()`；替代入口是事务外 `getLocalSystemRepositories(rxdb)`、事务内 `executor.getRepository(E)`。顺带订正 RV-013 的三处判错（RV-014 已独立查到同样三处）：`version/create_branch.spec.ts` 测的是 history 插件活路径**不能删**；`RxDBAdapterPGlite.residual.unit.spec.ts` 那个用例还直接调 `createBranch()`，只删两行断言会留编译错误，须整体删；`rxdb_adapter_create_branch.spec.ts` 里那条走 `adapter.createBranch('*active*')` 的哨兵用例 RV-013 完全没列到（`assertUsableBranchId` 的覆盖仍在 `rxdb` 的 `active-branch-guard.spec.ts` 与 `rxdb-plugin-history` 的 `create-branch.spec.ts`）。另按 RV-014 把 `RxDBAdapterPGlite.mock-residual.spec.ts` 里那四条纯变更管线用例（generation barrier、长通知链、两条超时诊断）迁到新增的 `change-pipeline.spec.ts`，直接测 `flushPendingChangePipeline()`——原来它们靠 `createBranch()` 驱动，轮次断言里混着「入口自己那一轮」，迁走后回到管线本身的 2 与 7；适配器测试只留 `switchBranch()` 的入口级冲刷与事件抑制。最后订正 RV-013 高估的收益：删掉一行别名并不能从机制上堵住事务体内误写 `adapter.getRepository(RxDBBranch)`，`getRepository` 仍是公开抽象方法，实际收益是删掉冗余且误导的公开捷径与现存的错误样本。基线未动（`requirements/api-baseline/*.json` 只记顶层导出的 `{name, kind}`，类成员不在其中）。
> **2026-09-23 清理**：`RV-015` 的判据 1（CLI 加载插件生成器的缝）已落地并删除该节——配置项 `repositoryGenerators`（`<模块>#<导出名>`，按最后一个 `#` 切分以容纳 Node `imports` 子路径）、jiti 装载与四类拒绝（缺导出 / 非类 / 形状不符 / 重名），以及 `IRepositoryGenerator.abstractEntityMetadata`——抽象基类的装饰器实参是常量标识符、静态求值取不到值，元数据必须由生成器随身携带回填，这正是原先要反向依赖插件包的原因。`GRAPH_ENTITY_BASE_OPTIONS` 同时搬进零依赖的 `constants.ts`，`/generator` 子路径不再连带 rxjs 与装饰器求值。判据落在 `repository-generators.ts` / `RepositoryGenerator.interface.ts` 的 TSDoc 与 `repository-generators.spec.ts` 的用例里。顺带订正原判据的措辞：未声明生成器不是「不含图方法」而是 fail-closed 直接报错（继承插件基类的实体在分析阶段失败，只写 `repository` 名的在派发阶段失败），没有静默少生成的中间态。判据 2（`rxdb-client-generator → @aiao/rxdb-plugin-tree` 反向依赖）当时留给独立一轮，已在下面那条「RV-015 收口」里完成。
> **2026-09-23 清理**：`002-rxdb-model-port-branch-review.md` 整份删除——两条 P2 已收口：E2E 一条按「真实行为断言」补到三端对称（undo/redo 走按钮与 Ctrl+Shift+Z、筛选条件命中/不命中/重置的计数与空态），顺带修掉了 `41ce2181` 在 Angular / React 筛选面板上引入的 `aria-hidden="true"`（判据写在三端 entity-list 的面板注释与 `entity-list.real.spec.*` 的「筛选弹层的可聚焦控件必须留在无障碍树内」用例里）；coverage baseline 一条判定**不改**——`scripts/audit/coverage-check.mjs` 里 baseline 是「上次实测值」的趋势记录，硬门禁是固定阈值（核心包 90 / 其余 80），当前全部包都在阈值之上，按报告要求写回旧数字等于往实测文件里塞假数据。行内编辑 / 详情 Tab / 主题切换仍无 E2E：表格由 VTable 渲染在 canvas 上，行与行内编辑没有任何 DOM 抓手。
> **2026-09-23 清理**：`2026-09-18-rxdb-core-review.md` 与配套 probes 整份删除——两条 P2 已修（游标页 CREATE 合并按翻页方向裁到 limit；count 的 CREATE 不再本地加法而是回 SQL 重数），判据落在 `packages/rxdb/src/query/merge_create.ts` 的注释与 `review-query.regression.spec.ts` 的 Q4 / Q5 用例里。
> **2026-09-22 清理**：按上面的约定重扫全目录，删掉了已完成与判定不改的条目——`RV-012`（`RxDBBranch` 去树化，已 Resolved）、`RV-016`（repository `mergeOperations`，自身判据「`packages/**` 零命中」已满足）两份文件整份删除；各整分支报告里的「证伪项 / REFUTED」「❌ 不值得做」「误报订正」小节与行一并删除（判据均已落在代码注释与 TSDoc 里，报告不再留副本）。
> **2026-09-23 清理**：按约定重扫 `next-0912-branch-review.md` 与 `next-0912-branch-review-max.md`，删掉已修与判定不成立的条目，只留架构级与卡在前置决策上的。本轮落地的修复：`uninstallWorkingTreeCapture` 去掉那个「SAVED 查不到就焊上 bound 原语」的兜底参数（它恰好做了自己 docstring 警告的那件事），连带删掉 `rxdb-adapter.ts` 里随之失效的 `#rawWritePrimitives` 字段；`readBranchEntries` 由 `commit-command.ts` / `branch-commit-rows.ts` 两份合到 `capture-runtime.ts` 一份（id-asc 顺序是内容指纹的输入，分家就指纹分叉）；`commit-error-codes.spec.ts` 删掉那条「数组与 `Object.values` 互为全集」的同义反复；三端 a11y spec 的首次可见耗时不再把空串折成 `0 ms`（`Number('')` 是 0 而 0 有限，元素挂上但一个字没渲染时原断言照样绿）；`commit.suite.ts` 的 discard 版本号改从丢弃前的值推（原来拿返回值和事后重读比，是同一次写的两个出口，删掉 `+ 1` 两边一起停在原地也绿）；`metadata-only-branch-switch.spec.ts` 的激活行改现读（`removeMany` + `saveMany` 换行后种子实例照样绿）；`capability-enable.spec.ts` 的 `find` mock 开始认 `where`（原来无视条件恒返回种子行，读路径字段写错也绿）；Vue 的 `use-working-tree.spec.ts` 补 `afterEach` 卸载（~40 个组件原本挂满整个文件）；React 侧补「十二个方法引用跨 render 稳定」的用例（该契约写在文档里但没有任何测试钉住，丢掉 `useMemo` 全 spec 绿而消费者 effect 死循环）；`bench-working-tree` 接进 CI 的 `benchmark` job（与 `search-ci` 同 job 走 `nx run-many`，它是契约指定的普通 PR CI 唯一硬门禁），并清掉 `working-tree-reference.json` 里「待静默后复冻」的过期文案。判定**不成立**而删除的一条：`WorkingTreeRestoreSession` 的 `'conflicted'` 被报成死值，实际三端 spec、三端 README 与 `use-working-tree.ts` 的 TSDoc 都在用。
> **2026-09-23 清理（效率轮）**：`next-0912-branch-review-max.md` 的 §3 整节删除——四条全部落地。提交图守卫改成逐层取 ChangeSet（一次 `in` 一层，原来每个 commit 一条 `=`；分桶不用 `?? []` 兜底，而是先按本层 id 铺空桶、取不到键就抛，否则一条写坏的 `where` 会伪装成「这个 commit 没有变更集」，判据与红测试在 `commit-graph-guard.ts` 的 TSDoc 与 `corruption-guard.spec.ts` 的「同层的 ChangeSet 合成一次批量查」一组）；捕获热路径改成按批取（`createWorkingTreeCaptureBatch` + `readBranchEntries`，回归用例在 `capture-batch-queries.spec.ts`）；启用态的 raw-write context 改为装载那一刻建一次而不是每次取值新建；三端 `use-working-tree.spec` 的 ~150 行夹具（载荷构造器 + 两个门面的桩）下沉到 `@aiao/rxdb-plugin-working-tree/testing`，三份 spec 各自只留容器形态与挂载方式（Angular 的 `TestBed` / React 的 `renderHook` 与跨 render 稳定性 / Vue 的 `mount` 与显式卸载）。`next-0912-branch-review.md` §3.3 同步删掉两条已修的捕获热路径条目与 `write-commit.ts:374`（同事务重读，而那次重读正是 CAS 父 id 的来源，判定不值得改），并订正两条写错了判据的：`list-commits.ts` 那条原写「改动小、收益直接」，实际同层批量早就在了、剩下的每层往返是 BFS 本身（`Commit` 上没有 `branchId` 列），与守卫水位是同一件事；`status.ts` 那条原写「取决于 hook 调用频次」，实际挡住它的是 `IRepository` 根本没有聚合能力，属 §4.2 第 2 条的公开面决策。
> **2026-09-23 清理（兜底轮）**：清掉两个 SQL 适配器里变更触发器的分支兜底——`rxdb-adapter-sqlite-core` 的 `generate_table_trigger_sql` 与 `rxdb-adapter-pglite` 的 `generate_trigger_sql`，原先 `branchId` 可缺省、缺省回落 `'main'`。这个值被硬编码进触发器的 `INSERT ... VALUES`，决定该表此后每一次写入记在哪条分支名下；生成器替调用方填默认值等于在「这条历史算谁的」上替人做主，而做错了不报错。现改为必填（类型必填 + 运行期缺省即抛，挡绕过类型的 JS 调用方），三个原本不传的调用点（两个适配器的 `create_tables_sql`、sqlite 的 `migrateSystemSchema`）各自在注释里写出写的是哪条分支、为什么、窗口在哪。红测试在两个包的触发器 spec（「缺 branchId 时报错，而不是静默回落 main」）。`next-0912-branch-review.md` §2 的对应行只留行为那一半（迁移中途该不该读活动分支），并新增一行本轮顺带查出来的：pglite 侧**没有** sqlite 那样的「每个默认事务按真实分支重建触发器」自愈，所以在非 main 分支上补建的实体表会一直把变更记到 `main`，直到下一次切分支。
> **2026-09-23 清理（RV-015 收口）**：`RV-015-cli-plugin-generator-seam.md` 整份删除——判据 「`pnpm nx graph` 里 `rxdb-client-generator` 不再指向任何 `rxdb-plugin-*`」已满足（现只剩 `rxdb` / `utils` 两条边）。`TreeRepositoryGenerator` 连同 `TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS` 搬进 `@aiao/rxdb-plugin-tree/generator`，按 `GraphRepositoryGenerator` 的形状带上 `abstractEntityMetadata`（`TreeAdjacencyListEntityBase` 与 `@TreeEntity` 给手写实体的别名 `TreeEntityBase` 共用同一份声明）；生成器包删掉树条目、`BUILTIN_METADATA_RESOLVERS` 只剩 `@aiao/rxdb` 一条、`workspace:*` 依赖与 rolldown external 里的树条目一并清掉。**这是破坏性变更**：`@TreeEntity` 用户必须在 `rxdb.config.ts` 里加 `repositoryGenerators: ['@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator']`，否则 CLI 在派发阶段 fail-closed 报错（不是静默少生成）；仓内两个调用点（`packages/rxdb-test/rxdb.config.ts`、`apps/dev-rxdb-angular` 的生成器演示页）已同步。测试随生成器搬家：树的构建期用例落到 `rxdb-plugin-tree` 新增的 node 趟（`coverage` target，`VITEST_BROWSER=false`，只算 `src/generator/**`），原有 17 份运行时 spec 改名 `*.browser.spec.ts` 归 `test-browser` 趟，两趟 include 互斥、收尾合并回覆盖率闸读的目录。顺带修掉一个真 bug：`rxdb-client-generator` 的 rolldown external 逐条枚举 `node:` 内建，漏掉的 `node:os` 被打成空 stub，`./testing` 子路径一跑就是 `tmpdir is not a function`——改成 `/^node:/u` 整体外置。仍是字符串约定、**未**解耦的三处（有意保留，解耦需要另一条配置缝）：`entity-properties.ts` 把 `'TreeRepository'` 映射到 `features.tree`、`analyze-file.ts` 的 `ENTITY_DECORATOR_PACKAGES` 与 `case 'TreeEntity'`、`known-repository-generators.ts` 的报错提示表——它们只认字符串，不产生构建依赖，因此不影响上面的判据。
> 最近一次整分支复核：2026-09-23，见 [`next-0912-branch-review.md`](./next-0912-branch-review.md)（证据行号基于 HEAD `cef3abf0`）；该分支已于 2026-09-19 以 `2132c30d`（`feat(aiao): 添加 working-tree 能力 (#55)`）合入 main，报告里原「不建议合并」的结论已过期，但**仍有 4 条 P1 + 4 条 P2 未修**，全为架构级（跨连接能力传播、切换事务内 CAS、物化流水线接公开入口、前置条件进最终事务）。
> [`next-0915-branch-review.md`](./next-0915-branch-review.md) 另记 next-0915 插件拆包评审。
> 2026-09-11 的全量复核已清空 `requirements-incomplete-stories-review.md`；更早的
> `next-1123-branch-review.md`、`next-0831-branch-review.md` 与 `next-11-rxdb-adapter-tauri-review.md` 同样已删除。

## 状态约定

见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)。

## 工作流

1. AI review 发现问题 → 从 `review.template.md` 复制出 `RV-XXX-描述.md`，`status: Open`
2. 开 PR 修复 → 在 `pr` 字段记录 PR 链接
3. PR 合并、修复完成 → `status: Resolved`，补 `updated` 日期

## 命名规范

见 [../CONVENTIONS.md](../CONVENTIONS.md#命名规范)。`RV-XXX-描述.md`，编号 `RV-001` 起递增。
例外：整分支 / 整包评审报告（如 `next-0831-branch-review.md`）结论一次性给出、没有 Open/Resolved 生命周期，不占用 RV 编号；它们的「状态」体现为文件里还剩几条。
