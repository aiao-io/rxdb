# AI Review 规则与记录

这个目录存放 review 记录模板、**尚未处理**的问题报告与按包保存的评审快照，当前入口见下表。

## 目录结构

报告只留**尚未处理**的条目。复核确认已修、或判定不值得做的条目直接删除——修法与判据都写在代码注释里，报告再留一份副本只会与代码漂移。整份报告清空即删文件，删前在下方「清理记录」留一行。目录里除 `README.md` 与模板外没有文件，就是没有待处理项。

`packages/` 是本次按用户要求保留的逐包评审快照：全部 51 个包各一份，即使未发现确定缺陷也保留范围与验证边界。是否存在待处理问题以包级索引和各报告的问题条目为准，不能仅凭快照文件存在判断。

| 路径                                        | 说明                                  | 剩余项                    |
| ------------------------------------------- | ------------------------------------- | ------------------------- |
| `README.md`                                 | 本说明、状态约定与清理记录            | —                         |
| `review.template.md`                        | 新建 review 记录的模板                | —                         |
| `requirements-incomplete-stories-review.md` | 未完成需求整体评审（不占 RV 编号）    | 37（14 P1 + 23 P2）       |
| [packages/PLAN.md](packages/PLAN.md)        | packages 全包评审计划（不占 RV 编号） | 51 个包                   |
| [packages/README.md](packages/README.md)    | 逐包报告索引、问题分级与本次校验结果  | 32（7 P1 + 23 P2 + 2 P3） |

## 状态约定

见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)。

## 工作流

1. AI review 发现问题 → 从 `review.template.md` 复制出 `RV-XXX-描述.md`，`status: Open`
2. 开 PR 修复 → 在 `pr` 字段记录 PR 链接
3. PR 合并、修复完成 → 删除报告文件，在下方清理记录留一行（修法与判据留在代码注释与回归测试里）

## 命名规范

