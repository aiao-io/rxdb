---
id: MODEL-US-101
title: 结构化建模工具与智能体定义
status: Done
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-12
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

- `apps/agent/src/model-designer.md`：frontmatter 声明 `name`、`model`、`tools`，正文是系统提示词；工具注册表按名称解析，清单里出现未注册的工具时启动即失败。
- 一工具一文件：查看模型、批量建实体（含属性）、改实体、删实体、增改删属性、成对建关系与删关系、增删索引、整体校验。
- 工具按名称引用对象、生成 UUID、成对创建关系、级联清理，校验失败整批拒绝并返回逐条错误。
- 前后端共享的纯函数模块 `packages/model-ops`（`@aiao-model-design/model-ops`）：快照类型、操作日志、校验、应用、差异、模型概要。
- 模型可切换（默认 DeepSeek，环境变量切到 Claude），以 `locals` 注入便于离线测试。

### Out of Scope

- 浏览器端写入 AI 分支与界面（MODEL-US-102）、回读（MODEL-US-103）、向用户提问（MODEL-US-104）。
- 嵌套属性（keyValue 的子属性）、显式表名与列名、关系的 `onUpdate`；AI 产出保持与迁移前相同的扁平属性范围。

## 验收标准

| #   | 前置条件                                       | 操作                                     | 预期结果                                                                              | 状态 |
| --- | ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| 1   | 定义文件列出全部工具                           | 加载智能体定义                           | 得到名称、默认模型、工具集与系统提示词；清单里有未注册的工具名时抛错                  | ✅   |
| 2   | 草稿中没有 `Order`                             | 调用建实体工具，提交 `Order` 及其属性    | 新实体与属性带工具生成的 UUID，输出里的 ops 与草稿一致                                | ✅   |
| 3   | 一批实体里有非法命名、保留字或重名             | 调用建实体工具                           | 整批拒绝，逐条返回错误位置与原因，草稿不变                                            | ✅   |
| 4   | `Customer` 与 `Order` 已存在                   | 以 `ONE_TO_MANY` 连接两者                | 两端关系同时创建，种类互逆，`mappedPropertyId` 互相指向；目标不存在或关系名冲突时报错 | ✅   |
| 5   | 实体被别的实体关联、属性被索引引用             | 删除该实体或属性                         | 指向它的两端关系与引用它的索引一并清理，ops 完整列出清理项                            | ✅   |
| 6   | 草稿里有无属性实体或未配对关系                 | 调用整体校验工具                         | 逐条报告问题；合法模型返回无问题                                                      | ✅   |
| 7   | 离线测试工具驱动一轮多步工具调用               | 模拟模型依次调用建实体、连接、校验并收尾 | 本轮流出每个工具的输出与最终文本，轮次正常结束                                        | ✅   |
| 8   | 会话续跑（新 run，无内存状态）                 | 带新快照发送下一条消息                   | 草稿按本轮快照重建，工具按快照里的名称工作                                            | ✅   |
| 9   | `AGENT_MODEL` 未设置或设为 `anthropic:<id>`    | 解析模型                                 | 默认走 DeepSeek，可切到 Claude；未知供应商或缺少密钥时明确报错                        | ✅   |
| 10  | 共享模块与智能体代码                           | 运行 Node 侧测试与类型检查               | 测试通过，覆盖率 ≥ 80%，类型检查无错                                                  | ✅   |
| 11  | 自建实例已部署，真实 DeepSeek                  | 提交一段电商订单需求                     | 生成的关系全部成对，整体校验无问题（真实环境）                                        | ✅   |
| 12  | Worker 创建会话触发的预热 run，不带 clientData | 预热后收到第一条消息                     | 预热正常启动；缺快照的那一轮报错，不调用模型                                          | ✅   |

验收证据入口：`apps/agent/src/definition.spec.ts`、`apps/agent/src/tools/tools.spec.ts`、`apps/agent/src/models.spec.ts`、`apps/agent/src/client-data.spec.ts`、`apps/agent/src/chat.spec.ts`（`mockChatAgent` + `MockLanguageModelV4`）、`packages/model-ops/src/*.spec.ts`。#11 在本机自建实例 + 真实 DeepSeek 上验收：收集一轮里每个工具输出的 ops，在空模型上回放后独立检查成对关系并校验；#12 是在实例上第一次跑时暴露的（SDK 预热时也按 schema 解析 clientData）。汇总见[验收台账](../../verification-report.md)。

## 技术笔记

工具的输入只用名称（实体名在设计内唯一，属性名、关系名在实体内唯一），输出同时给两类读者：`ops` 给浏览器写库，`summary` 经 `toModelOutput` 给模型看，模型看不到 UUID。`chat.agent` 的 `tools` 选项是每轮调用一次的函数：它用本轮 `clientData` 里的快照新建草稿，再把 `TOOL_FACTORIES` 绑定成本轮的工具实例，所以没有跨轮内存状态，自建实例上 run 退出后无需恢复（D-06）。工具清单在模块加载时按 `model-designer.md` 校验，单轮模型调用上限 40 步。

## 实现文件

- `aiao-model-design/packages/model-ops/src/` — 快照类型、操作日志、校验、应用、差异与概要。
- `aiao-model-design/apps/agent/src/model-designer.md` — 智能体定义。
- `aiao-model-design/apps/agent/src/definition.ts` — 定义解析与工具解析。
- `aiao-model-design/apps/agent/src/tools/` — 一工具一文件与注册表。
- `aiao-model-design/apps/agent/src/models.ts` — 模型解析与注入。
- `aiao-model-design/apps/agent/src/chat.ts` — `chat.agent` 装配。

## References

- [D-04](../../decisions.md#d-04结构约束放在工具里)、[D-05](../../decisions.md#d-05模型可切换默认-deepseek)
- [rendi 与 Trigger.dev 调研](../../plans/agent-harness-research.md)
