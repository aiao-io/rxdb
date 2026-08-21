---
id: RV-010
title: epic-006 本地工作树与提交历史史诗深度评审
status: Open
created: 2026-08-21
updated: 2026-08-21
pr:
---

# Review：epic-006 深度评审

**判定：核心价值没有根本偏离，但需实质修订后再排期。** 三处高严重度问题——后端矩阵证据已过期且违反 epic 自己定的判据原则、发布门禁 9（公开文档）与 a11y 横切约束在故事中无人认领——发布前必然卡门禁或临时找补。另有一处产品语义风险（远端同步进工作树导致「工作树永远脏」）需要产品层裁决。事实层面质量高于仓库平均水平：受信路径登记表经全量代码扫描零漂移，状态归属表与四个故事逐条闭合，git 与 api-baseline 事实声明全部属实。

## 范围与评审方式

| 项         | 值                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| 评审对象   | [epic-006](../epics/epic-006-working-tree-commits.md)                                                     |
| 关联核对   | US-305 / US-306 / US-307 / US-308、[status-overview](../status-overview.md)、api-baseline（28 个 json） |
| 代码核对   | `packages/rxdb/src/version/`、`rxdb-adapter.ts`、`rxdb-plugin-workspace`、`benchmarks/`                    |
| git 事实   | `v0.0.24` / `v0.0.25` 标签与 ancestry                                                                    |
| 评审方式   | 两路并行核对（故事引用一致性 / 代码与仓库事实）+ 独立核查（git 历史、zh-glossary、epic 模板合规、产品语义） |

## 核心价值判定

**没有偏离到「变成纯内部一致性 epic」的程度，但重心偏向内部机制。**

