# 候选领域：AI 原生本地优先开发环境（应用构建器）

> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

**一句话结论**：把「开发过程」本身变成 rxdb 数据集——项目目录、agent 会话与回放、
codebase RAG 索引留在本地 SQLite；代码文件与真实 Git 历史可走独立 OPFS 仓库，见
[Git + OPFS 技术研究](browser-git-opfs.md)。浏览器内编译运行（playground 路线）
让「在线构建应用」成立，而生成物是零后端 local-first 应用，恰好避开 WebContainer 级重运行时。
它是 playground（交互式构建界面）与低代码数据应用（`rxdb-model` 生成 CRUD）两个形态的合成旗舰，
与「智能体记忆 / 本地 AI 助手」候选是运行时合体伙伴。

**对标产品**：Bolt.new / Lovable / v0 / Replit Agent（云端 AI 构建器，锁定程度依次加深，
社区以「Clone Test」检验退出路径）；Dyad / bolt.diy / Singulary / Onlook（本地开源 BYOK 路线）；
Cursor / Windsurf（桌面 agent IDE）。产品目标 = 「可完整导出、通过 Clone Test 的本地优先构建器」；
数据库复制、Git 互通与导出后可构建需要分别验收。

## 对标深挖：Bolt.new / bolt.diy

Bolt.new 是头号对标（2026 功能面实测口径）——交互闭环（prompt → 文件编辑 → 浏览器内 dev
server 实时预览 → 「Fix with AI」自愈循环）、diff view、starter 模板、一键部署（Netlify /
Cloudflare）、Supabase 集成、V2 多模型可选。bolt.diy 是其 MIT 开源分叉（StackBlitz Labs），
证明 BYOK + 本地模型（Ollama）路线技术上走通，是本候选工程侧的对标。

### Bolt 的弱点 = 本候选的差异位

| Bolt 的弱点（2026 实测口径）                                             | 本候选的对应位（已交付能力背书）                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 项目不持久：无跨会话文件系统；bolt.diy 刷新即丢状态、SQLite 每次会话重置 | 本地数据库保存项目数据；OPFS 文件仓库持久化与跨设备获取待验证（[Git + OPFS](browser-git-opfs.md)） |
| 版本只有 undo / 快照，回滚靠重做                                         | working-tree 管数据库实体版本；代码文件的 Git 提交与恢复走独立引擎，待验证                         |
| 无会话可观测，调试靠翻聊天记录                                           | 会话录制回放 + Replayer 三端组件（[US-909](../stories/future/US-909-session-replay-debugging.md)） |
| 检索是平台闭源能力                                                       | sqliteai 向量 + FTS5 内建，codebase RAG 与项目数据在同一个库                                       |
| GitHub 导出单向、Pro 才解锁                                              | 数据库复制与 Git clone / push 分开设计；文件、历史及可构建导出需要单独验收                         |
| 生成物绑外部 DB（Supabase 手工配 key / RLS，生产常见翻车）               | 生成物自带 rxdb 零后端数据层——轻量路径绕开 WebContainer 的原因                                     |
| token 计量、免费档绑模型                                                 | BYOK + 本地模型，bolt.diy 已验证可行                                                               |

### 两个教训

1. **护城河其实是提示词工程 + 模板库 + 评测**。bolt.diy 用户的一致差评：同型号输出质量明显
   不如 Bolt.new，因为 StackBlitz 的 tuned system prompts、模板与预配置不开放。「引擎外成本」
   里最致命的一条不是编译器沙箱，而是评测体系——它是品质分水岭。
2. **先约束生成物与运行时范围**。本候选生成零后端应用，可先验证框架浏览器编译器 + 隔离预览；
   任意 Node 项目、原生模块、终端与包管理另行评估。Git + OPFS 不会自动解决这些运行时需求。

### 对标定位

产品 UX 对标 Bolt.new（三栏布局、diff view、自愈循环、部署流）；工程路线参考 bolt.diy
（BYOK 多 provider、Ollama 本地模型、Docker 自托管）；云项目存储、token 锁模型、
WebContainer 依赖三样明确不抄。

## 两个形态（同一内核）

| 形态                   | 宿主                  | 说明                                                                      |
| ---------------------- | --------------------- | ------------------------------------------------------------------------- |
| Web 本地优先 AI 构建器 | 浏览器（OPFS SQLite） | 对标 Bolt.new / Lovable；项目数据在本地库，BYOK 推理，静态托管上线        |
| 桌面 AI 开发环境       | Electron / Tauri      | 对标 Cursor agent 模式；项目 + agent 会话 + 回放 + RAG 索引全在本地加密库 |

两个形态是同一份引擎：Web / Electron / Tauri 宿主适配器均已交付，不存在第二套实现。

## 契合点：现有能力逐项映射

