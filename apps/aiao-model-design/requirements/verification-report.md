# 模型设计器验收台账

结构门禁只检查文档契约；Node 侧测试、应用单测、构建与真实环境分别验收。平台故事的完成状态不作为本应用 AC 的证据。下表的结论来自 2026-11-12 在本分支执行的命令（Node 26，命令见[实施清单](plans/agent-harness-tasks.md#验证命令)）。

## 离线与本地运行时

| 故事与 AC                  | 验证层级                             | 入口                                                                                                                                                                                                                          | 当前结论                                                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| MODEL-US-001 #1～4         | 文档 / 夹具                          | `requirements-test`、`requirements-check`；Admin 同名目标                                                                                                                                                                     | 通过；Admin 原有 42 条门禁用例不变，当前目录仍通过                        |
| MODEL-US-002 #1～8         | 模拟 fetch                           | [agent-session.spec.ts](../server/agent-session.spec.ts)、[router.spec.ts](../server/edge/router.spec.ts)                                                                                                                     | 通过：配置、未登录、本人与他人的 `chatId`、实例故障、跨站写入、旧接口 404 |
| MODEL-US-002 #4、#5、#8    | 真实 Worker 运行时                   | [test-worker.mjs](../scripts/test-worker.mjs)：wrangler 本地运行时，经出站代理访问模拟的 Supabase 与 Trigger.dev，Chromium 走登录流程                                                                                         | 通过                                                                      |
| MODEL-US-002 #9            | 类型检查 / 测试 / 打包               | `typecheck-server`、`test-node`、`build-server`                                                                                                                                                                               | 通过；Worker 打包 11.48 KiB                                               |
| MODEL-US-101 #1～10        | 纯函数 / 离线智能体                  | `test-node`：[chat.spec.ts](../agent/chat.spec.ts)（`mockChatAgent` + `MockLanguageModelV4`）、工具、模型解析、共享模块测试；`typecheck-agent`                                                                                | 通过；Node 侧 12 个测试文件 128 例，语句 96.45%、分支 89.86%、行 98.34%   |
| MODEL-US-102 #1、#2、#4～7 | 假传输 + 真实 SQLite                 | [agent-conversation.service.spec.ts](../src/app/model-designer/__tests__/services/agent-conversation.service.spec.ts)、[agent-model-store.spec.ts](../src/app/model-designer/__tests__/integration/agent-model-store.spec.ts) | 通过                                                                      |
| MODEL-US-102 #3            | 假传输                               | 同上：重开时用保存的游标续流、补写漏掉的输出                                                                                                                                                                                  | 客户端通过；实例从游标重放待真实环境                                      |
| MODEL-US-102 #8、#9        | 检索 / lint / 类型检查 / 单测 / 构建 | 旧模块无残留引用；`lint --max-warnings=0`、`typecheck`、`test`、`build`                                                                                                                                                       | 通过；生产构建无警告，初始包 806.15 kB                                    |
| MODEL-US-103 #1～5         | 假传输 / 离线智能体                  | 会话服务测试（基线、改名、丢弃分支）；[readback.spec.ts](../agent/readback.spec.ts) 与智能体测试（注入位置、前缀不变）                                                                                                        | 通过                                                                      |
| MODEL-US-104 #2、#3        | 假传输                               | 会话服务测试：回填后续轮、刷新后仍可作答                                                                                                                                                                                      | 通过                                                                      |
| MODEL-US-104 #1、#4        | 离线智能体 / 映射 / 服务             | 提问让本轮以待回答的工具调用结束；问题映射；生成中拒绝重复提交                                                                                                                                                                | 数据与状态通过；选项卡片的浏览器呈现待验                                  |

## 真实环境验收

需要的前置：自建 Trigger.dev 实例地址（`TRIGGER_API_URL`）、项目 ref（`TRIGGER_PROJECT_REF`）、Worker 用的 `TRIGGER_SECRET_KEY`、实例环境变量里的 `DEEPSEEK_API_KEY`。执行步骤见[应用 README](../README.md#部署)。

| AC                  | 场景                                                   | 当前结论 |
| ------------------- | ------------------------------------------------------ | -------- |
| MODEL-US-002 #10    | 真实浏览器登录后创建会话并收到回复                     | 待执行   |
| MODEL-US-101 #11    | 真实 DeepSeek 建电商订单模型，关系成对、校验无问题     | 待执行   |
| MODEL-US-102 #3     | 生成中刷新页面，实例从保存的游标重放、ops 不重复不遗漏 | 待执行   |
| MODEL-US-102 #10    | 真实浏览器生成模型并合并 AI 分支                       | 待执行   |
| MODEL-US-104 #1、#4 | 浏览器里显示问题与选项，作答后与生成中选项禁用         | 待执行   |

## 尚未证明

- 自建实例没有 checkpoint 时的空闲占用与续跑恢复耗时（`turnTimeout` 15 分钟）。
- 迁入时前端覆盖率基线（语句 61.75%、行 63.64%）低于仓库 80% 门槛；本史诗新增与改动的代码都有测试，存量代码的覆盖率不在范围内。
