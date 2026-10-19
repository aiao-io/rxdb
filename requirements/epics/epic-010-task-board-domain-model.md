---
id: epic-010-task-board-domain-model
status: Backlog
startDate: 2026-10-19
targetDate: TBD
owner: jimmy
---

# 任务看板领域模型

## 愿景

让一个 Trello 类的**单人任务看板**成为 RxDB 的「下一个完整演示应用」：Board / Column / Task
三层模型、跨列拖动、任务详情、重开恢复与备份导出闭环，三端一致交互，**全部建在引擎已有能力上**。
团队版（Supabase 同步与身份）另行；评论 / @ 提醒明确出界。对标：Trello（品类鼻祖，RxDB 上游
经典 demo 原型）；Asana / Teambition / 飞书项目；Jira 的重协作侧不在对标范围。

## 为什么单列一个 Epic

与 [epic-009 BOM](epic-009-bom-domain-model.md) 同型：它不是引擎能力——`@aiao/rxdb` 不会因为它
多出一个查询原语；它是**应用领域模型**，一层建立在现有实体 / 仓储 / 活查询之上的产品语义。

**但分界线与 BOM 相反。** BOM 要先补 CHECK / 多重边（US-030 / US-507）才能开工，本 Epic 对引擎的
要求是**零**——全部故事只消费已 `Done` 的能力：

| 产品功能     | 引擎现有能力                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ |
| 看板拖拽排序 | 可排序实体：分组排序域与跨组移动（US-028 阶段 D）、三端 Playwright 真实拖拽验收（US-028 阶段 B） |
| 树排序迁移   | US-031（先例：三端同一张落点判定表）                                                             |
| 撤销重做     | US-302（durable undo + 会话级 redo）                                                             |
| 备份恢复     | US-217（只承诺同 adapter 恢复）                                                                  |
| 任务搜索     | US-702 FTS5（web）/ US-703 PGlite tsvector，三端 `useSearch()`                                   |
| 团队同步     | US-218 / US-220 Supabase RLS 推送完整性（US-533 的底座，见其价值待证）                           |

引擎缺口为零，所以本 Epic 没有一条「先补引擎」的故事；领域语义（移动落点、批量改序、备份接线、
三端交互）全部落在应用层。

## 目标

三条都是可核对的状态：

- [ ] 一套 Board / Column / Task 模型承载单人看板：排序域按列分组，跨列移动就是改分组字段的
      重排，删除级联在应用层事务内显式执行（[US-526](../stories/domain/US-526-board-column-task-skeleton.md)、
      [US-527](../stories/domain/US-527-cross-column-move-ordering.md)）；
- [ ] 重开恢复与备份导出闭环——「浏览器清数据即丢库」的对策是一等公民，不是可选功能
      （[US-529](../stories/domain/US-529-board-backup-restore.md)）；
- [ ] 三框架对称的看板交互（[US-531](../stories/domain/US-531-board-tri-framework-ui.md)），
      单端缺失 = 未完成；
- [ ] 一份确定性种子数据在一个一键可起的 demo 里走完全域，组合缺陷在 e2e 上显形
      （[US-532](../stories/domain/US-532-board-end-to-end-demo.md)）；
- [ ] 团队版：Supabase 同步与身份（[US-533](../stories/domain/US-533-board-team-sync.md)，
      价值待证，不随本记录解锁）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-526 看板领域模型骨架：Board / Column / Task 与按列排序域](../stories/domain/US-526-board-column-task-skeleton.md) (Low)
- [US-527 跨列移动与批量改序的领域语义](../stories/domain/US-527-cross-column-move-ordering.md) (Low)
- [US-528 任务详情与编辑：标签、截止日与撤销重做](../stories/domain/US-528-task-detail-editing.md) (Low)
- [US-529 重开恢复与备份导出](../stories/domain/US-529-board-backup-restore.md) (Low)
- [US-530 看板任务搜索：FTS 接线](../stories/domain/US-530-board-task-search.md) (Low)
- [US-531 三框架看板视图与交互](../stories/domain/US-531-board-tri-framework-ui.md) (Low)
- [US-532 看板端到端 demo：一份数据集走完全域](../stories/domain/US-532-board-end-to-end-demo.md) (Low)
- [US-533 团队版看板：Supabase 同步与身份](../stories/domain/US-533-board-team-sync.md) (Low)

## 价值待证（整个 Epic）

