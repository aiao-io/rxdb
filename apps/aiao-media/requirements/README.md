# Aiao Media 需求管理

这里维护 Aiao Media 的用户故事、史诗和状态总览。这个目录不是「想法回收站」，而是当前实现范围、优先级和完成状态的业务入口。

> **本地作品检索、稳定分页与真实视口按需预览已完成本地验收，按 D-11 记为 Done，PR 待评审合并。** 原有图片保存/下载、可选账号、绑定、同步与后台保留各自证据；Supabase 本轮仍仅本地，移动真机暂缓、桌面 IME 跳过未验。新功能未部署，先看 [MEDIA-US-204](stories/account/MEDIA-US-204-library-search.md)、[实施清单](plans/library-search-tasks.md)与[路线图](roadmap.md)。

本目录管理 Aiao Media 的独立产品需求，编号为 `MEDIA-US-XXX`。仓库根 `requirements/` 管理平台与领域能力，两者分别统计；通过带作用域的能力引用关联，底层故事 Done 不代表应用已接线或验收。

## 术语

| 缩写 | 全称                | 含义                                                                                                |
| ---- | ------------------- | --------------------------------------------------------------------------------------------------- |
| AC   | Acceptance Criteria | 验收标准（验收准则）。每条 story 正文「## 验收标准」表里的一行；`AC#N` 指该 story 第 N 条验收标准。 |
| US   | User Story          | 用户故事。需求编号 `MEDIA-US-XXX`，对应 `stories/*/MEDIA-US-XXX.md`。                               |

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/MEDIA-US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。当前 12 条故事：8 条 Done（工作区及七条全部 AC 已验的故事，七条按 D-11 在当前分支结项），1 条 In Progress（灵感库的真实桌面 IME 未验），0 条 In Review，1 条 Backlog（暂缓的移动设备验收），2 条 Blocked（图片生成直连与真实跨 origin URL 补验）。PR #154 尚未合并。

## 目录结构

一个问题一个文件。查什么去哪里：

| 文件                                             | 回答的问题                                                     |
| ------------------------------------------------ | -------------------------------------------------------------- |
| [status-overview.md](status-overview.md)         | 每条故事**现在是什么状态**、哪些在做、哪些卡住                 |
| [roadmap.md](roadmap.md)                         | **接下来做什么**、什么必须排在什么前面                         |
| [capability-matrix.md](capability-matrix.md)     | 仓库**现在能做什么**、哪些组合还不支持                         |
| [verification-report.md](verification-report.md) | 哪些证据来自本地/模拟，哪些仍需真实环境（分层验收台账）        |
| [decisions.md](decisions.md)                     | 正式域名、供应商额度、账户、桌面范围与按需决策的当前结论       |
| [plans/](plans/README.md)                        | 实施验收记录和历史归档                                         |
| `epics/`                                         | 史诗目标与范围划分                                             |
| `stories/`                                       | 按领域拆分的用户故事（**状态真相源**，含 `story.template.md`） |
| `reviews/`                                       | AI review 模板与尚未处理的问题报告（修复后删除，留清理记录）   |
| `code-scanning/`                                 | GitHub CodeQL 告警工作集（open 才留文件，关闭即归档删除）      |
| [design/image-mvp/](design/image-mvp/README.md)  | 图片 MVP 的界面设计、交互原型与真实页面截图                    |
| `CONVENTIONS.md`                                 | 命名 / 状态 / 写作规范（单一真相源）                           |

`stories/` 子目录与编号段见 [CONVENTIONS.md](CONVENTIONS.md#文档类型与编号段)（唯一真相源，不在此重复）。

## 状态定义

各文档类型的状态集合见 [CONVENTIONS.md](CONVENTIONS.md#状态定义)（story 五态：`Backlog` / `In Progress` / `In Review` / `Done` / `Blocked`）。

## 命名规范

文档的命名与编号段见 [CONVENTIONS.md](CONVENTIONS.md#命名规范)。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 复制出新 story
2. 选正确领域目录、未占用编号
3. 完整填写 frontmatter（id / title / status / priority / epic / created / updated / dependsOn / tags）、目标、AC 表、范围边界、实现文件
4. 推进过程中持续更新 `status`、`priority`、`updated`、`References`
5. 合并后：YAML `status: Done`，补 PR 链接

## 提交与 PR 关联方式

story ID 是仓库内的需求编号，不是 GitHub issue 编号。**不要**写成 `Closes #MEDIA-US-001`。

推荐写法：

```text
feat(web): implement image generation

Refs: MEDIA-US-102
```

PR 描述：

```text
## Related Stories
- MEDIA-US-102
```

## 复验基线

当前基线包括真实本地账号/复制/后台、正式 origin 代理三画幅交付和真实产物更新/回退；直连未知与真实 URL 结果的未验项继续保留。MEDIA-US-204 的全部 AC 已通过本轮分层验收：1,005 条 metadata 原生查询、50 张真实图片的全应用 IO、31 项统一本机 E2E；未部署、未合并，不能称为正式环境通过或 1,000 张原图 UI 实测。覆盖率限制、入口与准确数量见[验收记录](verification-report.md)。

更新需求后运行 `pnpm nx run aiao-media:requirements-check`，自动核对状态、关闭硬依赖、派生视图与本地链接；通过结构门禁不等于通过真实能力验收。

## 快速导航

Epic：

- [epic-001 工作区与静态发布](epics/MEDIA-EPIC-001.md)
- [epic-002 图片生成](epics/MEDIA-EPIC-002.md)
- [epic-003 账户、作品库与业务管理](epics/MEDIA-EPIC-003.md)
- [epic-004 本地优先与跨设备同步](epics/MEDIA-EPIC-004.md)

视图：

- [状态概览](status-overview.md) · [路线图](roadmap.md) · [能力矩阵](capability-matrix.md) · [验收记录](verification-report.md)
