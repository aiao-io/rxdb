# 候选领域：协同知识库 / 笔记 / 文档（Notion 类）

> 本文是候选领域分析，不是用户故事，不参与状态统计。状态与维护规则见
> [本目录 README](README.md)。

**一句话结论**：能力覆盖面最齐的品类——目录树、全文搜索、本地 AI、加密全部已交付；
短板是实时协同编辑与附件，两者都还是 vision 方向不是交付。

## 契合点：现有能力逐项映射

| 产品功能            | 引擎现有能力                                                      | 出处                                                                                                                               |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 目录树 / 页面层级   | 树插件（单父邻接表），三端文件管理器 demo 已验证                  | [capability-matrix](../capability-matrix.md) 跨框架矩阵                                                                            |
| 全文搜索            | SQLite FTS5 + PGlite pg-tsvector 已交付，CJK bigram 函数已注册    | [US-702](../stories/future/US-702-full-text-search.md) · [US-703](../stories/future/US-703-pglite-full-text-search.md)             |
| 语义搜索 / 本地 AI  | sqliteai 向量列 + AI SQL 函数支撑本地 RAG（vision 阶段 6 的底座） | [US-205](../stories/adapter/US-205-sqliteai-adapter.md)                                                                            |
| 隐私内容加密        | 加密 keyring 内建，非外层包装                                     | [US-803](../stories/future/US-803-local-encryption.md)                                                                             |
| 数据安全            | 一致性备份与恢复、实体操作权限模型                                | [US-217](../stories/adapter/US-217-local-database-backup-restore.md) · [US-027](../stories/core/US-027-entity-permission-model.md) |
| 离线编辑 + 多端同步 | Local-first + 双向同步，断网写入、回网合并                        | [epic-002](../epics/epic-002-data-sync.md)                                                                                         |
| 表单 / 详情 / 表格  | `@aiao/rxdb-model` 系列，模型直接驱动三端 UI                      | [vision](../vision.md) 阶段 4                                                                                                      |

## 引擎缺口

- **实时协同编辑**：同步是异步合并 + 冲突处理模型，不是 OT/CRDT 实时通道。
  多人同时编辑同一文档要等 vision 阶段 3 的冲突中心（方向不是承诺），
  或者外接 CRDT 服务（引擎外成本）
- **附件**：文档里的图片 / 文件是高频内容，分片上传、缩略图、对象存储同步是
  vision 阶段 5 的方向，今天未交付

## 引擎外成本

- 服务端账号 / 租户 / 权限体系（RBAC 写授权有 US-029 候选但价值待证，见 roadmap 立项池）
- 若做实时协同：外部 CRDT/OT 协作服务

## 入场条件（什么信号才值得立项）

出现具名用户群体的「今天踩得到」的具体症状，例如：

- 已有用户报告「断网写长文丢稿」「多设备继续写互相覆盖」的真实案例
- 或者出现一个真实团队用现有三端 demo 做笔记、且明确要求全文搜索/离线编辑的场景

**状态**：研究中
