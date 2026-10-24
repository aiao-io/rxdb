# 约定（Conventions）

`requirements/` 全域的统一约定：**命名规范、状态定义、写作规范、模板位置**。
这里是唯一真相源，各子目录 README 与模板只做指引，不重复定义。

本项目的编号 `MEDIA-US-XXX` 属于 Aiao Media，独立于仓库根平台需求的 `US-XXX`。
平台能力引用使用 `rxdb:US-203` 等标识，写在故事的 `capabilities` 中；应用内部前置继续写在 `dependsOn`。底层 Done 不代表应用已接线或验收。

## 文档类型与编号段

`requirements/` 下有四类带编号的文档，各自 id 前缀与编号段如下：

| 类型           | id 前缀          | 编号段 / 规则                                                                                           | 目录                |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| 用户故事 story | `MEDIA-US-XXX`   | 按领域分段（见下）                                                                                      | `stories/<domain>/` |
| 史诗 epic      | `MEDIA-EPIC-XXX` | 递增，与 `epics/*.md` 文件名一致                                                                        | `epics/`            |
| review 记录    | `RV-XXX`         | `RV-001` 起递增，不与 `US` / `CS` 混用                                                                  | `reviews/`          |
| code-scanning  | `CS-XXX`         | 与 GitHub code scanning 告警 `number` 一一对应；工作集条目，GitHub 关闭后归档进该目录 README 并删除文件 | `code-scanning/`    |

`stories/` 子目录与编号段：

| 目录           | 内容                                                        | 当前编号段       |
| -------------- | ----------------------------------------------------------- | ---------------- |
| `platform/`    | 工作区 / 创作界面 / 静态部署                                | MEDIA-US-001~099 |
| `generation/`  | 图片生成、供应商配置、提示词灵感库                          | MEDIA-US-101~199 |
| `account/`     | Supabase 账号与授权、本地图片作品与任务历史、跨用户业务后台 | MEDIA-US-201~299 |
| `local-first/` | 浏览器本地持久化、草稿同步                                  | MEDIA-US-301~399 |

> `local-first/` 使用 300 段编号。新增故事按目录就近取未占用编号，不强制重排既有编号。

## 命名规范

- 用户故事：`MEDIA-US-XXX-description.md`
- 史诗：`MEDIA-EPIC-XXX.md`
- review：`RV-XXX-描述.md`
- code-scanning：`CS-XXX-*.md`（编号与 GitHub 告警 number 对应）

**不使用** `MEDIA-US-XXXa` / `MEDIA-US-XXXb` 这类字母后缀文件；大故事在文件内分「交付阶段」，见下文「大故事分阶段」。

**辅助文件**（证据留档、交付 profile、维护准入候选这类挂在某条 story 下的资料）与它所属的 story 同目录，命名 `<主题>.md`（如 `image-delivery-profile.md`、`capability-evidence-source.md`）。辅助文件**没有** story frontmatter，不计入故事数，也不进 `status-overview.md`；统计故事数以带 `status:` frontmatter 的文件为准。

**计划与验收记录**（MVP 计划、实施验收、历史归档）放在 `plans/`，不是 story，不参与状态统计。

## 状态定义

| 类型          | 状态集合                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------- |
| story         | `Backlog` / `In Progress` / `In Review` / `Done` / `Blocked`                                |
| review        | `Open` / `Resolved`                                                                         |
| code-scanning | `Open` / `Resolved` / `Dismissed`                                                           |
| epic          | `Backlog` / `In Progress` / `Done`（frontmatter 另含 `startDate` / `targetDate` / `owner`） |

story 状态含义：

| 状态          | 含义                       |
| ------------- | -------------------------- |
| `Backlog`     | 已确认要做，但还没开始     |
| `In Progress` | 正在实现                   |
| `In Review`   | 代码已完成，等待审核或收尾 |
| `Done`        | 已合并，当前仓库能力已覆盖 |
| `Blocked`     | 被外部依赖或前置条件卡住   |

story 的 YAML `status` 是状态**唯一真相源**；`status-overview.md` 与各 epic 文件都是派生视图，出现冲突时以 YAML 为准并同步修复派生视图。

epic 状态由所属 story 派生（不单独维护）：成员故事全 Done 则 `Done`，全 Backlog 则 `Backlog`，否则 `In Progress`。

`Done` 要求该 story 全部 In Scope 均有验收覆盖、范围内全部 AC 都为 ✅，并有可复验的实现/测试证据。占位表结构、工具函数或尚未接入 UI 的工厂不等于产品能力。

review 状态含义：`Open` 已发现待修复；`Resolved` PR 已合并、修复落地。

code-scanning 状态含义（GitHub 是真相源，本地文件是镜像）：`Open` 待修复；`Resolved` 已修复代码合并；`Dismissed` 已承认风险、不修。

## 依赖与验收契约

