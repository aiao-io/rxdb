---
id: RV-010
title: epic-006 本地工作树与提交历史史诗深度评审
status: Open
created: 2026-08-21
updated: 2026-08-21
pr:
---

# Review：epic-006 深度评审

**判定：核心价值没有根本偏离；本轮已按核实结果完成修订。** 三处高严重度问题——后端矩阵证据已过期且违反 epic 自己定的判据原则、发布门禁 9（公开文档）与 a11y 横切约束在故事中无人认领——发布前必然卡门禁或临时找补，均已修掉。产品语义风险（远端同步进工作树导致「工作树永远脏」）已由产品裁决为**接受并明示**，写入 epic。事实层面质量高于仓库平均水平：受信路径登记表经全量代码扫描零漂移，状态归属表与四个故事逐条闭合，git 与 api-baseline 事实声明全部属实。

## 复核修正（2026-08-21，落地前逐条核对代码与仓库）

本评审首版有两处事实错误、一处修复建议有误、一处严重度虚高，已在下文对应条目中就地更正：

| 条目 | 首版说法                                               | 复核结果                                                                                                             |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| P3-5 | 「`SAMPLES=50` 是本 Epic 新固定值，现有 bench 为 100」 | **错误，已撤回**：[encryption.bench.ts:69](../../benchmarks/encryption.bench.ts) 现值就是 50，epic 与既有 bench 一致 |
| P3-1 | 「epic-006 是八个 epic 中唯一没有目标节的」            | **错误**：epic-008 同样没有。结论（模板要求该节、epic-006 缺）仍成立，论据已换                                       |
| P2-4 | 建议把 US-308:59 的「工作区」改成「工作树」            | **修复有误**：该处是**引用**原 FR-017 原文，改字等于篡改引文。已改为在术语表固定「本地工作副本」译法并保留引文       |
| P2-2 | 定级 P2                                                | **降为 P3**：epic 与 US-306 用的是合并句式「二者的三框架入口与 benchmark 半边」，属措辞松散而非归属错误              |

## 范围与评审方式

| 项       | 值                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| 评审对象 | [epic-006](../epics/epic-006-working-tree-commits.md)                                                       |
| 关联核对 | US-305 / US-306 / US-307 / US-308、[status-overview](../status-overview.md)、api-baseline（28 个 json）     |
| 代码核对 | `packages/rxdb/src/version/`、`rxdb-adapter.ts`、`rxdb-plugin-workspace`、`benchmarks/`                     |
| git 事实 | `v0.0.24` / `v0.0.25` 标签与 ancestry                                                                       |
| 评审方式 | 两路并行核对（故事引用一致性 / 代码与仓库事实）+ 独立核查（git 历史、zh-glossary、epic 模板合规、产品语义） |

## 核心价值判定

**没有偏离到「变成纯内部一致性 epic」的程度，但重心偏向内部机制。**