| 产品功能                 | 引擎现有能力                                                                                                                   | 出处                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目文件树               | 树插件（单父邻接表），三端 hook 已交付                                                                                         | [capability-matrix](../capability-matrix.md) 跨框架矩阵                                                                                                                                                    |
| AI 改动的版本管理        | working-tree 管经 adapter 写入的实体；代码文件的 Git 版本管理待独立接入                                                        | [epic-006](../epics/epic-006-working-tree-commits.md) · [Git + OPFS](browser-git-opfs.md)                                                                                                                  |
| agent 会话可观测         | 会话录制回放 + Replayer 三端组件（rrweb DOM 录制）——复现「agent 为什么改坏了这里」；模型请求、工具调用与任务恢复需独立事件模型 | [US-909](../stories/future/US-909-session-replay-debugging.md)                                                                                                                                             |
| codebase RAG             | sqliteai 向量列 + FTS5（CJK bigram）——项目文件、commit、历史决策与检索在同一个库                                               | [US-205](../stories/adapter/US-205-sqliteai-adapter.md) · [US-702](../stories/future/US-702-full-text-search.md)                                                                                           |
| 项目跨设备 / 协作 / 迁移 | 双向同步覆盖数据库实体；独立 OPFS 仓库通过 Git remote 获取，文件体不自动同步                                                   | [epic-002](../epics/epic-002-data-sync.md) · [Git + OPFS](browser-git-opfs.md)                                                                                                                             |
| 私密项目 / 密钥          | 加密 keyring 覆盖数据库；独立 OPFS 代码仓库的加密需另行设计                                                                    | [US-803](../stories/future/US-803-local-encryption.md)                                                                                                                                                     |
| 一致性备份               | 数据库备份已交付；完整项目备份还需文件与 `.git` 导出及一致性设计                                                               | [US-217](../stories/adapter/US-217-local-database-backup-restore.md) · [Git + OPFS](browser-git-opfs.md)                                                                                                   |
| 生成物的数据层           | 模型驱动实体 + 声明式约束（CHECK / 条件唯一 / 区间排他）+ 三端类型安全仓库                                                     | [epic-001](../epics/epic-001-core-mvp.md) · [US-030](../stories/core/US-030-declarative-storage-constraints.md)                                                                                            |
| 代码编辑器 UI            | `@aiao/code-editor` 三端（CodeMirror 6）已交付并被 demo 使用                                                                   | [capability-matrix](../capability-matrix.md) 包清单                                                                                                                                                        |
| 生成物多宿主部署         | Web / Electron / Tauri / 小程序适配器——生成的应用第一天就多端                                                                  | [US-207](../stories/adapter/US-207-desktop-local-database.md) · [US-208](../stories/adapter/US-208-electron-pglite-data-directory.md) · [US-210](../stories/adapter/US-210-tauri-sqlite-local-database.md) |

## 关键闭环：产品哲学决定技术复杂度

本候选先生成「数据库即前端」零后端应用，在受控模板内验证浏览器转译 / 编译与隔离预览。
Git + OPFS 提供文件与版本基础，依赖解析、资源加载和运行权限仍需单独实现，详见
[Git + OPFS 技术研究](browser-git-opfs.md)。是否需要 Node 运行时由支持的项目范围决定。
Angular / React / Vue 共享数据层，各框架的编译预览链路分别验收。

## 引擎缺口

- **多人同时编辑同一项目**：同步是异步合并 + 冲突处理模型，实时协作是 [vision](../vision.md)
  阶段 3 的方向（不是承诺）；单人 + 多设备 + 复制协议已成立
- **项目里的二进制附件 / 静态资源**：vision 阶段 5 方向，今天未交付
- **混合检索编排**：FTS 与向量检索的统一编排是 vision 阶段 6 方向——两个原语已交付，
  应用层组合可用

## 引擎外成本

- **LLM 推理**：BYOK（用户自己的 key 存本地加密库，保持零后端）或本地模型（Ollama）；
  浏览器内跑大模型仍然重
- **编译与运行沙箱**：受控模板先验证浏览器编译与隔离预览；任意 Node 项目的运行时成本另算
- **agent 编排循环**：prompt loop、工具调用、模型路由是应用层职责
- **评测体系**：prompt / agent eval 是本赛道真正的长期成本，与引擎无关——bolt.diy 同型号
  输出不如 Bolt.new 的差评即佐证（见上文对标深挖）

## 与兄弟候选的关系

- **playground 形态**（交互式构建界面）并入本候选，不单独立项
- **低代码数据应用**（`rxdb-model` 生成 CRUD）并入本候选，作为生成物数据层的生成路径
- **[local-ai-agent](local-ai-agent.md)**：运行时合体伙伴——agent 记忆、运行日志、会话回放
  复用同一内核，本候选是它的开发者向形态

## 立项前置

数据层演示可复用编辑器、数据库 commit graph、回放、RAG 原语与三端仓库。
浏览器代码工作区还需先通过 [Git + OPFS 验收](browser-git-opfs.md#先写验收再写接入)，
补齐编译、依赖解析与隔离预览，再承诺可运行项目。含实时协作的版本前置 vision 阶段 3
或外接 CRDT 服务；含二进制附件的版本前置 vision 阶段 5。

## 入场条件（什么信号才值得立项）

出现具名用户的「今天踩得到」的具体症状，例如：

- 已有用户报告「AI 生成的项目改坏了回不去」——需要 commit graph + 回放，而不是聊天记录翻找
- 或出现具名用户 / 团队 Clone Test 失败：Bolt / Lovable 上的项目拿不出来、迁不动、离线打不开
- 或出现具名团队明确要求「项目数据在自己手里、断网继续开发」——BYOK + 本地库 + 加密的组合诉求
