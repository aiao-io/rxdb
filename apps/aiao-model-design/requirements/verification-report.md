# 模型设计器验收台账

结构门禁只检查文档契约；Node 侧测试、应用单测、构建与真实环境分别验收。平台故事的完成状态不作为本应用 AC 的证据。下表的结论来自 2026-11-12 在本分支执行的命令（Node 26，命令见[实施清单](plans/agent-harness-tasks.md#验证命令)）。

## 离线与本地运行时

| 故事与 AC                  | 验证层级                             | 入口                                                                                                                                                                                                                          | 当前结论                                                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| MODEL-US-001 #1～4         | 文档 / 夹具                          | `requirements-test`、`requirements-check`；Admin 同名目标                                                                                                                                                                     | 通过；Admin 原有 42 条门禁用例不变，当前目录仍通过                        |
| MODEL-US-002 #1～8         | 模拟 fetch                           | [agent-session.spec.ts](../server/agent-session.spec.ts)、[router.spec.ts](../server/edge/router.spec.ts)                                                                                                                     | 通过：配置、未登录、本人与他人的 `chatId`、实例故障、跨站写入、旧接口 404 |
| MODEL-US-002 #4、#5、#8    | 真实 Worker 运行时                   | [test-worker.mjs](../scripts/test-worker.mjs)：wrangler 本地运行时，经出站代理访问模拟的 Supabase 与 Trigger.dev，Chromium 走登录流程                                                                                         | 通过                                                                      |
| MODEL-US-002 #9            | 类型检查 / 测试 / 打包               | `typecheck-server`、`test-node`、`build-server`                                                                                                                                                                               | 通过；Worker 打包 11.49 KiB                                               |
| MODEL-US-101 #1～10        | 纯函数 / 离线智能体                  | `test-node`：[chat.spec.ts](../agent/chat.spec.ts)（`mockChatAgent` + `MockLanguageModelV4`）、工具、模型解析、共享模块测试；`typecheck-agent`                                                                                | 通过；Node 侧 13 个测试文件 132 例，语句 96.45%、分支 89.86%、行 98.34%   |
| MODEL-US-101 #12           | 离线智能体                           | [client-data.spec.ts](../agent/client-data.spec.ts)；[chat.spec.ts](../agent/chat.spec.ts) 的「会话预热」：不带 clientData 启动                                                                                               | 通过                                                                      |
| MODEL-US-102 #1、#2、#4～7 | 假传输 + 真实 SQLite                 | [agent-conversation.service.spec.ts](../src/app/model-designer/__tests__/services/agent-conversation.service.spec.ts)、[agent-model-store.spec.ts](../src/app/model-designer/__tests__/integration/agent-model-store.spec.ts) | 通过                                                                      |
| MODEL-US-102 #3            | 假传输                               | 同上：重开时用保存的游标续流、补写漏掉的输出                                                                                                                                                                                  | 通过；实例侧见下方真实环境                                                |
| MODEL-US-102 #8、#9        | 检索 / lint / 类型检查 / 单测 / 构建 | 旧模块无残留引用；`lint --max-warnings=0`、`typecheck`、`test`、`build`                                                                                                                                                       | 通过；生产构建无警告，初始包 806.78 kB；Angular 侧 68 个测试文件 647 例   |
| MODEL-US-102 #11～13       | 假传输 + 真实 SQLite                 | 会话服务测试（fork 记录、刷新后恢复、缺记录时报错、各类失败显示原因、连按只发一条）；[agent-branch-repository.spec.ts](../src/app/model-designer/__tests__/integration/agent-branch-repository.spec.ts)                       | 通过                                                                      |
| MODEL-US-103 #1～5         | 假传输 / 离线智能体                  | 会话服务测试（基线、改名、丢弃分支）；[readback.spec.ts](../agent/readback.spec.ts) 与智能体测试（注入位置、前缀不变）                                                                                                        | 通过                                                                      |
| MODEL-US-104 #2、#3        | 假传输                               | 会话服务测试：回填后续轮、刷新后仍可作答                                                                                                                                                                                      | 通过                                                                      |
| MODEL-US-104 #1、#4        | 离线智能体 / 映射 / 服务             | 提问让本轮以待回答的工具调用结束；问题映射；准备期间与生成中拒绝重复提交                                                                                                                                                      | 通过；浏览器侧见下方真实环境                                              |

## 真实环境验收

2026-11-12 在本机执行。实例是按官方 Docker 文档搭的自建 Trigger.dev v4.8.3（webapp 与 worker 同机，端口只绑 127.0.0.1），智能体经 `agent-deploy` 部署为 `20261112.1`，生产环境变量配 `AGENT_MODEL=deepseek:deepseek-flash` 与 `.dev.vars` 里的 DeepSeek 中转（新版走 `/chat/completions`，可用）。浏览器是 Chromium，打开验收用的 Worker：真实 Worker 代码、真实实例与模型，只有 Supabase 由模拟服务应答一个验收账号（经出站代理，与 `test-worker` 同一做法）。

| AC                  | 场景                                                   | 当前结论                                                                                                                                                     |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MODEL-US-002 #10    | 真实浏览器登录后创建会话并收到回复                     | 会话签发 200，回复从实例的 `/realtime/v1/sessions/<chatId>/out` 到达；登录走模拟 Supabase 身份，真实账号登录待复核（⚠️）                                     |
| MODEL-US-002 #11    | 按 README 部署智能体                                   | 通过；部署出 1 个任务，run 容器能加载配置并执行                                                                                                              |
| MODEL-US-101 #11    | 真实 DeepSeek 建电商订单模型，关系成对、校验无问题     | 通过；26 s，工具 `add_entities` → `link_entities` → `add_index`×3 → `validate_model`，4 个实体、3 对关系，回放 ops 后独立检查成对与校验均无问题              |
| MODEL-US-102 #3     | 生成中刷新页面，实例从保存的游标重放、ops 不重复不遗漏 | 通过；出流中刷新（已完成 2 个工具），重开后从游标续流补完其余工具；刷新后才到达的索引出现在合并后 main 的 SQL 里；实体不重复，再刷新一次也没有残留的 AI 分支 |
| MODEL-US-102 #10    | 真实浏览器生成模型并合并 AI 分支                       | 通过；第一个写入工具完成时画布即出现实体，其余工具逐个完成；合并前后画布上的实体卡片（字段、关系）与连线逐项一致                                             |
| MODEL-US-102 #11    | AI 分支未合并就刷新                                    | 通过；刷新后恢复合并入口，后续写入接着原分支，合并后回到 main                                                                                                |
| MODEL-US-104 #1、#4 | 浏览器里显示问题与选项，作答后与生成中选项禁用         | 通过；智能体给出 3 个选项，作答前没有实体也没有 AI 分支；点选后 46 ms 内禁用，强制再点一次，实例只收到一次回答                                               |

验收过程中修掉的问题（离线测试覆盖不到，均已补测试）：

1. `trigger.config.ts` 读不到 `TRIGGER_PROJECT_REF` 就抛错，而部署镜像里的索引进程只拿到实例上配置的环境变量，部署必然失败。改为放占位值，项目 ref 交给 CLI 覆盖（MODEL-US-002 #11）。
2. SDK 在 Worker 建会话触发的预热 run 上也按 schema 解析 clientData，必填的 schema 让预热直接失败。改为整体可缺省，每一轮仍要求有快照（MODEL-US-101 #12）。
3. 数据库的检出分支会持久化，刷新后仍停在 AI 分支上，但会话服务的分支状态只在内存里：合并入口消失，续流写入还会在 AI 分支上再 fork 一层。改为 fork 时写 `AgentBranch` 记录、启动时恢复（MODEL-US-102 #11）。
4. 点下选项到真正发出请求之间不算忙，连点会重复回填。改为发送、回答、重试从调用起就算忙（MODEL-US-102 #13、MODEL-US-104 #4）。

本机搭实例时的几处绕法只因为实例跑在本机 Docker Desktop 上，部署到有公网域名的服务器时不需要：`API_ORIGIN` 设为 `http://host.docker.internal:8030`，让 run 容器与宿主机上的 CLI 用同一个地址（CLI 进程靠一个只改 DNS 解析的预加载模块）；本地构建时让 CLI 把 `host.docker.internal` 指向 127.0.0.1，并加 `--local-build --network host`；buildx 构建器经 Docker Desktop 的代理拉镜像。

## 尚未证明

- 用真实 Supabase 账号登录后走完 MODEL-US-002 #10。
- 自建实例没有 checkpoint 时的空闲占用与续跑恢复耗时（`turnTimeout` 15 分钟）。
- 迁入时前端覆盖率基线（语句 61.75%、行 63.64%）低于仓库 80% 门槛；本史诗新增与改动的代码都有测试，存量代码的覆盖率不在范围内。