支持「没有偏离」：愿景（[epic:13](../epics/epic-006-working-tree-commits.md#L13)）锚定用户可见结果（刷新/重启/崩溃后工作树、缓存区、HEAD、恢复结果仍在且语义一致）；性能预算节（[epic:301](../epics/epic-006-working-tree-commits.md#L301)）把 100ms/1s 绑定到用户可见响应，并把原 FR-026 不可验收的绝对墙钟口径改为归一化 ratio + `runnerProfileHash`，是真实改进；横切约束坚持三框架对称与 a11y，与仓库铁律一致。

支持「重心偏移」：epic-006 是八个 epic 中**唯一没有「目标」节**的（模板要求，见 P3-1）；约六成篇幅是内部机制（状态模型、revision 校验矩阵、写入口矩阵、受信路径登记、conformance 套件）。机制密度有出处——US-305「要么全做要么全不做」的拆分教训与 FR-032 的多 realm 约束——但缺目标节让它读起来像实现契约而不是产品承诺。产品语义上最值得警惕的漂移见 P2-5。

## Findings

### P1-1：后端矩阵证据已过期，且 epic 违反自己定的判据原则

- **问题**：[epic:240-249](../epics/epic-006-working-tree-commits.md#L240) 的三条支持性事实今天全部不成立：
  - 「US-207 同样尚未 Done（只剩 AC#8 三平台打包矩阵）」——US-207 YAML 已是 `Done`，AC#8（三平台 electron-smoke）已 ✅；
  - 「AC#1 的跨进程重启 e2e 也尚未覆盖」——US-210 的 AC#1 与 AC#9 于 2026-08-17 关闭（`tauri build` 真二进制跨进程 e2e + 三平台 tauri-smoke），而 epic 最后编辑是 2026-08-18 13:22——**最后一次编辑时就已经过期**；
  - 「786 用例全绿且无 flake」——786 是 [US-207](../stories/adapter/US-207-desktop-local-database.md) 里的历史快照（现值 931 passed / 18 files），「无 flake」在 requirements/ 全目录零支撑。
- **根因**：epic 行 240 自己写道「入矩阵的判据是宿主能力，**不是它所属 story 的 status**」，紧接着的论证却全部用 story 的 status/AC 进度做证据——这正是它过期的方式。跨 story 状态引用是最易过期的内容（CONVENTIONS 规定状态真相源是 story YAML，epic 只该引用宿主能力证据，不该把 story 进度写进论证）。
- **修复**：重写「启用与存储边界」的 US-207/US-210 段，只引宿主能力证据（共享套件结果、flake 复现条件），不引 story status；补上 US-210 已记录的关键 nuance——flake 仅存在于 stdio 测试宿主，真 IPC 打包 e2e（AC#9）已绿——并据此重新裁决 Tauri 判据。Tauri 排除的**结论**按 epic 自己的判据目前仍成立（US-210 确认 CPU 争抢下共享套件随机挂 1–4 条，batchTimeout 调 0 更糟），但论证必须重写；epic 行 249 自己承诺的「届时更新本节」未兑现，属于待办逾期。

### P1-2：发布门禁 9（公开文档）无人认领

- **问题**：[epic:342](../epics/epic-006-working-tree-commits.md#L342) 要求公开文档说明数据库级显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、加密边界与不改写历史的承诺。四个故事的 In Scope / 实现文件清单中**没有任何文档交付项**（US-305:232-235、US-306:409-422、US-307:138-143、US-308:165-170）。
- **根因**：文档门禁只有 epic 级承诺，没有 story 级承接点。
- **修复**：二选一——把文档交付项落到某个故事（建议 US-306 阶段 C，随 `useWorkingTree()` 公开契约一并交付），或从门禁 9 删掉并改挂 epic-007 的文档门禁机制。

### P1-3：a11y 对 US-307 / US-308 的要求无人认领

- **问题**：[epic:264](../epics/epic-006-working-tree-commits.md#L264) 与 [门禁 2（epic:333）](../epics/epic-006-working-tree-commits.md#L333) 都点名 US-306 阶段 C / US-307 / US-308 达到 WCAG 2.1 AA。US-306 认领了自己的（US5-AC4），**US-307 与 US-308 全文无 WCAG / 键盘 / 焦点 / 屏幕阅读器条款**。
- **根因**：横切约束在 epic 声明后没有落到故事；与 P1-2 同类（epic 级承诺无故事级承接）。
- **修复**：US-307 / US-308 各补一条 a11y AC（或明确声明这两个故事无新增 UI、只复用阶段 C 的既有组件从而 a11y 由阶段 C 收口——但现状连这条声明都没有）。

### P2-1：全链路 fixture 归属错位

- **问题**：[epic:213-216](../epics/epic-006-working-tree-commits.md#L213) 声明「pull → refresh → switch away/back → status/diff」链路「不能整条压在任何单一故事上」、由 US-308 收口集成 fixture。实际：US-306 的 US2-AC17 的 Then 已含完整链路断言（「刷新及切出/切回后 status、diff 与业务值保持一致」，US-306:174），且被交付阶段表（US-306:70）**整条**划给阶段 A（未标「半边」）；收口方 US-308 的测试要求（US-308:152-161）**没有**这个组合 fixture。
- **根因**：epic 修订链路拆分时只改了 epic 侧表述，没有同步 US-306 的阶段表和 US-308 的测试要求。
- **修复**：二选一——把 US-306 US2-AC17 拆「半边」（阶段 A 只断言重放，切出/切回半边移交 US-308 并补 fixture），或改 epic 承认链路由阶段 A 收口（注意：阶段 A 排在 US-308 之前，若收口在阶段 A 则该链路不经过真正的 switch 入口，与 epic「完整链路作为 US-308 集成 fixture 收口」的意图冲突，因此更推荐前者）。

### P2-2：「benchmark 半边」挂在 US-308 头上但无内容

- **问题**：[epic:287](../epics/epic-006-working-tree-commits.md#L287) 与 US-306:77 把「benchmark 追加」算作 US-307 与 US-308 二者的后半边；FR-026b 只存在于 US-307（US-307:105），US-308 全文无 benchmark 的 FR / AC / 实现文件条目。
- **修复**：epic 依赖顺序第 6 条与 US-306 交付阶段表删掉 US-308 的 benchmark 半边，只保留「三框架入口排在阶段 C 之后」。

### P2-3：status-overview 两条依赖注释与 epic / 故事矛盾

- **问题**：status-overview:193 说「US-308 跨 realm 竞争只走 `headRevision` CAS」，与 US-308 FR-020（持久化 activation/head/index/working-tree 四类 revision CAS）及 epic 的 revision 校验矩阵（[epic:125-137](../epics/epic-006-working-tree-commits.md#L125)）直接矛盾；status-overview:192 把 US-307 整体排在 US-306 阶段 C 之后，比 epic 的并行口径（核心持久层可与阶段 C 并行，仅三框架入口排后）更强。
- **根因**：status-overview 是派生视图，CONVENTIONS 规定「冲突时以 YAML 为准并同步修复派生视图」——这两条注释没有跟上 epic 修订。
- **修复**：按 epic:284-287 与 US-308 FR-020 修正两条注释。

### P2-4：epic 违反自己定的术语规则（「工作区」三处自违）

- **问题**：[epic:32](../epics/epic-006-working-tree-commits.md#L32) 规定「『工作区』一词只指草稿缓存」，但 epic 自身 [epic:200](../epics/epic-006-working-tree-commits.md#L200)「本地工作区常驻」、US-306:374「常驻本地工作区」指文件系统工作目录，US-308:59「切换分支前默认要求工作区 clean」指 Git working tree 语义——最后一个恰是 epic 行 21 要消除的「同一前缀、两个毫不相干的概念」在中文词上的再现。
- **修复**：三处改为「本地工作副本常驻」「切换分支前默认要求工作树 clean」；或在术语节补充「文件系统工作目录」的固定译法并全仓对线。

### P2-5（产品裁决点）：remote_sync 进工作树导致「工作树永远脏」

- **问题**：[epic:156](../epics/epic-006-working-tree-commits.md#L156) 规定 pull/autoSync 把远端变化写成 `origin=remote_sync` 的未暂存单元（US-306 FR-046 承接）。后果：**任何一次后台同步都会让 status() 显示未提交变化；用户 commit 时把自己的编辑与远端同步结果打包成一个本地 commit**。Git 心智模型里 fetch 不会弄脏工作区，而这里会。epic 行 212-216 承认「远端数据进入工作树不等于 remote commit push/pull」，但从未回答：status 是否按 origin 过滤？是否有 auto-baseline？「工作树永远脏」是不是可接受的用户可见行为？
- **根因**：这是「本地可审计未提交结果」模型的自然后果，可能是有意设计，但 epic 没有把这个取舍及其 UX 后果显式写出来。
- **修复**：不需要改机制，但 epic 需要在愿景或启用节补一段明示：工作树 = HEAD 之后的一切净变化（含远端来源），status 展示全部 origin；若产品不接受「同步即变脏」，再另起 auto-baseline 讨论。此条是产品决策，不阻塞 P1/P2 的修复。

### P3-1：缺「目标」节

- **问题**：[epic.template.md](epic.template.md) 要求 愿景/为什么单列/目标/故事/非目标；epic-001/004/005/007/008 都有目标清单，epic-006 是唯一没有的——没有一句话说清「用户最终能做什么」，直接从术语表跳进 revision 矩阵。
- **修复**：按模板补「目标」节，每条目标标注归属故事（含「尚无故事认领」标记，如 P1-2 的文档、P1-3 的 a11y）。

### P3-2：历史数字不可核对

- **问题**：[epic:17](../epics/epic-006-working-tree-commits.md#L17) 的「4 个用户故事、28 条 FR、7 个关键实体」是拆分前历史快照——当前 US-305 是 2 个用户故事（US-305:91/110）、21 条 FR（US-305:137-165）、5 个关键实体（US-305:169-173）；「横跨 rxdb-plugin-workspace、三个框架包和三个 demo」在现文件实现清单中无对应。
- **修复**：标注「拆分前（git 历史可核）」，或引用具体 commit。

### P3-3：FR-024 / FR-025 / FR-028 编号悬空

- **问题**：[epic:260](../epics/epic-006-working-tree-commits.md#L260) 说原 US-305 把这三个 FR 各写成一条，现转为横切约束后编号本身在全仓库无任何故事承接（FR-023 已迁入 US-306:226，这三个没有）。
- **修复**：删编号只留语义，或标注「已废弃编号」。

### P3-4：QueryCache「过期清理」与代码不符

- **问题**：[epic:161](../epics/epic-006-working-tree-commits.md#L161) 说 QueryCache 有「upsert/delete/过期清理」路径。代码里 `QueryCacheRepository.ts:152` 明言「计算出 orphan 却不删除」，orphan 只进统计；该类 `@experimental` 且无生产实例化路径。
- **修复**：写入口矩阵按实际存在的路径改写（upsert/delete + orphan 只计数），排除规则的结论不变。

### P3-5：SAMPLES=50 易误读为沿用现状

- **问题**：[epic:311](../epics/epic-006-working-tree-commits.md#L311)「固定 WARMUP=5、SAMPLES=50」——现有 bench（non-encrypted-hot-path.bench.ts:66）是 SAMPLES=100；50 是本 epic 新固定值，表述易被读成沿用现状。
- **修复**：注明「SAMPLES=50 为本 Epic 新固定值（现有 bench 为 100）」。

### P3-6：与 epic-007 的边界未声明

- **问题**：门禁 8 的 api-baseline 命名检查、横切约束 4 的不复活旧导出，与 epic-007 的「API 表面门禁覆盖面」领域相邻；epic-008 已单方面声明了与 006 的边界（[epic-008 边界表](../epics/epic-008-lifecycle-scope.md#与既有-epic-的边界)），epic-006 没有对等声明。
- **修复**：按 epic-008 的格式补一节「与既有 Epic 的边界」，写明：门禁 8 约束的是本 Epic 新导出的命名形态（新功能约束），不扩大 epic-007 的门禁覆盖面范围。

### P3-7：US-305 缺 TSDoc / 类型契约测试条款

- **问题**：[epic:262](../epics/epic-006-working-tree-commits.md#L262) 说 US-305 与 US-306 阶段 A/B 是无 UI 底座，只要求核心公开类型、TSDoc 和类型契约测试；US-305 的测试要求（US-305:217-228）无 TSDoc 或类型契约条款（只有 US-306:357 有）。
- **修复**：US-305 测试要求补 TSDoc lint 与类型契约覆盖，或 epic 缩小表述。

### P3-8：术语「缓存区」建议改为「暂存区」

- **问题**：[epic:24](../epics/epic-006-working-tree-commits.md#L24) 把 index/staging 译为「缓存区」。Git 生态标准译名是「暂存区」；「缓存区」与仓库内已有的草稿缓存、QueryCache、zh-glossary 保留词「缓冲区」（devtools）语义撞车。epic 内自洽（四个故事一致），但落地代码时 TSDoc 需要登记 zh-glossary，届时撞车会显形。
- **修复**：术语表改为「暂存区」并全仓对线（改动集中在 requirements 文档，尚未有代码落地，现在改成本最低）；或至少在 zh-glossary 登记「缓存区 = index/staging，与草稿缓存/缓冲区无关」并给出区分规则。

## 已核实属实的声明（防误修）

以下内容核对通过，修订时**不要**当作问题改掉：

- 受信路径登记表（epic:178-187）9 个登记点与代码逐行一致；全仓扫描无未登记调用点（唯一例外 push-repository.ts:534 是 epic 明示排除的远端重载）——漂移护栏本身成立。
- 状态归属表（epic:63-71）与四故事逐条闭合，含「建表归前置故事」的两处裁决及其理由。
- revision 校验矩阵（epic:111-145）的两类区分与 FR-032（US-306:229）、US2-AC8（US-306:165）有据可依；restore 的「不移动 HEAD」「初次 restore 要求 index 为空」与 US-307 FR-013/FR-034 一致。
- 命名冲突处置属实：`WorkspaceCacheEntry` 等四个导出在 api-baseline/rxdb-plugin-workspace.json 逐一存在；`SwitchBranchOptions` 在 rxdb.json:1416；新前缀 `Commit*`/`Index*`/`WorkingTree*` 在 28 个 baseline 文件中零撞名。
- git 事实属实：v0.0.25 不在 HEAD ancestry（`git merge-base --is-ancestor v0.0.25 HEAD` 退出码 1）；v0.0.24 公开表面无 `stagedChange`/`unstageChange`/`commit`/`stagedCount`/`WorkspaceCacheEntry.staged`。
- migration-release.json 现状描述属实（bridge.tag/version 为 null，release.version 为 0.0.25，release.kind 已是 bridge）。
- Workspace 草稿缓存确在 IndexedDB（workspace-store.ts），「草稿 save() 落主表后才进工作树」的边界前提成立。
- roadmap 的依赖顺序（约束 5/6）与 epic:269-287 一致。
- 两套 conformance 套件的具名与归属在三处（US-305:218-220、US-306:361-363/384-386）闭合。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