见 [../CONVENTIONS.md](../CONVENTIONS.md#命名规范)。`RV-XXX-描述.md`，编号 `RV-001` 起递增。
例外：整分支 / 整包评审报告结论一次性给出、没有 Open/Resolved 生命周期，不占用 RV 编号；它们的「状态」体现为文件里还剩几条。

## 清理记录

每条只记删了什么、结论是什么；修法细节在代码注释与回归测试里。删除前的完整记录（含逐条修法、执行台账、进度页与 `evidence/` 取证目录）可用 `git show aaf155a1:requirements/reviews/<路径>` 取回。

- **2026-10-29（codex/supabase-update-cascade 两份分支评审删除）**：`codex-supabase-update-cascade-review-2026-10-29.md`（评审对象 `codex/supabase-update-cascade` @ `d73dbf6f`，1 P1 + 3 P2）与 `codex-supabase-update-cascade-branch-review.md`（同一 tip，1 P1 + 3 P3 + 1 观察项）逐条复核后删除。F-01 属实：DELETE 的 `inversePatch` 按协议不含 id，规范化阶段仅凭它非空就判了完整快照，RLS 隐藏的显式子行被允许的父删除级联后最终快照缺 id、按 id 过滤拉不到删除；改为该实体最后一条显式 DELETE 一律以触发器捕获的 `OLD` 为快照。F-02 / F-03 属实：触发器只按（分区根 oid，`OLD.id::text`）捕获实际删除，业务写之后再按 id 列类型的等值关系（与 DELETE 同一判据）把显式删除与捕获配对，`numeric(8,2)`、无修饰 `numeric` 存 `1.00` 而客户端发 `"1"`、经分区根表或叶分区的显式删除都不再追加隐式重复；比「按列类型修饰规范化文本」多覆盖了无修饰 numeric 这一同类反例，也不必新增公开函数。事务上下文随之改名 `rxdb.captured_deletes`。三个反例的回归在修复前的 02 / 04 上实测为红，评审原文的复现脚本修复后得到期望结果。F-04 与 P1-1 属实（同一问题）：merge 决议保留了 #168 之前的派生视图结构；重合 main 时 roadmap / status-overview / capability-matrix / epic-004 以 main 为底，只套 US-223/224 的状态、能力与交付行，数字经 `audit:requirements:update` 回写。P3-1 属实：未设置 `context.userId` 时直写修改仍下发 `createdBy`，与故事「`createdBy` 不下发」及 `SupabaseRepository.update` 不一致，改为修改载荷一律剥除（回归先红后绿）。P3-2 说法不实：`jsonb_object_agg` 撞键保留后一条、不报错（PG 17 实测）；改为等值配对后，同批两种 uuid 拼写的两条源日志都配到实际删除、都带真实 `OLD`。病态输入，不改 duplicate_write 的文本比较，判据写在配对处注释。P3-3 属实：RLS 复现 spec 的 afterAll 补清本 spec 两个实体的日志。观察项不修：直写删除零行静默成功是 US-218 起的既有语义，判据写在 `rxdb_mutations_apply_group` 注释。SQL 安全回归 39 个独立用例及 `all` 组合、适配器 43 个 spec / 630 条、lint / typecheck 通过。全文可用 `git show 70eafc06:requirements/reviews/<文件名>` 取回。

- **2026-10-29（codex/fix-vue-detail-async 分支评审删除）**：`codex-fix-vue-detail-async-review-2026-10-29.md`（评审对象 `codex/fix-vue-detail-async` @ `8da92bb8`，2 P2 + 1 项既有缺口）逐条复核属实，全部修复后删除。F-01：保存成功只清掉仍与提交时一致的覆盖项，保存期间的新输入保留（独立表单续写同一字段的回归）。F-02：等待与加载失败时只隐藏保存、取消仍在，加载失败原因进错误面板（补上既有的无可见错误缺口；三种独立详情的回归）；重试按钮未做，属新能力。C-01：本分支新增的展示把委托表单的宿主 `formData` 显示出来、提交却不带，改为与 real spec 既有约定一致（委托提交只含用户输入），宿主初始值只在等待数据库期间显示；让三端委托提交带上预填属约定变更，未做。rxdb-model-vue 372 条、rxdb-vue 228 条通过，两包 lint（max-warnings 0）/ typecheck / build 通过。全文可用 `git show e5a280f3:requirements/reviews/codex-fix-vue-detail-async-review-2026-10-29.md` 取回。

- **2026-10-29（PR #167 第三轮分支评审删除）**：`codex-fix-cross-tab-live-query-branch-review.md`（`codex/fix-cross-tab-live-query` @ `4ec1c8d9`，1 P1 + 3 P2）逐条复核，修 1 条、判不修 3 条后删除；报告只进过暂存区、没入库，取不回全文，结论以本条为准。P1-1 说法不实：门控在「没改读取属性」处早退、无筛选时读取属性为空，这两点属实；但无筛选查询没有「新匹配」，AC#2 管不到它——结果外缺行只能是结果此前就漏了（新行由 INSERT 追加），不是这条 UPDATE 造成的，main 上同样如此。照评审把整行检查挪到早退之前，判空条件（`null`、`= null`）会把补丁里缺失的列按空算，结果外本不匹配的行只改无关列也要整查，违背 AC#7；补「正文为空的 findAll，结果外的行只改标题不回 SQL」用例（套上评审改法即红），早退处注释写明判据。P2-1 说法不实：`Repository.get` 查空直接报错、流随之终结，`get` 任务不会停在 `null` 上等 UPDATE，评审的复现只能靠返回 `null` 的测试 runner；`applyGetUpdate` 注释与对应用例原把这一支写成「查的时候还不存在、随后被别的端建出来」的现场，一并改正。P2-2 不修：已是 US-032 的 Out of Scope，登记在 roadmap 零散收尾项第 6 条，判据在 `QueryManager` 的 `_need_change` 注释。P2-3 修：本故事不加 API，三端订阅同一条结果流，不另补绑定层用例，US-032 验证节写明这是共享核心的覆盖。核心复跑 2698 条通过、覆盖率不变，US-032 验证节随之更新。

- **2026-10-29（PR #167 第二轮分支评审删除）**：`codex-fix-cross-tab-live-query-review-2026-10-29.md`（`codex/fix-cross-tab-live-query` @ `4ec1c8d9`，1 P2 + 2 P3，无 P0 / P1）逐条复核属实，全部修复后删除。P2-1：where 里认不出的条件（大写组合子 `'AND'` / `'OR'` 能过 sqlite-core / PGlite 的 SQL 翻译）求值走到时改抛带条件原文的 `RxDBError`，不再落到 `get()` 的路径解析抛指不到条件的 `TypeError`，`QueryManager` 照旧按任务退回整查；收集侧维持跳过（求值走不到它说明短路已定结论），补「首条规则为真、走到大写组」与顶层大写组的用例。P3-1：`fieldColumn` 改名 `fieldProperty`，TSDoc 写明返回 JS 属性名而非数据库列名，门控里的 `readColumnsOf` / `touchesColumns` 一并改为属性口径。P3-2：`UpdateDataCache.getSerializedBefore` 去掉第二参（CHANGELOG 记为破坏性变更），类型契约用例钉住单参签名。合入前建议的复跑全部通过：核心 2697 条（覆盖率 95.56% / 92.14% / 95.77% / 96.25%）、wa-sqlite 1015 条（双连接 8 / 8）、树插件浏览器 256 条、graph 192 条、history 439 条、sqlite-core 1576 条、PGlite 1562 条，US-032 验证节随之更新。全文可用 `git show 7e92f1f8:requirements/reviews/codex-fix-cross-tab-live-query-review-2026-10-29.md` 取回。

- **2026-10-28（PR #167 分支评审删除）**：`a.md`（`codex/fix-cross-tab-live-query` @ `aea47e68`，3 P1 + 10 P2 + 2 P3）逐条复核，修 14 条、判不修 1 条后删除。P1 全修：UPDATE 完整性门控只在补丁改了查询读取的列时生效，只改无关列的冷缓存补丁不再整查；经多对一 / 一对一关系的条件与排序落到本表外键；where 遍历补上 `isRule` 守卫，与 `whereUsesRelations` 共用一套根段解析。P2：同批同 id 的多条 UPDATE 在 `UpdateDataCache` 里合并（`get` 任务同样合并并只收本类型事件）；树查询把父列交给门控；脏实体按已持久化的值判定；缓存比迟到事件新时回 SQL；门控缓存与 `_recalculate` 只收本类型事件；`= null` 按 `IS NULL` 判，JSON 缺键算空（顺带让日期等值规则遇到实体侧为空时不再抛错）；核心补带元数据的 findAll 整行用例，wa-sqlite 的 primeCache 变体持有残缺实体到最后一次断言，另补「只改条件不读的列不重数」的真实双连接用例；roadmap 的 count 成本按新触发条件改写，三处「门禁运行中」删除。P3 的注释与惰性求值随门控重写一并改。不修：无活任务时丢弃 UPDATE（P2-4）要先定身份缓存由谁更新，登记为 [roadmap 零散收尾项](../roadmap.md#零散收尾项不成故事随手可带)第 6 条，判据在 `QueryManager` 的 `_need_change` 注释。评审一处说法不实：P2-7 的 `!= null` 半条——`!=` 本在 `NULL_EXCLUDED_OPERATORS` 里，实体侧为空已判不命中，与 `IS NOT NULL` 一致，偏差只在 `= null`。全文可用 `git show b9b5c5f5:requirements/reviews/a.md` 取回。

- **2026-10-27（packages 增量评审删除）**：`packages/` 整包增量评审（51 份逐包报告与分组计划、跨框架复核、增量记录、汇总；去重 45 条：4 P1 + 26 P2 + 15 P3）逐条复核，修 42 条、判不修 3 条后整目录删除。P1 全修：sqlite-core 加密列 + 自定义主键列写入时 AAD 主键为空串、行永久不可读（PGlite 同病一并修，共享套件补「自定义主键 + 加密列」）；React `EntityTable` 卸载不复位 `tableReady`（真实触发是 `<Activity>` 隐藏再显示，生产同样中招，单靠 StrictMode 复现不了）；枚举编辑器把不在选项里的值静默改成第一项；devtools OPFS 上传静默覆盖同名条目（登记期与 commit 前各探一次，commit 写坏时撤掉本次新建的目标；面板的 `'sent'` 改为等到 upload 请求的应答）。INC-002 只有 PGlite 受影响：它不派核心事务事件，无日志实体的删除通知改挂到所属事务、提交后派、回滚丢弃；sqlite-core 由核心事务队列兜住，补了双后端共享回归。INC-001 改为断连再失败也还锁、抛原错。Supabase 定下远端列名契约（主键按 columnName，其余字段即属性名），`updatedBy`、树父列、`findByIds` 回填与之对齐；`saveMany` / `mutations` 遇自定义主键列在发请求前报 `SupabaseConfigError`（README 写明），`mergeChanges` 两端本就绑 `id`，不拦。其余按评审修：游标分页每次重跑按锚点已持久化的值现拼条件、可达性监视器零订阅方不排节拍、search 重入 `loadMore()` 不再顶掉 page-0 刷新且 React / Vue 的流错误改走框架错误通道、QueryCache `findById` 守作废代次、HTTP 写回执与 `findByIds` 行过时区门禁、utils 六条、Tauri 错误消息不带物理路径且 base64 先量长再解码、小程序 UTF-8 按 WHATWG 最大子部分替换、加密列写侧与读侧同样严格等。不修（判据在代码注释）：Electron 恢复标记清除失败后整目录回滚（删标记即提交点，回滚是文档化的原子性，不丢数据）；Tauri `batchTimeout` 溢出（当前 std 下不溢出、rusqlite 跳板有 `catch_unwind`，超过 100ms 的值与 100ms 等价）；`2FAuth` 分词（与 `IPv4Address` 同属数字与大写混写的歧义，后者评审称已解决不实，用 `displayName`）。评审另一处说法不实：model-react 草稿补建一条称 Angular / Vue 已覆盖迟到的 rxdb——Angular 的 `provideRxDB` 在 bootstrap 前就等完异步源、本无此问题，Vue 实际同样缺。Vue `EntityDetail` 的异步就绪缺口已修复：按响应式数据库引用补建 create 草稿与加载 edit 实体，数据库切换及卸载时清理旧草稿和查询，等待期间输入保留；回归覆盖 Promise / 异步工厂 / Ref 与实际保存。遗留事实：PGlite 自定义主键列只支持建与读（update / delete / 通知函数写死 `id`）；devtools 原生文件上传仍原子覆盖同名文件（根目录与数据库目录分开）；Electron `pg.backup.end` 传输失败要靠断开会话回收。全文可用 `git show 9fc768a7:requirements/reviews/packages/<文件>` 取回。

- **2026-10-19（RV-083 与 PR #122 整分支评审删除）**：`RV-083-pr122-working-tree-review.md`（1 P0 + 2 P1 + 13 P2）与 `worktree-rename-contexts-branch-review.md`（含 12 项待人工确认）逐条复核，随 #122 一并处理。P0：CI `ci / setup` 红在两处——基准归档键序（三端 a11y spec 的写入序改成 sort-json 的字母序，根治）与 `requirements/generated/package-knowledge.*` 摘要漂移（重新生成）。P1：roadmap 现状快照表与正文不一致（修正，并让 `requirements-consistency` 审计连表一起校验、`--update` 一起回写）；status-overview 「阶段 4～5 无故事认领」改为阶段 5 是 US-314。P2：插件后加的两张系统表补既有库重开用例（PGlite 磁盘库、sqlite-wasm IndexedDB 库）；只读检出位启动回收不再只接第一次连上（只断本地再连回来照样回收）；OPFS 占用探针自己失败时报真正那次打开失败、探针的错写进消息；`set_config()` 归入改会话状态的语句；三端对比与合并预览加六后端真库冒烟；Angular 死样式与死导入、US-313 实现文件、README 系统表计数、CHANGELOG 的 US-314 条目、PR 描述（US-314 阶段 A 与单端覆盖说明）一并修。决策：预览不在一个事务里读，owner 确认接受（US-312）；官方 sqlite 与 sqliteai 的 OPFS 由上游代理自带取句柄重试，demo 默认 sqlite-wasm（US-221）；只读检出位里文件元数据是打开那一刻的、文件内容是读取时的当前字节，三处文档统一；`mergeBasePoint` 回滚边界补用例时查出切换增量本身在「父分支撤销子分支已继承、又被子分支改过的变更」之后写错数据（PGlite 复现），另立 [US-315](../stories/collaboration/US-315-undo-inherited-change-switch-corruption.md)。其余待人工确认项：`!= null` 翻译、PGlite 只读事务里的 `SET CONSTRAINTS`、`idb-memory` 落库名均已核实无误。

- **2026-10-10（roadmap-cleanup-items 分支评审删除）**：`roadmap-cleanup-items-branch-review.md`（3 P1 + 12 P2）逐条复核属实并修复，报告未入库即删。P1：Angular `EntityDetail` 的 create 草稿改回 DIALOG_DATA 构造期同步建，独立用法由 effect 按与 Vue 端 watch 相同的触发源补建、只认 metadata，`creationChain` / `editChain` 改以同名别名 input 声明，同名类成员保持 main 的有效链路 computed（不再是破坏性变更）；coverage-acceptance 两份 run 配置删去顶层 `passWithNoTests`（runner 匹配为空必须 exit 1）；三端对拍 spec 等列表就绪、详情记录加载完再采集。P2：对拍共享目录挪到 `modules/e2e-parity` 并注册为 Nx 项目（`node --test` 单测），Nx 从三端 spec 的相对 import 建出依赖边，归一化先校验易失值形态再换占位符；Tauri expired 档的时钟推进改为主窗口回执、推进失败报 `clock_advance_*`；表格命令面 `EntityTableHandle` / `QueryTableHandle` 收敛到 `@aiao/rxdb-model` 三端共用；SQL 回归依赖同步触发器的用例自行恢复 `rxdb.sync_enabled`，runner 末尾加一轮全部用例同一事务的运行；Supabase 权限、组件样式（React / Vue 的 `index.css`，Vue 补上导出）、三端接入说明、`RxDBQueryOutput` 类型参数与 core.md 示例对齐源码；Angular / Vue subquery 的弱断言与 fake gear「不推进」用例改为能被对应变异体打红。

- **2026-10-09（未完成需求整体评审删除）**：`requirements-incomplete-stories-review.md`（24 条未完成故事；US-211 2 P1 + 2 P2、US-219 1 P2、BOM 1 P0 + 3 P1 + 约 20 P2）逐条复核全部属实并回写。US-211：AC#14 / #16 / #17 收敛为当前结论（探针迭代史只留在可行性矩阵支付宝「实验」行，拒绝路径已收口、AC#17 记 ✅），走查证据与当前 adapter 同为 sqlite-wasm 1.3.1、未复跑的只剩 Taro 4.3.0 构建在抖音 / 支付宝上，派生视图补「支付宝 demo 未上真机」；adapter README 指向的仓库内参考实现标明不随包发布。BOM：`routing` 唯一键补 `bom_type`（US-524 AC#11）；工时拆成 `setup_time` / `run_time` / `fixed_time` 共用 `time_uom`、费率带 `rate_uom`（US-524、US-514 AC#18 / #19）；来源被实例引用时 ECN 不可撤回 / 取消、草稿头下不可直接删（US-523 AC#7）；`ext` 的拒绝用例改靶行发生项（US-519 AC#2）；P2 的 References 补全、演进叙述删除与不可判定 AC 的改写就地修在各故事，另补 US-508 批次号可复现（AC#18）与 US-030 / US-518 对三维判定落点的互指。Epic 仍锁定，未改业务代码。报告未入库即删，结论只在上述故事里。

- **2026-10-09（RV-082 删除）**：BOM 映射跟进基线评审（1 P1）属实并回写：跟进基线由「末端行的发生项」改为「源侧解析步骤集合」`(逻辑行, 有效发生项, 解析所得子件修订)`，取自 US-508 manifest，并补写叶子子件（无 BOM 头）也记解析修订（US-508 AC#17）；祖先用量变、imprecise 修订变都进缺口，precise 锁版与评估日变化不产生假缺口；路径级只比那一条路径、行级比全部展开路径的步骤并集，按集合比、不枚举路径；确认跟进整体推进基线；步骤解析不出（`unresolved` / `truncated`）标「无法判定」（US-516 AC#16～#22）。换算率、`qty_formula` 参数与费率不进基线。Epic 仍锁定，未改业务代码。全文可用 `git show be91b9d7:requirements/reviews/RV-082-bom-mapping-resolution-baseline.md` 取回。

- **2026-10-09（RV-081 删除）**：BOM 需求复核（RV-080 删除后的再评审，5 P1 + 2 P2）全部属实并回写：存储层数值运算收窄字段域——阶梯边界加整数 / 小数各 15 位上限（US-511 AC#26），概率与分摊比例限 `[0, 1]`、9 位小数并按定点整数求和（US-511「十进制值合同」、US-512 AC#15、US-520 AC#10），不引入 SQLite 十进制扩展；ECN 发布、已发布改期与取消共用「转换后运行投影」聚合入口，删去「改期切片组成不变」的错误断言（US-515 AC#23～#25、US-512 技术笔记）；父逻辑行 / 组须来自已发布数据或同一 ECN、被引用的 ECN 不可取消（US-515 AC#26）；映射范围成员资格改为从根头出发的头链证明、物料级并集只剪枝（US-516 AC#15）；解析可见性按 `as_of_date` 而非宿主当日（US-509 措辞、US-508 AC#16）。Epic 仍锁定，未改业务代码。复核报告未入库即删，结论只在上述故事里。

- **2026-10-09（RV-080 删除）**：BOM 需求深度评审（10 P1 + 5 P2，无 P0）全部属实，结论回写 epic-009 与 US-507～US-525、US-030：十进制值合同（US-511）、结构归属列与已发布修订不可改（US-507）、ECN 保存期 / 发布期分工与「表 × 操作」矩阵（US-515）、解析不可见 ≠ 判环不可见（US-509）、替代组 / 阶梯按生效域切片（US-512 / US-511）、映射变换范围与路径（US-516）、成本单位与工序加工量（US-514）、主产物 = 头父件且联产品转价值待证（US-513 阶段 B）、导入同键全员失败（US-521）、一致快照（US-508）、PG 只支持 Read Committed（US-509）、配置 UI 明确不做（US-517）。「尚需产品回答」四条写成故事里的明确边界或待驱动裁决（US-511 / US-522 / US-523）。Epic 仍锁定，未改业务代码。全文可用 `git show 551b54b1:requirements/reviews/RV-080-bom-requirements-review.md` 取回。

- **2026-10-06（RV-022 删除）**：US-029 立项准入评审（2 P0 + 9 P1 + 8 P2）的结论已回写 US-029（价值待证、移出多租户，`priority: Low`）与 US-218 / US-220（Supabase RLS 推送完整性，均已交付）；其中撤销 / 重做与被拒变更的交互转入 [roadmap 零散收尾项](../roadmap.md#零散收尾项不成故事随手可带)第 11 条。全文可用 `git show 952be44f:requirements/reviews/RV-022-us-029-readiness-review.md` 取回。
- **2026-10-06（评审计划清理）**：删除 `packages/`（51 份）、`apps/`（22 份）评审计划与 `results/` 下一一对应的 73 份评审记录；可用 `git show 43d50d27:requirements/reviews/<路径>` 取回。遗留事实：RV-072（Tauri 宿主）、RV-075（Electron 宿主）只有单元/接缝级回归，真实宿主上未复验。
- **2026-10-06（文档清理）**：删除整个 `evidence/`（取证文件）、全部执行台账（`execution-2026-10-0*.md`、`follow-up-2026-10-03.md`）、进度页（`progress-2026-10-05.md`、`packages-progress-2026-10-05.md`）、`deep-review-plan.md` 与已修复的 RV-058，并去掉保留文件里指向它们的链接；README 压缩为现行约定与本记录。唯一被测试引用的夹具（working-tree-angular 的 ngc 编译产物）不再需要——该包补上 analog 插件后组件由测试编译，夹具组件直接写回 spec。
- **2026-10-06（遗留问题修复）**：wa-sqlite `executeHelper` finalize 失败不再漏收后续句柄、不再顶替原始错误；Supabase 树查询把整数 id `0` 当真实节点（`!= null` 判据，与 sqlite-core/PGlite 一致）；working-tree-angular 补 analog 插件后 R2-07 `setInput` 用例转绿；replay-angular R3-03 销毁断言前等 Angular 自身的 RAF 赛跑收尾；search-angular/react/vue 改用 workspace `@aiao/rxdb`，不再解析到过期的 0.0.25；fractional-indexing 随机序列用例去掉每步 O(n) 过滤，负载下不再超时。RV-074 复核为误判（同批多类型事件本就只广播一帧），补守卫用例，源码不改。
- **2026-10-06**：RV-059～RV-065、RV-069～RV-079 共 18 份（1 P1 + 17 P2）逐条复核属实并修复，整份删除。
- **2026-10-05**：RV-066/067/068 由外部任务修复，复跑回归通过后删除。
- **2026-10-05**：US-218 Supabase RLS 推送完整性准入评审未落文件，结论回写故事（❌ 不可按原文进入开发）。
- **2026-10-05**：RV-045/046/050（树筛选歧义、过滤祖先的树增量漂移、图查询 NaN 深度）与 RV-058（取消首次解锁仍落盘废弃凭据）修复；RV-058 文件于 2026-10-06 随台账一并删除。
- **2026-10-05**：RV-052/053/054/055（Sync 与 QueryCache 回推、回滚、SWR、outbox 覆盖）修复删除。
- **2026-10-05**：RV-030/031（dev-rxdb-http-server 非法 request-target 崩溃与请求边界）修复删除。
- **2026-10-05**：RV-027/028/029/034（核心 JS / SQLite / PGlite 三后端查询语义）修复删除。
- **2026-10-04～10-05**：RV-032/033、RV-037～RV-042、RV-051、RV-056/057（启动批与各边界批次）修复删除。
- **2026-10-03**：RV-026（US-028 分支评审）6 条修复删除；RV-024 / RV-025（US-028 开发准入复评）未落文件，结论回写故事。
- **2026-10-01～10-02**：RV-021（Epic-009 BOM 开发就绪评审，三轮复审）未落文件，结论回写 epic-009、US-507～US-525 相关故事与 [US-030](../stories/core/US-030-declarative-storage-constraints.md)，Epic 仍锁定（缺真实驱动者）；owner 于 10-02 确认默认决策 1～8，并提前解锁 US-030 阶段 A～C 进批次 3。
- **2026-10-02**：RV-021（US-027）、RV-022（US-028 立项）、RV-023（US-602）结论全部回写对应故事后删除。
- **2026-10-01**：RV-017（US-029）、RV-018（US-028）、RV-019（US-602）、RV-020（Epic-009 BOM）结论全部回写对应故事/Epic 后删除。
- **2026-09-27**：US-026 实例级同步覆盖、US-211 多端小程序宿主、US-211 宿主契约三份分支评审修复删除。
- **2026-09-26**：`review-vs-main-2026-09-25.md` 删除——P1「生产代码从不登记分支物化来源，`syncBranches()` 后首次 `switchBranch()` 恒抛」已修（来源契约移入核心 sync）；顺延的五项转入 [roadmap](../roadmap.md#epic-006-评审顺延的架构项)。
- **2026-09-25**：`review-vs-main-branch-review.md`（`b18def11..4926c162`）复核后删除。
- **2026-09-24**：`next-0912-branch-review.md` 与 `-max.md` 全部收口删除。
- **2026-09-23**：RV-013/014（适配器分支方法去留）、RV-015（CLI 插件生成器的缝，判据「`rxdb-client-generator` 不再指向任何 `rxdb-plugin-*`」已满足）、`002-rxdb-model-port-branch-review.md`、`2026-09-18-rxdb-core-review.md`、`next-0915-branch-review.md` 收口删除。
- **2026-09-22**：RV-012（`RxDBBranch` 去树化）、RV-016（repository `mergeOperations`）删除。
- **2026-09-11 及更早**：`requirements-incomplete-stories-review.md`、`next-1123-branch-review.md`、`next-0831-branch-review.md`、`next-11-rxdb-adapter-tauri-review.md` 删除。
