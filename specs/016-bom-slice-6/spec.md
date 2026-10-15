# Feature Specification: epic-009 首轮切片第 6 步（US-515 变更管理 + US-525 阶段 C）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-15
**Status**: Draft

**Input**: 第 1~5 步已交付（含第 5 步的替代组/多输出/路线/工序损耗，affected 279/279 全绿）；按 [epic 切片表](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 推进第 6 步——US-525 阶段 C（时间轴：评估日、ECN 影响面与整体回退）的前置 US-515。

- [US-515 变更管理（ECN）驱动的生效期](../../../requirements/stories/domain/US-515-bom-change-management.md) — 全部 AC#1~#26
- [US-525 BOM 端到端 demo](../../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) — 阶段 C（AC#10~#12）

## 用户故事与优先级

### US1 ECN 实体与写入协议（US-515 保存期，Priority: P1）

- `ecn` 实体：`ecnNo`（unique）、`state`（draft/released/cancelled）、`effectiveDate`（创建即必填、draft 期可改）、`reason`；`effective` 是派生态（`released` 且 `effectiveDate` ≤ UTC 当日），不存派生态。
- 行发生项的 `ecn_in_id` / `ecn_out_id`（第 1 步已留列）启用：ECN 的单位是发生项——改量、换子件都是「旧发生项截止 + 新发生项引入」；`effective_from/to` 从 `ecn.effectiveDate` 派生，不手填（AC#5 冲突拒绝）。
- 已发布头写入协议扩展（「表 × 操作」矩阵）：放行挂 `draft` ECN 的新逻辑行、新发生项及其子表（位号/组/成员/分摊）、截止标记；拒绝改 `qty`、插不挂 ECN 的、`ecn_in_id` 指向已发布 ECN 的（AC#13/#14/#22）。
- 保存期约束：同一发生项只能一个截止方（AC#15）；只能截止 `ecn_in_id` 空或已发布的发生项（AC#16）；打截止标记时存储区间收窄（排他机制，AC#17/#18/#19）；draft ECN 的发生项在判环并集里（AC#10）。
- 解析可见性（US-508 AC#12 落地）：引入侧 `ecn_in_id` 非空且未发布 → 不入结果；截止侧 `ecn_out_id` 未发布 → 不采信 `effective_to`。

**Independent Test**：AC#5/#10/#13/#14/#15/#16/#17/#18/#19 + US-508 AC#12。

### US2 ECN 发布 / 取消 / 改期（US-515 状态机，Priority: P1）

- 发布：追溯生效拒绝（AC#8）；受影响头的跨行聚合（位号/阶梯/替代组/分摊）在**转换后运行投影**上整批校验（AC#9/#23/#24），失败整批回滚并点名冲突头/发生项/切片。
- 取消（仅未生效）：删除该 ECN 引入的子表行/发生项/逻辑行、清截止标记并恢复区间；被后续 ECN 截止过的引入发生项不可回退（AC#12）、引入对象仍被其他 ECN 引用不可取消（AC#26 ①③）；不留半生效状态（AC#4）。
- 改期（仅未生效）：级联更新引入/截止行的区间，**收窄先于放宽**；不得越过同一逻辑行后继 ECN 的生效日（AC#20）；改期/取消同样跑运行投影聚合校验（AC#25）。
- `effective` 之后取消/提前拒绝，改走更正 ECN（AC#7/#11）。

**Independent Test**：AC#3/#4/#6/#7/#8/#9/#11/#12/#20/#21/#23/#24/#25/#26。

### US3 影响面与差异查询（US-515 查询面，Priority: P1）

- 影响面：ECN 的成员发生项 → where-used 整机与路径（AC#1）。
- 差异：生效前后发生项集对比，四类各就其位（新增/删除/改量/改版，AC#2）。

**Independent Test**：AC#1/#2。

### US4 demo 阶段 C（US-525 AC#10~#12，Priority: P1）

- 种子 C 层：`ECN-2026-014`（改 3 张 BOM 的 5 行、生效日 2026-10-01）；另有一张**已生效**的种子 ECN（生效日固定在过去的日期，AC#12 ② 的「拒绝取消」演示面——已生效可进种子；「未生效」会随真实日期过期，不放种子，由用例现场新建）。
- 页面：ECN 面板（影响面 + 差异 + 现场新建/发布/取消）；评估日切换验证两段生效期行集不同且不读系统时钟（AC#10）。
- e2e：三条 AC 用例；分阶段 golden（A/B 层路径值逐位不变）。

## 约束与门禁

同前几步：TS strict / 零 ESLint 警告 / TSDoc；插件覆盖率 ≥ 80%；api-baseline 更新；双后端同断言（含直连 SQL 拒绝与发布校验）；affected full 全绿后提交。US-508 AC#12/#16 随本步关闭。

## 非目标

- 审批流；库存/在制订单处置；通用 ECN 依赖图（首期不跨草稿引用）；US-523 的来源引用保护（其 AC#7 在取消校验上追加）。
