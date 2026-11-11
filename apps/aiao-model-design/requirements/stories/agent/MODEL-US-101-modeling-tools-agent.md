---
id: MODEL-US-101
title: 结构化建模工具与智能体定义
status: Backlog
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-11
tags: [agent, tools, trigger-dev, validation]
dependsOn: []
capabilities: []
---

# 用户故事：结构化建模工具与智能体定义

## 作为/我想要/以便

**作为** 用 AI 建模的设计器用户
**我想要** AI 通过一组自带校验的建模工具来建实体、属性、关系和索引
**以便** 不再出现单向关系、错误引用和非法命名；模型出错时由工具把错误还给 AI 自己改，而不是等我在画布上发现。

## 范围边界

### In Scope

- `agent/model-designer.md`：frontmatter 声明 `name`、`model`、`tools`，正文是系统提示词；工具注册表按名称解析，清单里出现未注册的工具时启动即失败。
- 一工具一文件：查看模型、批量建实体（含属性）、改实体、删实体、增改删属性、成对建关系与删关系、增删索引、整体校验。
- 工具按名称引用对象、生成 UUID、成对创建关系、级联清理，校验失败整批拒绝并返回逐条错误。
- 前后端共享的纯函数模块 `shared/model-ops`：快照类型、操作日志、校验、应用、差异、模型概要。
- 模型可切换（默认 DeepSeek，环境变量切到 Claude），以 `locals` 注入便于离线测试。

### Out of Scope

- 浏览器端写入 AI 分支与界面（MODEL-US-102）、回读（MODEL-US-103）、向用户提问（MODEL-US-104）。
- 嵌套属性（keyValue 的子属性）、显式表名与列名、关系的 `onUpdate`；AI 产出保持与迁移前相同的扁平属性范围。

## 验收标准

| #   | 前置条件                              | 操作                                       | 预期结果                                                                                            | 状态 |
| --- | ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---- |
| 1   | 定义文件列出全部工具                  | 加载智能体定义                             | 得到名称、默认模型、工具集与系统提示词；清单里有未注册的工具名时抛错                                | ⬜   |
| 2   | 草稿中没有 `Order`                    | 调用建实体工具，提交 `Order` 及其属性      | 新实体与属性带工具生成的 UUID，输出里的 ops 与草稿一致                                              | ⬜   |
| 3   | 一批实体里有非法命名、保留字或重名    | 调用建实体工具                             | 整批拒绝，逐条返回错误位置与原因，草稿不变                                                          | ⬜   |
| 4   | `Customer` 与 `Order` 已存在          | 以 `ONE_TO_MANY` 连接两者                  | 两端关系同时创建，种类互逆，`mappedPropertyId` 互相指向；目标不存在或关系名冲突时报错               | ⬜   |
| 5   | 实体被别的实体关联、属性被索引引用    | 删除该实体或属性                           | 指向它的两端关系与引用它的索引一并清理，ops 完整列出清理项                                          | ⬜   |
| 6   | 草稿里有无属性实体或未配对关系        | 调用整体校验工具                           | 逐条报告问题；合法模型返回无问题                                                                    | ⬜   |
| 7   | 离线测试工具驱动一轮多步工具调用      | 模拟模型依次调用建实体、连接、校验并收尾   | 本轮流出每个工具的输出与最终文本，轮次正常结束                                                      | ⬜   |
| 8   | 会话续跑（新 run，无内存状态）        | 带新快照发送下一条消息                     | 草稿按本轮快照重建，工具按快照里的名称工作                                                          | ⬜   |
| 9   | `AGENT_MODEL` 未设置或设为 `anthropic:<id>` | 解析模型                            | 默认走 DeepSeek，可切到 Claude；未知供应商或缺少密钥时明确报错                                      | ⬜   |
| 10  | 共享模块与智能体代码                  | 运行 Node 侧测试与类型检查                 | 测试通过，覆盖率 ≥ 80%，类型检查无错                                                                | ⬜   |
| 11  | 自建实例已部署，真实 DeepSeek         | 提交一段电商订单需求                       | 生成的关系全部成对，整体校验无问题（真实环境）                                                      | ⬜   |

验收证据入口：[验收台账](../../verification-report.md)。

## 技术笔记

工具的输入只用名称（实体名在设计内唯一，属性名、关系名在实体内唯一），输出同时给两类读者：`ops` 给浏览器写库，`summary` 经 `toModelOutput` 给模型看，模型看不到 UUID。草稿放在 `chat.local`，每轮 `onTurnStart` 用本轮快照重置，自建实例上 run 退出后无需恢复（D-06）。

## 实现文件

- `apps/aiao-model-design/shared/model-ops/` — 快照类型、操作日志、校验、应用、差异与概要。
- `apps/aiao-model-design/agent/model-designer.md` — 智能体定义。
- `apps/aiao-model-design/agent/definition.ts` — 定义解析与工具解析。
- `apps/aiao-model-design/agent/tools/` — 一工具一文件与注册表。
- `apps/aiao-model-design/agent/models.ts` — 模型解析与注入。
- `apps/aiao-model-design/agent/chat.ts` — `chat.agent` 装配。

## References

- [D-04](../../decisions.md#d-04结构约束放在工具里)、[D-05](../../decisions.md#d-05模型可切换默认-deepseek)
- [rendi 与 Trigger.dev 调研](../../plans/agent-harness-research.md)
