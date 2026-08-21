# 约定（Conventions）

`requirements/` 全域的统一约定：**命名规范、状态定义、写作规范、模板位置**。
这里是唯一真相源，各子目录 README 与模板只做指引，不重复定义。

## 文档类型与编号段

`requirements/` 下有四类带编号的文档，各自 id 前缀与编号段如下：

| 类型           | id 前缀         | 编号段 / 规则                                  | 目录                |
| -------------- | --------------- | ---------------------------------------------- | ------------------- |
| 用户故事 story | `US-XXX`        | 按领域分段（见下）                             | `stories/<domain>/` |
| 史诗 epic      | `epic-XXX-name` | 递增，与 `epics/*.md` 文件名一致               | `epics/`            |
| review 记录    | `RV-XXX`        | `RV-001` 起递增，不与 `US` / `CS` 混用         | `reviews/`          |
| code-scanning  | `CS-XXX`        | 与 GitHub code scanning 告警 `number` 一一对应 | `code-scanning/`    |

`stories/` 子目录与编号段：

| 目录             | 内容                                                        | 编号段     |
| ---------------- | ----------------------------------------------------------- | ---------- |
| `core/`          | 核心引擎                                                    | US-001~099 |
| `framework/`     | Angular / React / Vue 集成                                  | US-101~199 |
| `adapter/`       | SQLite / PGlite / Supabase / sqliteai / 小程序 / 桌面适配器 | US-201~299 |
| `collaboration/` | 版本控制、撤销/重做、迁移协作                               | US-301~399 |
| `ui/`            | 代码编辑器等跨框架 UI 组件                                  | US-401~499 |
| `plugin/`        | RxDB plugin 包（workspace / storage / graph）               | US-501~599 |
| `tooling/`       | 门禁、基线与发布工具链（不是产品能力）                      | US-601~699 |
| `future/`        | 中长期规划                                                  | US-700~999 |

## 命名规范

- 用户故事：`US-XXX-description.md`
- 史诗：`epic-XXX-name.md`
- review：`RV-XXX-描述.md`
- code-scanning：`CS-XXX-*.md`（编号与 GitHub 告警 number 对应）

**不使用** `US-XXXa` / `US-XXXb` 这类字母后缀文件；大故事在文件内分「交付阶段」，见下文「大故事分阶段」。

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

story 的 YAML `status` 是状态**唯一真相源**；`status-overview.md` 与各 epic 文件都是派生视图，
出现冲突时以 YAML 为准并同步修复派生视图。

review 状态含义：

| 状态       | 含义                |
| ---------- | ------------------- |
| `Open`     | 已发现，待修复      |
| `Resolved` | PR 已合并，修复落地 |

code-scanning 状态含义（GitHub 是真相源，本地文件是镜像）：

| 状态        | 含义             | GitHub 对应 |
| ----------- | ---------------- | ----------- |
| `Open`      | 待修复           | `open`      |
| `Resolved`  | 已修复，代码合并 | `fixed`     |
| `Dismissed` | 已承认风险、不修 | `dismissed` |

## 跨故事 AC 转移

当一个 story 的某条 AC 被推迟到另一个 story 实现，**不要**只在源 story 的 HTML 注释里写
`<!-- deferredACs: AC#X→US-NNN -->`。在 **接收方** story 的 frontmatter 加 `inherited_acs` 字段：

```yaml
inherited_acs:
  - from: US-NNN
    ac: N
    note: 简述为什么这条 AC 从源故事迁来
```

源 story 文件本体注释保留作为反向索引可读性辅助，但接收方 YAML 是机器可读的真相。

## 写作规范

### 证据锚点

任何「现状是 X」的断言都要能被读者在**一次跳转内**独立复验。据此的引用优先级：