支持「没有偏离」：愿景（[epic:13](../epics/epic-006-working-tree-commits.md#L13)）锚定用户可见结果（刷新/重启/崩溃后工作树、暂存区、HEAD、恢复结果仍在且语义一致）；性能预算节（[epic:301](../epics/epic-006-working-tree-commits.md#L301)）把 100ms/1s 绑定到用户可见响应，并把原 FR-026 不可验收的绝对墙钟口径改为归一化 ratio + `runnerProfileHash`，是真实改进；横切约束坚持三框架对称与 a11y，与仓库铁律一致。

支持「重心偏移」：epic-006 原本**没有「目标」节**（模板要求，见 P3-1，已补）；约六成篇幅是内部机制（状态模型、revision 校验矩阵、写入口矩阵、受信路径登记、conformance 套件）。机制密度有出处——US-305「要么全做要么全不做」的拆分教训与 FR-032 的多 realm 约束——但缺目标节让它读起来像实现契约而不是产品承诺。产品语义上最值得警惕的漂移见 P2-5。

## Findings

> 下文各条的 `epic:NNN` / `US-3xx:NNN` 行号是**评审当时**的快照坐标，用于复核首版判断；修订落地后行号已整体位移，定位请走各条的标题与锚点链接，不要按行号跳转。

### P1-1：后端矩阵证据已过期，且 epic 违反自己定的判据原则 ✅ 已修复

- **问题**：[epic:240-249](../epics/epic-006-working-tree-commits.md#L240) 的三条支持性事实今天全部不成立：
  - 「US-207 同样尚未 Done（只剩 AC#8 三平台打包矩阵）」——US-207 YAML 已是 `Done`，AC#8（三平台 electron-smoke）已 ✅；
  - 「AC#1 的跨进程重启 e2e 也尚未覆盖」——US-210 的 AC#1 与 AC#9 于 2026-08-17 关闭（`tauri build` 真二进制跨进程 e2e + 三平台 tauri-smoke），而 epic 最后编辑是 2026-08-18 13:22——**最后一次编辑时就已经过期**；
  - 「786 用例全绿且无 flake」——786 是 [US-207](../stories/adapter/US-207-desktop-local-database.md) 里的历史快照（现值 931 passed / 18 files），「无 flake」在 requirements/ 全目录零支撑。
- **根因**：epic 行 240 自己写道「入矩阵的判据是宿主能力，**不是它所属 story 的 status**」，紧接着的论证却全部用 story 的 status/AC 进度做证据——这正是它过期的方式。跨 story 状态引用是最易过期的内容（CONVENTIONS 规定状态真相源是 story YAML，epic 只该引用宿主能力证据，不该把 story 进度写进论证）。
- **修复**：重写「启用与存储边界」的 US-207/US-210 段，只引宿主能力证据（共享套件结果、flake 复现条件），不引 story status；补上 US-210 已记录的关键 nuance——flake 仅存在于 stdio 测试宿主，真 IPC 打包 e2e（AC#9）已绿——并据此重新裁决 Tauri 判据。Tauri 排除的**结论**按 epic 自己的判据目前仍成立（US-210 确认 CPU 争抢下共享套件随机挂 1–4 条，batchTimeout 调 0 更糟），但论证必须重写；epic 行 249 自己承诺的「届时更新本节」未兑现，属于待办逾期。
- **落地**：「启用与存储边界」已重写——显式声明本节只引宿主能力证据、不引任何 story 的 status 或 AC 进度；Electron 计入 v1 的依据换成共享套件全绿（快照数字指向 US-207 证据栏，不在 epic 内复制）；Tauri 段补齐「flake 仅存在于 stdio 测试宿主、真 IPC 打包 e2e 已绿、但判据要求无已知非确定性失败」的完整 nuance，旧段落删除。

### P1-2：发布门禁 9（公开文档）无人认领 ✅ 已修复

- **问题**：[epic:342](../epics/epic-006-working-tree-commits.md#L342) 要求公开文档说明数据库级显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、加密边界与不改写历史的承诺。四个故事的 In Scope / 实现文件清单中**没有任何文档交付项**（US-305:232-235、US-306:409-422、US-307:138-143、US-308:165-170）。
- **根因**：文档门禁只有 epic 级承诺，没有 story 级承接点。
- **修复**：二选一——把文档交付项落到某个故事（建议 US-306 阶段 C，随 `useWorkingTree()` 公开契约一并交付），或从门禁 9 删掉并改挂 epic-007 的文档门禁机制。
- **落地**：取前者。US-306 新增 US5-AC8 覆盖门禁 9 的六项内容（含 `origin=remote_sync` 的披露），实现文件清单新增 `website/docs/collaboration/`，阶段 C 测试要求补「文档示例随构建校验」；epic 门禁 9 改写为明确归属 US-306 阶段 C。

### P1-3：a11y 对 US-307 / US-308 的要求无人认领 ✅ 已修复

- **问题**：[epic:264](../epics/epic-006-working-tree-commits.md#L264) 与 [门禁 2（epic:333）](../epics/epic-006-working-tree-commits.md#L333) 都点名 US-306 阶段 C / US-307 / US-308 达到 WCAG 2.1 AA。US-306 认领了自己的（US5-AC4），**US-307 与 US-308 全文无 WCAG / 键盘 / 焦点 / 屏幕阅读器条款**。
- **根因**：横切约束在 epic 声明后没有落到故事；与 P1-2 同类（epic 级承诺无故事级承接）。
- **修复**：US-307 / US-308 各补一条 a11y AC（或明确声明这两个故事无新增 UI、只复用阶段 C 的既有组件从而 a11y 由阶段 C 收口——但现状连这条声明都没有）。
- **落地**：US-307 新增 US1-AC8（恢复入口的 WCAG 2.1 AA + 三框架对称，复用阶段 C 组件）、US-308 新增 US2-AC7（分支切换与冲突提示的 a11y），两侧各补对应测试要求。

### P2-1：全链路 fixture 归属错位 ✅ 已修复

- **问题**：[epic:213-216](../epics/epic-006-working-tree-commits.md#L213) 声明「pull → refresh → switch away/back → status/diff」链路「不能整条压在任何单一故事上」、由 US-308 收口集成 fixture。实际：US-306 的 US2-AC17 的 Then 已含完整链路断言（「刷新及切出/切回后 status、diff 与业务值保持一致」，US-306:174），且被交付阶段表（US-306:70）**整条**划给阶段 A（未标「半边」）；收口方 US-308 的测试要求（US-308:152-161）**没有**这个组合 fixture。
- **根因**：epic 修订链路拆分时只改了 epic 侧表述，没有同步 US-306 的阶段表和 US-308 的测试要求。
- **修复**：二选一——把 US-306 US2-AC17 拆「半边」（阶段 A 只断言重放，切出/切回半边移交 US-308 并补 fixture），或改 epic 承认链路由阶段 A 收口（注意：阶段 A 排在 US-308 之前，若收口在阶段 A 则该链路不经过真正的 switch 入口，与 epic「完整链路作为 US-308 集成 fixture 收口」的意图冲突，因此更推荐前者）。
- **落地**：取前者。US-306 US2-AC17 明确只承接「刷新重放半边」，切出/切回半边移交 US-308 新增的 US1-AC12（全链路集成 fixture 的收口点），半边归属表与交付阶段表同步标注。

### ~~P2-2~~ → P3：「benchmark 半边」挂在 US-308 头上但无内容 ✅ 已修复（严重度已下调）

- **问题**：[epic:287](../epics/epic-006-working-tree-commits.md#L287) 与 US-306:77 把「benchmark 追加」算作 US-307 与 US-308 二者的后半边；FR-026b 只存在于 US-307（US-307:105），US-308 全文无 benchmark 的 FR / AC / 实现文件条目。
- **复核更正**：两处原文都是合并句式（「二者的三框架入口与 benchmark 半边」），读者不会由此推出 US-308 有 benchmark 交付项——属措辞松散而非归属错误，不构成 P2。
- **修复**：epic 依赖顺序第 6 条与 US-306 交付阶段表删掉 US-308 的 benchmark 半边，只保留「三框架入口排在阶段 C 之后」。
- **落地**：两处均已改为「benchmark 追加只涉及 US-307；US-308 无 benchmark 交付项」。

### P2-3：status-overview 两条依赖注释与 epic / 故事矛盾 ✅ 已修复

- **问题**：status-overview:193 说「US-308 跨 realm 竞争只走 `headRevision` CAS」，与 US-308 FR-020（持久化 activation/head/index/working-tree 四类 revision CAS）及 epic 的 revision 校验矩阵（[epic:125-137](../epics/epic-006-working-tree-commits.md#L125)）直接矛盾；status-overview:192 把 US-307 整体排在 US-306 阶段 C 之后，比 epic 的并行口径（核心持久层可与阶段 C 并行，仅三框架入口排后）更强。
- **根因**：status-overview 是派生视图，CONVENTIONS 规定「冲突时以 YAML 为准并同步修复派生视图」——这两条注释没有跟上 epic 修订。
- **修复**：按 epic:284-287 与 US-308 FR-020 修正两条注释。
- **落地**：两条注释已改写为「依赖 US-306 阶段 B；核心持久层可与阶段 C 并行，三端入口排在阶段 C 之后」，并写明跨 realm 竞争走 activation / head / index / working-tree 四类 revision CAS。

### P2-4：epic 违反自己定的术语规则（「工作区」自违） ✅ 已修复（第三处修法已更正）

- **问题**：[epic:32](../epics/epic-006-working-tree-commits.md#L32) 规定「『工作区』一词只指草稿缓存」，但 epic 自身 [epic:200](../epics/epic-006-working-tree-commits.md#L200)「本地工作区常驻」、US-306:374「常驻本地工作区」指文件系统工作目录，US-308:59「切换分支前默认要求工作区 clean」指 Git working tree 语义——最后一个恰是 epic 行 21 要消除的「同一前缀、两个毫不相干的概念」在中文词上的再现。
- **复核更正**：US-308:59 是**引用原 FR-017 的原文**，按首版建议直接改字等于篡改引文，制造「引文与被引对象不一致」的新问题。前两处属 epic/story 自述文字，可直接改。
- **修复**：前两处改为「在本地工作副本中常驻」；术语节补充固定译法「需要指代文件系统上的本地工作目录时固定写『本地工作副本』」，并追加规则「引用历史原文时保留原字并加译注，不改引文」，US-308:59 按此保留。

### P2-5（产品裁决点）：remote_sync 进工作树导致「工作树永远脏」 ✅ 已裁决

- **问题**：[epic:156](../epics/epic-006-working-tree-commits.md#L156) 规定 pull/autoSync 把远端变化写成 `origin=remote_sync` 的未暂存单元（US-306 FR-046 承接）。后果：**任何一次后台同步都会让 status() 显示未提交变化；用户 commit 时把自己的编辑与远端同步结果打包成一个本地 commit**。Git 心智模型里 fetch 不会弄脏工作区，而这里会。epic 行 212-216 承认「远端数据进入工作树不等于 remote commit push/pull」，但从未回答：status 是否按 origin 过滤？是否有 auto-baseline？「工作树永远脏」是不是可接受的用户可见行为？
- **根因**：这是「本地可审计未提交结果」模型的自然后果，可能是有意设计，但 epic 没有把这个取舍及其 UX 后果显式写出来。
- **修复**：不需要改机制，但 epic 需要在愿景或启用节补一段明示：工作树 = HEAD 之后的一切净变化（含远端来源），status 展示全部 origin；若产品不接受「同步即变脏」，再另起 auto-baseline 讨论。此条是产品决策，不阻塞 P1/P2 的修复。
- **裁决（产品）**：**接受「同步即变脏」，由 epic 明示这个取舍**，不改机制、不引入 auto-baseline。epic 新增「工作树包含远端来源的净变化（已裁决）」小节：工作树 = HEAD 之后的一切净变化，远端来源无豁免（门禁 10 的理据）；`status()` / `diff()` 展示全部 origin 不过滤；v1 无 auto-baseline。该取舍同时进入 US-306 US5-AC8 的公开文档披露项。

### P3-1：缺「目标」节 ✅ 已修复（论据已更正）

- **问题**：[epic.template.md](../epics/epic.template.md) 要求 愿景/为什么单列/目标/故事/非目标；epic-006 没有目标清单——没有一句话说清「用户最终能做什么」，直接从术语表跳进 revision 矩阵。
- **复核更正**：首版称「epic-006 是八个 epic 中唯一没有目标节的」，**不成立**——epic-008 同样没有。缺节这一事实与模板要求本身不受影响，但「唯一」的论据作废（若要按此立规，epic-008 应一并补，不在本次范围）。首版给的模板链接 `epic.template.md` 是从 `requirements/reviews/` 出发的死链，正确路径为 `../epics/epic.template.md`。
- **修复**：按模板补「目标」节，每条目标标注归属故事（含「尚无故事认领」标记，如 P1-2 的文档、P1-3 的 a11y）。
- **落地**：epic 新增「目标」节共 8 条，每条括注归属故事与对应发布门禁；原「尚无故事认领」的两项（文档、a11y）随 P1-2 / P1-3 一并落到故事，无遗留无主项。

### P3-2：历史数字不可核对 ✅ 已修复

- **问题**：[epic:17](../epics/epic-006-working-tree-commits.md#L17) 的「4 个用户故事、28 条 FR、7 个关键实体」是拆分前历史快照——当前 US-305 是 2 个用户故事（US-305:91/110）、21 条 FR（US-305:137-165）、5 个关键实体（US-305:169-173）；「横跨 rxdb-plugin-workspace、三个框架包和三个 demo」在现文件实现清单中无对应。
- **修复**：标注「拆分前（git 历史可核）」，或引用具体 commit。
- **落地**：epic:17 已加注「**历史快照，以 git 历史为准；当前文件已是拆分后的形态**」。

### P3-3：FR-024 / FR-025 / FR-028 编号悬空 ✅ 已修复

- **问题**：[epic:260](../epics/epic-006-working-tree-commits.md#L260) 说原 US-305 把这三个 FR 各写成一条，现转为横切约束后编号本身在全仓库无任何故事承接（FR-023 已迁入 US-306:226，这三个没有）。
- **修复**：删编号只留语义，或标注「已废弃编号」。
- **落地**：横切约束节开头显式声明 FR-024 / FR-025 / FR-028 三个编号**作废且不得复用**，只保留语义；仍被承接的 FR-023 单独点名。

### P3-4：QueryCache「过期清理」与代码不符 ✅ 已修复

- **问题**：[epic:161](../epics/epic-006-working-tree-commits.md#L161) 说 QueryCache 有「upsert/delete/过期清理」路径。代码里 [QueryCacheRepository.ts](../../packages/rxdb/src/repository/QueryCacheRepository.ts) 明言「计算出 orphan 却不删除」，orphan 只进统计；该类 `@experimental` 且无生产实例化路径。（首版只写文件名未给路径，实际在 `src/repository/` 而非 `src/version/`。）
- **修复**：写入口矩阵按实际存在的路径改写（upsert/delete + orphan 只计数），排除规则的结论不变。
- **落地**：矩阵该行改为「upsert/delete（orphan 当前**只计数不删除**）」，并在表下补一段指向代码位置的说明。

### P3-5：~~SAMPLES=50 易误读为沿用现状~~ ❌ 已撤回（首版事实错误）

首版称「现有 bench 是 SAMPLES=100，50 是本 Epic 新固定值」。核对后：[encryption.bench.ts:69](../../benchmarks/encryption.bench.ts) 现值就是 `SAMPLES = 50`，[non-encrypted-hot-path.bench.ts:66](../../benchmarks/non-encrypted-hot-path.bench.ts) 为 100，两者本就不统一。epic 固定 50 与既有加密 bench 一致，不存在「易误读为沿用现状」的问题，**不需要任何修改**。

### P3-6：与 epic-007 的边界未声明 ✅ 已修复

- **问题**：门禁 8 的 api-baseline 命名检查、横切约束 4 的不复活旧导出，与 epic-007 的「API 表面门禁覆盖面」领域相邻；epic-008 已单方面声明了与 006 的边界（[epic-008 边界表](../epics/epic-008-lifecycle-scope.md#与既有-epic-的边界)），epic-006 没有对等声明。
- **修复**：按 epic-008 的格式补一节「与既有 Epic 的边界」，写明：门禁 8 约束的是本 Epic 新导出的命名形态（新功能约束），不扩大 epic-007 的门禁覆盖面范围。
- **落地**：新增「与既有 Epic 的边界」表，含 epic-007（API 表面门禁）、epic-004（草稿缓存 / `Workspace*` 前缀归属）、epic-008（生命周期与 scope）三行。

### P3-7：US-305 缺 TSDoc / 类型契约测试条款 ✅ 已修复

- **问题**：[epic:262](../epics/epic-006-working-tree-commits.md#L262) 说 US-305 与 US-306 阶段 A/B 是无 UI 底座，只要求核心公开类型、TSDoc 和类型契约测试；US-305 的测试要求（US-305:217-228）无 TSDoc 或类型契约条款（只有 US-306:357 有）。
- **修复**：US-305 测试要求补 TSDoc lint 与类型契约覆盖，或 epic 缩小表述。
- **落地**：US-305 测试要求新增一条——全部新公开类型/入口带 TSDoc 且零 lint 警告，类型契约测试断言签名与 api-baseline 一致、不出现 `Workspace*` 前缀、不复用 `SwitchBranchOptions`。

### P3-8：术语「缓存区」改为「暂存区」 ✅ 已修复

- **问题**：[epic:24](../epics/epic-006-working-tree-commits.md#L24) 把 index/staging 译为「缓存区」。Git 生态标准译名是「暂存区」；「缓存区」与仓库内已有的草稿缓存、QueryCache、zh-glossary 保留词「缓冲区」（devtools）语义撞车。epic 内自洽（四个故事一致），但落地代码时 TSDoc 需要登记 zh-glossary，届时撞车会显形。
- **修复**：术语表改为「暂存区」并全仓对线（改动集中在 requirements 文档，尚未有代码落地，现在改成本最低）；或至少在 zh-glossary 登记「缓存区 = index/staging，与草稿缓存/缓冲区无关」并给出区分规则。
- **裁决（产品）**：取前者。epic-006 与四个故事全部改为「暂存区」，[zh-glossary](../zh-glossary.md) 新增 🔴 必改行登记 `缓存区 → 暂存区`。本评审正文保留「缓存区」字样的位置仅限本条（讨论该词本身）。

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

修订范围（2026-08-21）：

| 文件                                                                   | 覆盖条目                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| [epic-006](../epics/epic-006-working-tree-commits.md)                  | P1-1、P1-2、P2-2、P2-4、P2-5、P3-1～P3-4、P3-6、P3-8 |
| [US-305](../stories/collaboration/US-305-commit-graph-head.md)         | P3-7、P3-8                                           |
| [US-306](../stories/collaboration/US-306-working-tree-index.md)        | P1-2、P2-1、P2-2、P2-4、P2-5、P3-8                   |
| [US-307](../stories/collaboration/US-307-restore-session.md)           | P1-3、P3-8                                           |
| [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) | P1-3、P2-1、P3-8                                     |
| [status-overview.md](../status-overview.md)                            | P2-3                                                 |
| [zh-glossary.md](../zh-glossary.md)                                    | P3-8                                                 |

未产生改动：P3-5（首版事实错误，已撤回）。

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
