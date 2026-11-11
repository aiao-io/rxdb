# rendi 与 Trigger.dev 调研（2026-11-11）

调研对象：[mcheemaa/rendi](https://github.com/mcheemaa/rendi)（MIT，main 分支，2026-08 最后推送）与 Trigger.dev `@trigger.dev/sdk` 4.8.x 的 AI Agents 文档（`docs/ai-chat/`）。结论来自阅读源码与官方文档，标注「推断」的条目未实测。

## rendi 的 harness 形状

| 机制                 | rendi 的做法（复验入口）                                                                                       | 对本应用                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 智能体是一份 Markdown | `trigger/rendi/agent.md` 的 frontmatter 写 `name` / `model` / `tools`，正文是系统提示词；`parseAgentDefinition` 解析 | 采用：`agent/model-designer.md`                |
| 一工具一文件         | `trigger/tools/*.ts`，注册表 `toolRegistry`；`resolveTools` 遇到未注册名称直接抛错                              | 采用：`agent/tools/`                           |
| 持久会话             | `trigger/chat.ts` 用 `chat.agent`，`stopWhen: () => false` 不限步数                                            | 采用 `chat.agent`；步数设上限，防止工具死循环  |
| 回读用户操作         | `lib/rendi/harness/readback.ts`：用户对图表的操作记成带操作者的日志，下一轮注入在最新用户消息之前，前缀不变    | 采用：快照差异代替操作日志（模型数据在浏览器） |
| 后台任务唤醒         | `trigger/ingest.ts` 完成后经 `sessions.open(id).in.send` 写一条 `[dataset … ready]` 消息唤醒智能体               | 暂不需要，列入后续方向                         |
| 安全靠结构           | 下单需「两把钥匙」：审批码发到邮箱、只能在卡片里输入，与提示词无关                                             | 对应：AI 只写 AI 分支，合并由用户决定          |
| 定时心跳、邮件、截图 | `pulse-ops`、`send-email`、`screenshot-canvas`                                                                 | 与建模无关，不采用                             |

## Trigger.dev `chat.agent` 能力

- 每个会话是一个以 `chatId` 为键的 Session，承载多次 run；`.in` / `.out` 两条持久流，客户端断线后用 `lastEventId` 续读。
- 不带 `execute` 的工具会让本轮以待处理的工具调用结束，前端 `addToolOutput` 回填后由 `sendAutomaticallyWhen` 续轮：浏览器侧的提问正好落在这个模式上。
- `prepareMessages` 可在每轮把上下文插到模型消息里，不写入历史，适合回读注入。
- `@trigger.dev/sdk/ai/test` 的 `mockChatAgent` 在内存里跑真实的轮次循环、钩子与工具调用，只替换语言模型与运行时，配合 `MockLanguageModelV3` 做离线 TDD。
- 浏览器端 `TriggerChatTransport`（`@trigger.dev/sdk/chat`，不依赖 React）实现 AI SDK 的 `ChatTransport`，可直接交给 `@ai-sdk/angular` 的 `Chat`；`setClientData` 让每轮元数据带上最新快照。
- 会话创建是一次 `POST /api/v1/sessions`（密钥鉴权，按 `(taskIdentifier, externalId)` 幂等），返回会话级令牌；Worker 不需要运行 Node SDK。
- 单条流记录上限约 1 MiB，几十个实体的模型快照远低于此；更大的模型需要改为按 ID 引用。

## 自建实例的约束

来自官方 `docs/self-hosting/`：

- webapp（含 Postgres、Redis、ClickHouse、对象存储、镜像仓库、s2-lite）与 worker 分开部署，最低约 3 vCPU / 6 GB 与 4 vCPU / 8 GB。
- **不支持 checkpoint**：会话空闲时 run 不会挂起，会一直占着 worker 直到 `turnTimeout`；之后由续跑 run 从对象存储里的会话快照恢复。所以 `chat.local` 只能当轮内缓存（D-06）。
- realtime streams v2 由自带的 s2-lite 提供，`chat.agent` 可用。

## 对本应用的取舍

- 模型数据留在浏览器（local-first），智能体每轮从快照建草稿，工具输出即操作日志，浏览器幂等写入 AI 分支。
- 工具只收名称、不收 UUID：旧提示词要求模型自己生成并互相引用 UUID（迁移前的 `buildSystemGeneratePrompt` 中「UUID 生成规则」一节），这是结构错误的主要来源（推断）。
- 生成与对话合并为一个会话；删除旧的整块 JSON 生成、增量 JSON 修复与变更块解析。
