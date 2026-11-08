# 约定（Conventions）

`requirements/` 全域的统一约定：**命名规范、状态定义、写作规范、模板位置**。
这里是唯一真相源，各子目录 README 与模板只做指引，不重复定义。

本项目的编号 `POOL-US-XXX` 属于 Aiao Pool（文件池），独立于仓库根平台需求的 `US-XXX`。
平台能力引用使用 `rxdb:US-XXX` 等标识，写在故事的 `capabilities` 中；应用内部前置继续写在 `dependsOn`。底层 Done 不代表应用已接线或验收。

## 文档类型与编号段

`requirements/` 下有四类带编号的文档，各自 id 前缀与编号段如下：

| 类型           | id 前缀         | 编号段 / 规则                                                                                           | 目录                                        |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 用户故事 story | `POOL-US-XXX`   | 按领域分段（见下）                                                                                      | `stories/<domain>/`                         |
| 史诗 epic      | `POOL-EPIC-XXX` | 递增，与 `epics/*.md` 文件名一致                                                                        | `epics/`                                    |
| review 记录    | `RV-<uuid>`     | 沿用根规范：新问题写在仓库根；本目录 `reviews/` 里的旧 ID 保留                                          | 仓库根 `requirements/reviews/<projectKey>/` |
| code-scanning  | `CS-XXX`        | 与 GitHub code scanning 告警 `number` 一一对应；工作集条目，GitHub 关闭后归档进该目录 README 并删除文件 | `code-scanning/`                            |

`stories/` 子目录与编号段：

| 目录        | 内容                                                                     | 当前编号段      |
| ----------- | ------------------------------------------------------------------------ | --------------- |
| `ops/`      | 产品运营、安全与治理（回退内容加密、速率限制、举报、邀请制）             | POOL-US-101~199 |
| `desktop/`  | 桌面端形态（Electron / Tauri、局域网发现增强）                           | POOL-US-201~299 |
| `commerce/` | 商业化与增长（免费/Team 双档、支付、扩展渠道）                           | POOL-US-301~399 |
| `collab/`   | 协作纵深（epic-012 产品化视图：整库克隆、实时信号、远程 DevTools、枢纽） | POOL-US-401~499 |

> 新增故事按目录就近取未占用编号，不强制重排既有编号。

## 命名规范

- 用户故事：`POOL-US-XXX-description.md`
- 史诗：`POOL-EPIC-XXX.md`
- review：新问题写仓库根 `requirements/reviews/<projectKey>/RV-<uuid>.md`（本应用为 `dev-rxdb-p2p/` 与 `dev-rxdb-p2p-e2e/`）；`reviews/` 里的旧记录按原 ID 就地处理。
- code-scanning：`CS-XXX-*.md`（编号与 GitHub 告警 number 对应）

**不使用** `POOL-US-XXXa` / `POOL-US-XXXb` 这类字母后缀文件；大故事在文件内分「交付阶段」。

**辅助文件**（证据留档、交付 profile 这类挂在某条 story 下的资料）与它所属的 story 同目录，命名 `<主题>.md`。辅助文件**没有** story frontmatter，不计入故事数，也不进 `status-overview.md`；统计故事数以带 `status:` frontmatter 的文件为准。

**计划与验收记录**（立项方案、实施验收、历史归档）放在 `plans/`，不是 story，不参与状态统计。

## 状态定义

| 类型          | 状态集合                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------- |
| story         | `Backlog` / `In Progress` / `In Review` / `Done` / `Blocked`                                |
| review        | 沿用根规范：`Open` / `Fixed` / `Resolved` / `Disputed` / `Dismissed` / `Accepted`           |
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

review 状态含义与转移表沿用根 [CONVENTIONS](../../../requirements/CONVENTIONS.md#状态定义)，不在本应用另行定义。

code-scanning 状态含义（GitHub 是真相源，本地文件是镜像）：`Open` 待修复；`Resolved` 已修复代码合并；`Dismissed` 已承认风险、不修。

## 依赖与验收契约

- Story YAML `dependsOn` 记录可关闭故事的硬依赖；平台能力引用写在 `capabilities`（如 `rxdb:US-706`），不把平台故事状态复制进本目录。技术验证可以提前开展，不等于故事能够提前关闭。
- 安全、删除、升级、崩溃恢复及跨用户访问等范围必须有正反向 AC；验收写具体故障点和可判定结果，不以「符合策略」代替策略。
- Web/桌面分阶段时，在原文件记录各阶段证据，全部范围验收后才关闭。

## 写作规范（证据锚点）

任何「现状是 X」的断言都要能被读者在**一次跳转内**独立复验，优先级：

| 优先级 | 形式                                                     | 为什么                               |
| ------ | -------------------------------------------------------- | ------------------------------------ |
| 1      | **符号名** — `` `SignalRouter.hello()` ``、`p2p.admin_*` | 上游插入几行不会失效；可直接 grep    |
| 2      | **短代码引用**（1～3 行原文，带反引号块）                | 读者无需打开文件就能判断断言         |
| 3      | 行号锚点 `file.ts#L283-L285`                             | **只作辅助**，永远与 1 或 2 同时出现 |

平台能力的现状断言引用根 `requirements/` 的对应 story（`rxdb:US-XXX`），不复制状态；本目录只写产品增量。
