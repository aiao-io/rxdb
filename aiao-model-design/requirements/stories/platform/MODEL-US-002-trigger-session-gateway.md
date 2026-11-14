---
id: MODEL-US-002
title: Trigger.dev 会话签发与自建部署
status: In Progress
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-12
tags: [worker, trigger-dev, deploy, auth]
dependsOn: []
capabilities: []
---

# 用户故事：Trigger.dev 会话签发与自建部署

## 作为/我想要/以便

**作为** 模型设计器的维护者
**我想要** Worker 只负责静态资源、登录和会话令牌签发，智能体部署到自建 Trigger.dev
**以便** 建模不再受 Worker 120 秒请求超时限制，浏览器直接连持久会话，平台密钥与模型密钥都不出服务端。

## 范围边界

### In Scope

- Worker 新增 `GET /api/agent/config`（是否可用、实例地址、任务 ID）与 `POST /api/agent/session`（为本人的 `chatId` 创建或刷新会话令牌）。
- 会话归属校验：`chatId` 必须以 `md-<用户 ID>-` 开头；沿用同源写入检查与 Supabase 会话刷新。
- 删除 `/api/ai/model/generate`、`/api/ai/model/chat`、服务端提示词与模型调用代码，Worker 不再持有模型密钥。
- `trigger.config.ts`、智能体的 Nx 开发与部署目标，以及自建实例的部署说明（实例地址、项目 ref、密钥、`trigger login --profile`）。

### Out of Scope

- 自建实例本身的搭建与运维（webapp、worker、对象存储、镜像仓库），按 Trigger.dev 官方 Docker 文档执行。
- 让实例只对内网开放、由 Worker 代理会话流（见 [future-requirements](../../future-requirements.md)）。

## 验收标准

| #   | 前置条件                                      | 操作                                               | 预期结果                                                                                                       | 状态 |
| --- | --------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Worker 未配置 `TRIGGER_SECRET_KEY` 或实例地址 | 请求 `GET /api/agent/config`                       | 返回 `{ enabled: false }`，不暴露任何密钥                                                                      | ✅   |
| 2   | 已配置                                        | 请求 `GET /api/agent/config`                       | 返回实例地址与任务 ID `model-designer`                                                                         | ✅   |
| 3   | 未登录                                        | `POST /api/agent/session`                          | 401，不调用 Trigger.dev                                                                                        | ✅   |
| 4   | 已登录，`chatId` 属于本人                     | `POST /api/agent/session`                          | Worker 以密钥调用实例的 `POST /api/v1/sessions`（externalId 为 `chatId`、`trigger: preload`），只返回会话令牌  | ✅   |
| 5   | 已登录，`chatId` 前缀不是本人用户 ID          | `POST /api/agent/session`                          | 403，不调用 Trigger.dev                                                                                        | ✅   |
| 6   | 实例不可达或返回错误                          | `POST /api/agent/session`                          | 502，错误信息不含密钥                                                                                          | ✅   |
| 7   | 跨站页面                                      | 向 `/api/agent/session` 发写请求                   | 403，沿用同源检查                                                                                              | ✅   |
| 8   | 旧客户端                                      | 请求 `/api/ai/model/generate` 或 `/chat`           | 404，Worker 环境不再声明模型密钥                                                                               | ✅   |
| 9   | 本地                                          | 运行 Worker 的类型检查、测试（覆盖率 ≥ 80%）与打包 | 全部通过                                                                                                       | ✅   |
| 10  | 自建实例已部署智能体                          | 真实浏览器登录后发送第一条消息                     | 会话创建成功，回复从实例的会话流到达（真实环境）                                                               | ⚠️   |
| 11  | 自建实例                                      | 按 README 部署智能体                               | 部署成功；部署镜像里的索引与运行进程能加载 `trigger.config.ts`（项目 ref 由 CLI 覆盖占位值，配置不读环境变量） | ✅   |

验收证据入口：`apps/api/src/agent-session.spec.ts`、`apps/api/src/edge/router.spec.ts`（模拟 fetch）、`apps/api/scripts/test-worker.mjs`（wrangler 本地运行时 + 出站代理 + Chromium）、`aiao-model-design-api:build`。#10 在本机自建实例上用真实浏览器验收了会话签发与从实例会话流到达的回复，登录走的是验收 Worker 的模拟 Supabase 身份；真实 Supabase 账号登录这一点待复核，所以保持 ⚠️。#11 由实例上的真实部署验收。汇总见[验收台账](../../verification-report.md)。

## 技术笔记

请求体与 SDK 的 `chat.createStartSessionAction` 一致：`{ type: "chat.agent", externalId, taskIdentifier, triggerConfig: { basePayload: { chatId, trigger: "preload", messages: [] }, tags: ["chat:<chatId>"] } }`，响应体的 `publicAccessToken` 是会话级令牌（读写仅限该会话）。同一 `(taskIdentifier, externalId)` 重复调用是幂等的，返回新的令牌，所以刷新令牌与创建会话走同一个接口。浏览器的 `clientData` 不转发给会话行：每轮的快照走消息元数据（D-03），避免会话行里留着过期快照。

## 实现文件

- `aiao-model-design/apps/api/src/agent-session.ts` — 会话配置与签发。
- `aiao-model-design/apps/api/src/edge/router.ts` — 路由与鉴权。
- `aiao-model-design/apps/agent/trigger.config.ts` — Trigger.dev 项目配置。
- `aiao-model-design/apps/agent/project.json`、`aiao-model-design/apps/api/project.json` — 智能体与 Worker 的开发、部署与测试目标。
- `aiao-model-design/README.md` — 自建实例部署说明。
- `aiao-model-design/apps/api/.dev.vars.example` / `.env.agent.example` — Worker 与智能体的环境变量示例。
- `aiao-model-design/apps/api/scripts/test-worker.mjs` — 真实 Worker 运行时的网络测试。

## References

- [D-02](../../decisions.md#d-02智能体运行在自建-triggerdevworker-只签发会话)、[D-06](../../decisions.md#d-06自建实例的运行约束)
- [Trigger.dev 自建 Docker 部署](https://trigger.dev/docs/self-hosting/docker)