- Story YAML `dependsOn` 记录可关闭故事的硬依赖；技术验证可以提前开展，不等于故事能够提前关闭。Web/桌面分阶段时，在原文件记录各阶段证据，全部范围验收后才关闭。
- 安全、删除、升级、崩溃恢复及跨用户访问等范围必须有正反向 AC；验收写具体故障点和可判定结果，不以「符合策略」代替策略。
- 身份、任务、临时传输、本地保存分别维护状态；不得因其中一环成功就更新另一环为成功。

## 跨故事 AC 转移

当一个 story 的某条 AC 被推迟到另一个 story 实现，在**接收方** story 的 frontmatter 加 `inherited_acs` 字段：

```yaml
inherited_acs:
  - from: US-NNN
    ac: N
    note: 简述为什么这条 AC 从源故事迁来
```

接收方 YAML 是唯一的机器可读真相；源 story 不另写注释或反向索引。

## 写作规范

### 事实与复验

- 当前事实写源码路径、符号或可复验命令；仅凭设计推断的说法标明「推断」。优先链接文件与符号，避免易漂移的行号。
- 不用需求正文记录「第几轮复核」「以前怎么做」之类过程；当前结论就地覆盖，历史由 Git 保存。
- 文档说「支持」必须区分 **UI 可选 / API 契约或 schema 存在 / 服务实际可用 / 桌面可发行**；矩阵见 [能力矩阵](capability-matrix.md)。
- 上游能力以 同级仓库的需求目录 及实际包 API 为准；本项目的 adapter 接线、持久化和跨进程测试必须在本仓验收。

### 结论必须写出复验方式

每一条结论，正文里要能看出它**是怎么被验证的**——读了哪个符号、跑了哪条命令、还是仅凭对另一份文档的推理。仅凭文档推理得出的结论标注为**推断**，不与源码实证的结论混排。

**文档只写当前结论。** 不保留被取代的旧结论、不写「第 N 轮复核」这类演进叙述，也不用删除线保留原文。改判就地覆盖——判断怎么变的由 git 历史回答，文档本身永远是终版。

### 过程留档的去向

实现过程中产生的**演进叙述**（`已于 X 日关闭`、`~~删除线~~`、`复核/改判记录`）**不得进入需求正文**：纯过程就地删除（git 历史就是记录）；对后来者有价值的教训落进实现注释或迁移文档；仍生效的约束写成当前事实，不含日期、不写对比叙述。

派生视图（`status-overview.md` / `roadmap.md` / `capability-matrix.md` / `verification-report.md`）尤其如此：它们回答「现在」，不是「曾经」。

### 大故事分阶段，不拆子故事文件（硬规则）

一条 story 体量过大时，**在文件内用 `## 交付阶段` 表切成 A / B / C…**，AC 表按阶段分段编号，实现文件表加「阶段」列。**不创建 `MEDIA-US-XXXa` / `MEDIA-US-XXXb` 这类中间版本文件。** 一段工作只有在具备自己的用户价值、自己的前置和自己的关闭条件时才新开编号。

### 价值待证

一条故事若无法写出「**今天用户踩得到的具体症状**」，标注**价值待证**并留在 Backlog，不得凭 Epic 惯性排期。判据是病灶数 ≥ 抽象数：新增抽象的数量不应超过它实际关闭的已知缺陷数量。

## 模板位置

新建文档从对应模板复制，选正确目录、未占用编号：

| 类型          | 模板                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| story         | [stories/story.template.md](stories/story.template.md)                             |
| epic          | [epics/epic.template.md](epics/epic.template.md)                                   |
| review        | [reviews/review.template.md](reviews/review.template.md)                           |
| code-scanning | [code-scanning/code-scanning.template.md](code-scanning/code-scanning.template.md) |

## 自动需求门禁

运行 `pnpm nx run aiao-media:requirements-check`（亦可用 `pnpm nx run aiao-media:requirements-check`）；常规 `test` 入口会先运行此门禁。门禁只读文档与链接目标，不修改状态、连接数据库或访问供应商。

- 校验真实 story 的 YAML、唯一 ID/文件名、日期先后、范围/章节、连续 AC 编号与合法标记。
- 检查硬依赖存在与无环、Done 的全部 AC 和关闭依赖、Backlog 不提前通过完整 AC。
- 按 story 派生并核对 Epic 状态/目标勾选、状态概览的数量/索引、需求索引与验收记录的汇总数字。
- 检查本仓 Markdown 的本地链接/标题锚点；只跳过 fenced 示例和模板的明确占位路径。

脚本见 [`check-requirements.mjs`](../scripts/check-requirements.mjs)。结构检查通过**不证明**真实供应商、公网部署、历史迁移或正式发行；这些仍须逐条 AC 的真实环境证据。

## 变更步骤

1. 修改对应 story 的范围、AC、YAML `updated` 与 `status`。
2. 更新所属 Epic 的目标勾选、[状态概览](status-overview.md)、[路线图](roadmap.md) 和[能力矩阵](capability-matrix.md)（若产品能力变更）。
3. 检查本仓相对链接，并运行 `pnpm nx run aiao-media:requirements-check`；文档不能用上游故事的 ✅ 代替本仓实测。
