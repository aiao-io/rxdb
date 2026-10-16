# 候选领域：智能体记忆 / 本地 AI 助手

> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

**一句话结论**：「数据库即前端」形态的旗舰应用——智能体的长时记忆、运行日志、检索全落在
本地 SQLite，仓库的 sqliteai（向量列 + AI SQL 函数）、FTS5、会话录制回放正好拼出
「本地优先智能体」的数据层；引擎缺口在混合检索编排与本地 embedding（vision 阶段 6 方向
未交付），推理本身永远在引擎外（BYOK 或本地模型）。

**对标产品**：ChatGPT 记忆功能 / Claude Projects（品类）；Mem0 / Letta / Zep（记忆即产品的
独立赛道）；PrivateGPT / Open WebUI + Ollama（本地 AI 应用标杆）。

## 契合点：现有能力逐项映射

| 产品功能         | 引擎现有能力                                                          | 出处                                                            |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| 长时记忆         | 记忆 / 片段 / 会话即实体，本地留存；加密 keyring 保护私人记忆         | [epic-001](../epics/epic-001-core-mvp.md) · [US-803](../stories/future/US-803-local-encryption.md) |
| 记忆检索         | FTS5（关键词）+ sqliteai 向量列与 AI SQL 函数（语义）——混合检索原语已交付 | [US-702](../stories/future/US-702-full-text-search.md) · [US-205](../stories/adapter/US-205-sqliteai-adapter.md) |
| 运行日志 / 会话   | append 实体 + 活查询面板（任务、步骤、工具调用实时刷新）               | [epic-001](../epics/epic-001-core-mvp.md)                       |
| 失败调试         | 会话录制回放（US-909 已交付）——agent run 的可观测性现成               | [US-909](../stories/future/US-909-session-replay-debugging.md)  |
| 设置 / 表单       | `@aiao/rxdb-model` 驱动提示词、工具、模型配置页                       | [vision](../vision.md) 阶段 4                                   |
| 数据安全         | 一致性备份与恢复（记忆是用户最不想丢的东西）                          | [US-217](../stories/adapter/US-217-local-database-backup-restore.md) |

## 引擎缺口

- **混合检索编排**：FTS 与向量检索的统一编排是 vision 阶段 6 的方向、未交付——
  两个原语已交付，应用层组合可用
- **本地 embedding 生成**：也是阶段 6 方向——可用外部 embedding API 绕开

## 引擎外成本

- **推理**：LLM API（BYOK——用户自己的 key 存本地加密库，保持零后端）或本地模型
  （Ollama / WebLLM，浏览器内跑大模型仍然重）
- **工具执行沙箱**：agent 的工具调用、文件读写是应用层职责
- **评测体系**：prompt / agent eval 是本赛道真正的长期成本，与引擎无关

## 立项前置

无硬前置（检索原语应用层组合；embedding 与推理用外部 API）。

## 入场条件（什么信号才值得立项）

- 出现具名用户「和 AI 对话要反复交代背景 / 换设备记忆丢失」的具体症状
- 或作为 vision 阶段 6（搜索与本地 AI）的演示载体立项——记忆检索是混合检索最直观的展示