**解锁记录（2026-10-19，owner 决定）**：本 Epic 的 7 条故事（US-526～US-532）原按
[CONVENTIONS 的病灶数 ≥ 抽象数](../CONVENTIONS.md#价值待证) 判据没有独立病灶——8 条故事新增约
6 项抽象（`board` / `column` / `task` 实体、board 级标签、跨列移动与批量改序语义、备份导出流程、
团队身份），而本仓当前**零个已知看板缺陷**。owner 于 2026-10-19 决定孵化，**驱动者 = 需要一个
完整功能的任务看板演示应用**（`apps/dev-rxdb-board` 独立 app 展示全域能力，US-532 阶段 A～B），
演示价值入场，先例 [epic-009 解锁记录](epic-009-bom-domain-model.md#价值待证整个-epic)。
本记录按 **owner 决定豁免**：演示应用是面向展示的交付物，不再是首轮切片专用的验收手段。
豁免依据与边界写在这里（与 epic-009 / US-030 的解锁记录同型），免得后来者把它读成已有缺陷驱动。

抽象数没随故事数涨到 8，是因为 US-532 不引入新抽象——它不新增领域能力，全部行为都归属到其余
7 条；US-530 是纯接线（FTS 能力已由 US-702 / US-703 交付），也不引入新抽象。

**不随本记录解锁的部分**：[US-533](../stories/domain/US-533-board-team-sync.md)（团队版）保持
**价值待证**——它的入场条件是「出现具名团队『离线拖拽任务、回网后互相覆盖』的具体症状」
（[domain-research 入场条件](../domain-research/task-board.md#入场条件什么信号才值得立项)），
与 BOM 的 US-513 阶段 B 同型。US-527 定义的离线并发合并规则是其设计输入，但实现不随首轮开工。

`priority` 保持 `Low`，排期以 roadmap 批次与[首轮可开工切片](#首轮可开工切片)为准；`startDate`
定为本记录日期，`targetDate` 仍 `TBD`（不估完整 8 条故事的交期，见第 0 步「明确不承诺」）。

## 首轮可开工切片

驱动场景一旦出现，按下表顺序推进。每一步只关闭表中列出的 AC 子集，**不因部分阶段验收而把整条
故事置 Done**；顺序本身也不是解锁授权——第 0 步不成立，后面都不开工。

| 顺序 | 交付                                                                                              | 可以验收 / 关闭什么                                                                                                                              | 明确不承诺                                              |
| ---- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 0    | 演示范围（US-532 阶段 A～B 覆盖的 story）与[默认决策](#默认决策第-0-步复核) 1～6 对种子样本的复核 | 决策与样本无冲突，冲突先改对应故事；演示范围确认                                                                                                 | 不估完整 8 条故事的交期；demo 不当业务需求证据          |
| 1    | US-526 + US-527                                                                                   | 三个实体与按列排序域；结构归属（column 属 board、task 属 column）与删除级联；跨列移动三种落点、批量改序事务回滚、拖回原列改序（US-527 AC#1～#7） | 不预埋多租户列（团队版加列不加协议）；不建评论 / 附件表 |
| 2    | US-528 + US-529                                                                                   | 详情编辑与 board 级标签；撤销重做接线；备份导出、清数据后恢复、同 adapter 边界（US-529 AC#1～#6）                                                | 不做评论 / @ 提醒；不做云备份                           |
| 3    | US-531 + US-532 阶段 A                                                                            | 三端对称的看板视图与交互（落点判定表三端同一张）；demo 首轮闭环：建板 → 建列 → 建任务 → 跨列拖动 → 重开 → 备份导出 → 恢复                        | 搜索随阶段 B；三框架绑定（US-531）与演示独立排期        |
| 后续 | US-530 + US-532 阶段 B                                                                            | 任务搜索接线与 demo 搜索页；US-533 等入场条件（价值待证，见[解锁记录](#价值待证整个-epic)）                                                      | US-533 的实现不随首轮开工                               |

第 1～3 步合起来就是最小可演示闭环：建板 → 建列 → 建任务 → 跨列拖动 → 重开恢复 → 备份导出 →
新环境恢复。这个闭环的**验收手段**是 US-532 阶段 A：各故事的 AC 都是单点断言，而组合缺陷
（拖动落点与排序键、删除级联与重开、备份与既有库重开）只在一份贯穿的数据集上显形。
它不是解锁依据——demo 需要模型先存在，拿它当启动理由是循环论证，见该故事的「价值待证」。

## 默认决策（第 0 步复核）

以下产品决策按**最小方案**写出，作为开工基线；它们仍不是驱动样本验证过的结论——第 0 步的真实
样本若与其中任一条冲突，推翻它要先改对应故事再开工：

1. **单人零后端**：首轮交付单人单机版（静态托管可跑），无账号、无同步；数据模型不预埋多租户列，
   团队版（US-533）加列不加协议（[US-526](../stories/domain/US-526-board-column-task-skeleton.md)）。
2. **任务直接挂列**：task 无独立 board_id，board 由 column 推导（单一真相源）；`column.board_id`
   创建后不可改；跨列移动 = 改 `task.column_id`，走 US-028 跨组移动（一个事务内只写分组字段与
   `sortOrder`）（[US-526](../stories/domain/US-526-board-column-task-skeleton.md)、
   [US-527](../stories/domain/US-527-cross-column-move-ordering.md)）。
3. **排序域 = 列**：task 排序域按 column 分组，无跨列全局序；列序是 board 内以 board 为分组字段的
   排序域（[US-526](../stories/domain/US-526-board-column-task-skeleton.md)）。
4. **备份一等公民**：导出 / 恢复进首轮切片；只承诺同 adapter 恢复（US-217 边界），归档文件可下载带走
   （[US-529](../stories/domain/US-529-board-backup-restore.md)）。
5. **无评论 / @ 提醒**：轻实时协作需求走引擎外通道，超出「完整可交付」的边界（domain-research 结论），
   模型不预留评论表（[US-528](../stories/domain/US-528-task-detail-editing.md)）。
6. **冲突语义先行定义**：离线双端移动同一任务的合并规则在 US-527 定义、随 US-533 实现；
   单人版无同步配置，不提前接线（[US-527](../stories/domain/US-527-cross-column-move-ordering.md)、
   [US-533](../stories/domain/US-533-board-team-sync.md)）。

## 非目标

- **评论 / @ 提醒 / 附件 / 工作流自动化**——引擎外通道，超出「完整可交付」边界；
- **多租户 RBAC**——US-029 仍价值待证，单团队场景用 US-027 已足够（domain-research 结论）；
- **移动端原生 / 小程序宿主**——后续按 adapter 放行表核对，不随本 Epic 承诺；
- **实时协同（Google Docs 级）**——首发后置（rejected-domains 维持原判）；
- **性能基准**——种子数据集按「覆盖全部硬用例」设计，不按「压出规模」设计（US-532）。
