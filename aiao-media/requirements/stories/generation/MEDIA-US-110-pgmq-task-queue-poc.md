---
id: MEDIA-US-110
title: PGMQ 生成任务队列 PoC
status: In Progress
priority: Medium
epic: MEDIA-EPIC-002
created: 2026-11-15
updated: 2026-11-15
dependsOn: [MEDIA-US-108, MEDIA-US-109]
tags: [pgmq, queue, generation, idempotency, supabase]
---

# 用户故事：PGMQ 生成任务队列 PoC

## 作为/我想要/以便

**作为** 平台任务运营者

**我想要** 用 Supabase PGMQ 验证生成任务的入队、消费、重试和故障恢复

**以便** 判断 PGMQ 是否能在不破坏积分、结果领取和刷新续接的前提下替代或补充当前 Durable Object

## 范围边界

### In Scope

- 用 `taskId`、`taskRevision` 和 `kind` 构造最小 PGMQ 消息，不在消息中放密钥、session、完整提示词、原图或生成结果。
- `create_generation_task` 在一个数据库事务中写任务、预留积分并发送消息。
- Node consumer 读取消息、读取任务正文、调用 provider、写私有 Storage/结果表并更新任务状态。
- 验证 visibility timeout、租约续期、失败重试、死信/归档、消费者重启和滚动发布。
- 使用 task CAS、结果唯一约束、积分状态和 provider 幂等键处理重复投递。
- 对比 PGMQ 与当前 Durable Object 的刷新续接、结果取回、串行化和运维成本。
- PoC 失败时可以继续使用 Durable Object，不删除当前实现。

### Out of Scope

- 在 PoC 通过前切换生产任务链路。
- 把 PGMQ 当成任务状态表、结果 Storage 或积分账本。
- 把 180 秒 provider 调用默认放到未经压测的 Edge Function。
- 浏览器直接读写 PGMQ 或获得 provider/service role 凭据。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 账号、积分和任务表已准备 | 调用 `create_generation_task` | 任务记录、积分预留和 PGMQ 消息在同一事务中完成；任一失败全部回滚 | ⬜ |
| 2 | 消费者读取任务后被强制终止 | 在处理过程中停止消费者 | 消息重新可见；任务状态和积分不会被重复扣减 | ⬜ |
| 3 | provider 已成功，消费者在删除消息前崩溃 | 重新消费同一消息 | 结果通过唯一约束或幂等键恢复；不会重复生成或重复结算 | ⬜ |
| 4 | provider 超时、返回可重试错误或永久错误 | 运行重试策略 | visibility timeout、最大重试次数和归档/死信状态符合配置；用户可看到最终失败原因 | ⬜ |
| 5 | 任务执行时间接近 180 秒 | 在目标 Edge Function 和 Node consumer 分别压测 | 记录 wall-clock、超时、租约续期和看门狗边界；未通过的运行时不承载生产长任务 | ⬜ |
| 6 | 多个消费者并发运行 | 发送多条任务并重复读取同一 task | 不同任务可以并发；同一 task 的状态更新由 CAS/租约串行化 | ⬜ |
| 7 | provider 结果已写入私有 Storage | 用户刷新、重新打开、确认领取和过期清理 | 结果取回、确认、删除和过期行为与当前 Durable Object 契约一致 | ⬜ |
| 8 | 消费者滚动发布、断电或重启 | 运行积压任务 | 消息不丢失；积压、失败、重试、处理时长和死信可观测 | ⬜ |
| 9 | 国内自建和海外托管环境分别部署 | 重复执行核心故障场景 | 两侧队列、消费者、Storage、积分和任务状态结果一致 | ⬜ |
| 10 | PoC 测试全部完成 | 与 Durable Object 方案评审 | 输出切换/不切换结论；未通过时保留 Durable Object 回退路径 | ⬜ |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 交付阶段

| 阶段 | 范围 | 关闭条件 |
| --- | --- | --- |
| A | PGMQ schema、事务入队和 Node consumer 骨架 | AC1、AC6 通过 |
| B | 重复投递、provider 失败和长任务压测 | AC2–5 通过 |
| C | 结果生命周期、双区域和方案决策 | AC7–10 通过 |

## 技术笔记

当前生成任务由 [relay-task-api.ts](../../../apps/api/src/relay-task-api.ts)、[relay-task.ts](../../../apps/api/src/relay-task.ts) 和 Durable Object SQLite + alarm + R2 负责。PGMQ 只替代消息调度部分，不能删除任务状态、结果存储、积分结算、幂等和刷新续接协议。

PoC 优先使用 Node consumer。Edge Function 只有在目标套餐和实际 provider 延迟通过压测后才可承载对应任务。消息正文保持最小化，敏感配置由消费者运行时读取。

## 实现文件

- `aiao-media/apps/api/src/relay-task-api.ts` — 当前任务入口。
- `aiao-media/apps/api/src/relay-task.ts` — 当前 Durable Object 任务状态和结果协议。
- `aiao-media/infra/supabase/migrations/` — PGMQ、任务状态和事务入队目标迁移。
- `aiao-media/apps/api/src/pgmq-consumer.ts` — 目标 Node consumer。
- `aiao-media/apps/api/scripts/pgmq-poc-drill.mjs` — 重启、ack 中断、归档和结果清理演练。
- `aiao-media/requirements/plans/pgmq-durable-object-comparison-20261115.md` — PGMQ 与 Durable Object 对比和回退门槛。

## References

- [架构评审](../../plans/supabase-first-architecture-review-20261115.md#5-队列使用-supabase-pgmq)
- [MEDIA-US-108 平台积分生图与额度](MEDIA-US-108-platform-generation.md)
- [MEDIA-US-109 平台生图服务端任务与刷新续接](MEDIA-US-109-relay-durable-task.md)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase PGMQ](https://supabase.com/docs/guides/queues/pgmq)
- [需求约定](../../CONVENTIONS.md)