| 优先级 | 形式                                                               | 为什么                                       |
| ------ | ------------------------------------------------------------------ | -------------------------------------------- |
| 1      | **符号名** — `` `RxDB.#install_plugin()` ``、`IRxDBPlugin.destroy` | 上游插入几行不会失效；可直接 grep            |
| 2      | **短代码引用**（1～3 行原文，带反引号块）                          | 读者无需打开文件就能判断断言是否成立         |
| 3      | 行号锚点 `file.ts#L283-L285`                                       | **只作辅助**，永远与 1 或 2 同时出现，不单用 |

反面示例与正面示例：

````markdown
❌ 行号一旦漂移，断言就变成不可复验的传闻：

`#install_plugin()` 在 try 外（见 RxDB.ts:283-285）

✅ 符号名 + 原文引用，行号仅作导航：

`RxDB.#install_plugin()` 被放在 `try` 块**之外**
（[RxDB.ts:283-285](../packages/rxdb/src/RxDB.ts#L283-L285)）：

```ts
this.#install_plugin();
try {
  this.schemaManager.init();
```
````

配套要求：

- **跨文件同类锚点一起改**。行号漂移是系统性的——某个文件插入 8 行，则该文件所有后续锚点同时错 8。
  修一处而不扫全仓，等于留下更难发现的错误。改完用
  `grep -rn 'packages/rxdb/src/RxDB.ts#L' requirements/` 自查。
- **锚点失效的真实代价不是"链接坏了"**，是读者停止复验、转而信任叙述。带错误前提的断言只要锚点
  没人点开，就能一路活到实现阶段。

### 结论必须写出复验方式

每一条结论，正文里要能看出它**是怎么被验证的**——读了哪个符号、跑了哪条命令、
还是仅凭对另一份文档的推理。仅凭文档推理得出的结论标注为**推断**，不与源码实证的结论混排。

**文档只写当前结论。** 不保留被取代的旧结论、不写「第 N 轮复核」「X 月 X 日更正」这类演进叙述，
也不用删除线保留原文。改判就地覆盖——判断怎么变的由 git 历史回答，文档本身永远是终版。

### 大故事分阶段，不拆子故事文件（硬规则）

一条 story 体量过大时，**在文件内用 `## 交付阶段` 表切成 A / B / C…**，AC 表按阶段分段编号，
实现文件表加「阶段」列。**不创建 `US-XXXa` / `US-XXXb` 这类中间版本文件。**

理由：拆成子文件会同时做两件事——把父文件移出 Backlog（不再可开工），却依赖另一次改动把等量的
可交付项放回去；一旦子文件缺席，Epic 就呈现「有故事在排队」的假象，而实际上没有任何一条可以开工。
留在同一个文件里则天然不会出现这个断层：状态只有一条，阶段完成度写在「交付阶段」表的状态列。
一段工作只有在具备**自己的用户价值、自己的前置和自己的关闭条件**时才新开编号。

### 价值待证（🚧 / 价值待证）

被其它文档引用、但 `stories/` 下无对应文件的条目标 **🚧**，且**不计入任何统计**
（它与汇总表的 🚫 Blocked 不同，后者统计 YAML 里显式 `status: Blocked` 的既有故事）。

一条故事若无法写出「**今天用户踩得到的具体症状**」，标注**价值待证**并留在 Backlog，
不得凭 Epic 惯性排期。判据是 **病灶数 ≥ 抽象数**：新增抽象的数量不应超过它实际关闭的已知缺陷数量。

## 模板位置

新建文档从对应模板复制，选正确目录、未占用编号：

| 类型          | 模板                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| story         | [stories/story.template.md](./stories/story.template.md)                             |
| epic          | [epics/epic.template.md](./epics/epic.template.md)                                   |
| review        | [reviews/review.template.md](./reviews/review.template.md)                           |
| code-scanning | [code-scanning/code-scanning.template.md](./code-scanning/code-scanning.template.md) |

## 中文注释词汇约定

`packages` 下 JS/TS 文件的注释词汇统一看 [zh-glossary.md](./zh-glossary.md)：哪些词保留（纪元、宿主、活查询、水位线）、哪些词要改（占坑→认领执行权、回呼→回调、惊动订阅者→通知订阅者）、按项目分组的差异。改中文注释前先看。
