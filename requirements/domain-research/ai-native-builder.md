# 候选领域：AI 原生本地优先开发环境（应用构建器）

> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

**一句话结论**：把「开发过程」本身变成 rxdb 数据集——项目文件、AI 改动的 commit 历史、
agent 会话与回放、codebase RAG 索引全在本地 SQLite 里；浏览器内编译运行（playground 路线）
让「在线构建应用」成立，而生成物是零后端 local-first 应用，恰好避开 WebContainer 级重运行时。
它是 playground（交互式构建界面）与低代码数据应用（`rxdb-model` 生成 CRUD）两个形态的合成旗舰，
与「智能体记忆 / 本地 AI 助手」候选是运行时合体伙伴。

**对标产品**：Bolt.new / Lovable / v0 / Replit Agent（云端 AI 构建器，锁定程度依次加深，
社区以「Clone Test」检验退出路径）；Dyad / bolt.diy / Singulary / Onlook（本地开源 BYOK 路线）；
Cursor / Windsurf（桌面 agent IDE）。产品位 = 「天然通过 Clone Test 的本地优先构建器」。

## 两个形态（同一内核）

| 形态                   | 宿主                  | 说明                                                                      |
| ---------------------- | --------------------- | ------------------------------------------------------------------------- |
| Web 本地优先 AI 构建器 | 浏览器（OPFS SQLite） | 对标 Bolt.new / Lovable；项目数据在本地库，BYOK 推理，静态托管上线        |
| 桌面 AI 开发环境       | Electron / Tauri      | 对标 Cursor agent 模式；项目 + agent 会话 + 回放 + RAG 索引全在本地加密库 |

两个形态是同一份引擎：Web / Electron / Tauri 宿主适配器均已交付，不存在第二套实现。

## 契合点：现有能力逐项映射

| 产品功能                 | 引擎现有能力                                                                     | 出处                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目文件树               | 树插件（单父邻接表），三端 hook 已交付                                           | [capability-matrix](../capability-matrix.md) 跨框架矩阵                                                                                                                                                    |
| AI 改动的版本管理        | working-tree commit graph——每次 AI 编辑是一次 commit，可回滚、可 diff、可开分支  | [epic-006](../epics/epic-006-working-tree-commits.md)                                                                                                                                                      |
| agent 会话可观测         | 会话录制回放 + Replayer 三端组件——复现「agent 为什么改坏了这里」                 | [US-909](../stories/future/US-909-session-replay-debugging.md)                                                                                                                                             |
| codebase RAG             | sqliteai 向量列 + FTS5（CJK bigram）——项目文件、commit、历史决策与检索在同一个库 | [US-205](../stories/adapter/US-205-sqliteai-adapter.md) · [US-702](../stories/future/US-702-full-text-search.md)                                                                                           |
| 项目跨设备 / 协作 / 迁移 | 双向同步 + Supabase / HTTP 适配器——「导出项目」就是打开一个数据库                | [epic-002](../epics/epic-002-data-sync.md) · [US-203](../stories/adapter/US-203-supabase-adapter.md) · [US-212](../stories/adapter/US-212-http-adapter.md)                                                 |
| 私密项目 / 密钥          | 加密 keyring 内建（非外层包装）                                                  | [US-803](../stories/future/US-803-local-encryption.md)                                                                                                                                                     |
| 一致性备份               | 备份与恢复——「AI 改崩了」的最后保险                                              | [US-217](../stories/adapter/US-217-local-database-backup-restore.md)                                                                                                                                       |
| 生成物的数据层           | 模型驱动实体 + 声明式约束（CHECK / 条件唯一 / 区间排他）+ 三端类型安全仓库       | [epic-001](../epics/epic-001-core-mvp.md) · [US-030](../stories/core/US-030-declarative-storage-constraints.md)                                                                                            |
| 代码编辑器 UI            | `@aiao/code-editor` 三端（CodeMirror 6）已交付并被 demo 使用                     | [capability-matrix](../capability-matrix.md) 包清单                                                                                                                                                        |
| 生成物多宿主部署         | Web / Electron / Tauri / 小程序适配器——生成的应用第一天就多端                    | [US-207](../stories/adapter/US-207-desktop-local-database.md) · [US-208](../stories/adapter/US-208-electron-pglite-data-directory.md) · [US-210](../stories/adapter/US-210-tauri-sqlite-local-database.md) |

## 关键闭环：产品哲学决定技术复杂度

云构建器生成 Next.js / Node 应用，才被迫上 WebContainer 这种浏览器 Node 运行时（StackBlitz
生态、嵌入成本高）。本候选生成的是「数据库即前端」零后端应用：编译只要框架的浏览器编译器
（`@vue/compiler-sfc` / esbuild-wasm / TS worker，Vue REPL 路线已开源验证），运行只要 iframe——
技术栈比对手轻一个量级，生成物还不锁平台。三框架对称在这个候选里从「税」变成「卖点」：
Angular / React / Vue 任选，同一套数据层。

## 引擎缺口

- **多人同时编辑同一项目**：同步是异步合并 + 冲突处理模型，实时协作是 [vision](../vision.md)
  阶段 3 的方向（不是承诺）；单人 + 多设备 + 复制协议已成立
- **项目里的二进制附件 / 静态资源**：vision 阶段 5 方向，今天未交付
- **混合检索编排**：FTS 与向量检索的统一编排是 vision 阶段 6 方向——两个原语已交付，
  应用层组合可用

## 引擎外成本

- **LLM 推理**：BYOK（用户自己的 key 存本地加密库，保持零后端）或本地模型（Ollama）；
  浏览器内跑大模型仍然重
- **编译与运行沙箱**：框架浏览器编译器 + iframe（轻量路径，见上）；WebContainer 不必要
- **agent 编排循环**：prompt loop、工具调用、模型路由是应用层职责
- **评测体系**：prompt / agent eval 是本赛道真正的长期成本，与引擎无关

## 与兄弟候选的关系

- **playground 形态**（交互式构建界面）并入本候选，不单独立项
- **低代码数据应用**（`rxdb-model` 生成 CRUD）并入本候选，作为生成物数据层的生成路径
- **[local-ai-agent](local-ai-agent.md)**：运行时合体伙伴——agent 记忆、运行日志、会话回放
  复用同一内核，本候选是它的开发者向形态

## 立项前置

演示版无硬前置：编辑器、commit graph、回放、RAG 原语、三端仓库全部已交付。含实时协作的
版本前置 vision 阶段 3 或外接 CRDT 服务；含二进制附件的版本前置 vision 阶段 5。

## 入场条件（什么信号才值得立项）

出现具名用户的「今天踩得到」的具体症状，例如：

- 已有用户报告「AI 生成的项目改坏了回不去」——需要 commit graph + 回放，而不是聊天记录翻找
- 或出现具名用户 / 团队 Clone Test 失败：Bolt / Lovable 上的项目拿不出来、迁不动、离线打不开
- 或出现具名团队明确要求「项目数据在自己手里、断网继续开发」——BYOK + 本地库 + 加密的组合诉求
