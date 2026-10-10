# AI Review 规则与记录

这个目录存放 review 记录模板与**尚未处理**的问题报告。目前没有待处理报告。

## 目录结构

报告只留**尚未处理**的条目。复核确认已修、或判定不值得做的条目直接删除——修法与判据都写在代码注释里，报告再留一份副本只会与代码漂移。整份报告清空即删文件，删前在下方「清理记录」留一行。目录里除 `README.md` 与模板外没有文件，就是没有待处理项。

| 路径                 | 说明                       | 剩余项 |
| -------------------- | -------------------------- | ------ |
| `README.md`          | 本说明、状态约定与清理记录 | —      |
| `review.template.md` | 新建 review 记录的模板     | —      |

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
