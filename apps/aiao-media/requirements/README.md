# Aiao Media 需求管理

这里维护 Aiao Media 的用户故事、史诗和状态总览。这个目录不是「想法回收站」，而是当前实现范围、优先级和完成状态的业务入口。

> **当前产品目标：验证桌面图片能力，接入可选 Supabase 同步，并开发跨用户业务后台。** 本机模式无登录和业务后端，本地 RxDB/OPFS 保存用户数据，用户配置 API Key 后由浏览器直连供应商，Cloudflare 免费静态部署；另提供用户主动选择的代理通道，默认按请求使用 Key。可选 Supabase 账号会话已有实现；工作区绑定与多机同步已有确定的实施方案，尚未接线；跨用户后台已纳入计划，移动端暂缓。先看[路线图](roadmap.md)和[静态部署方案](../deploy/local-first-pages.md)。

本目录管理 Aiao Media 的独立产品需求，编号为 `MEDIA-US-XXX`。仓库根 `requirements/` 管理平台与领域能力，两者分别统计；通过带作用域的能力引用关联，底层故事 Done 不代表应用已接线或验收。

## 术语

| 缩写 | 全称                | 含义                                                                                                |
| ---- | ------------------- | --------------------------------------------------------------------------------------------------- |
| AC   | Acceptance Criteria | 验收标准（验收准则）。每条 story 正文「## 验收标准」表里的一行；`AC#N` 指该 story 第 N 条验收标准。 |
| US   | User Story          | 用户故事。需求编号 `MEDIA-US-XXX`，对应 `stories/*/MEDIA-US-XXX.md`。                               |

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。当前 11 条故事：1 条 Done（多项目开发工作区），8 条 In Progress（静态部署、图片生成/供应商/灵感库、会话、作品库、本地与同步），2 条 Backlog（业务后台、暂缓的移动设备验收）。

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

当前基线包括本地构建、类型/lint/单测、真实浏览器持久化与离线冷启动，以及真实本地 Supabase 的账号界面和开发探针授权。产品复制、跨用户后台与正式 origin 的真实供应商仍需独立验收；移动真机不属于当前发布条件。可复验入口、准确测试数量和剩余任务统一记录在[验收记录](verification-report.md)。

更新需求后运行 `pnpm nx run aiao-media:requirements-check`，自动核对状态、关闭硬依赖、派生视图与本地链接；通过结构门禁不等于通过真实能力验收。

## 快速导航

Epic：

- [epic-001 工作区与静态发布](epics/MEDIA-EPIC-001.md)
- [epic-002 图片生成](epics/MEDIA-EPIC-002.md)
- [epic-003 账户、作品库与业务管理](epics/MEDIA-EPIC-003.md)
- [epic-004 本地优先与跨设备同步](epics/MEDIA-EPIC-004.md)

视图：

- [状态概览](status-overview.md) · [路线图](roadmap.md) · [能力矩阵](capability-matrix.md) · [验收记录](verification-report.md)
