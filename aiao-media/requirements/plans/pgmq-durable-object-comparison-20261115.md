# PGMQ 与 Durable Object 评估记录

日期：2026-11-15（Asia/Shanghai）

关联故事：[MEDIA-US-110 PGMQ 生成任务队列 PoC](../stories/generation/MEDIA-US-110-pgmq-task-queue-poc.md)。本记录只覆盖隔离 PoC，不授权切换生产任务链路。

## 当前结论

PGMQ 可以作为持久化调度层的候选方案，但当前证据只足以进入继续验证阶段，不能替换生产 Durable Object。生产入口继续由 `relay-task-api.ts`、`relay-task.ts` 和 Durable Object SQLite + alarm + R2 承担；PGMQ 只允许通过 `media_generation_poc` 队列和 Node consumer 演练。

原因很明确：PGMQ 能解决消息持久化、可见性超时、积压和多消费者读取，但它不提供现有任务协议里的用户刷新续接、结果取回、任务串行化、Storage 生命周期和积分结算。迁移必须把这些业务状态重新接回同一套任务与幂等边界，不能把 queue message 当成任务记录。

## 能力对比

| 能力 | PGMQ PoC | 当前 Durable Object | 评估 |
| --- | --- | --- | --- |
| 持久消息、visibility timeout、重试 | 由 Supabase PGMQ 提供 | 由 SQLite 状态和 alarm 自行实现 | PGMQ 更直接，但需要验证区域延迟和运维指标 |
| 任务正文与敏感数据隔离 | 消息只带 taskId、taskRevision、kind | 任务正文留在 DO 私有存储 | 两者都可以满足，PGMQ 不能承载正文 |
| provider 成功后 ack 前崩溃 | 依赖结果唯一键、task CAS、积分结算 guard | 现有任务协议已覆盖 | PGMQ 需要保留整套业务幂等协议 |
| 用户刷新、重新打开和结果领取 | 需要额外查询任务状态与结果 Storage | 已由 Durable Object 任务协议提供 | 当前 DO 风险更低 |
| 长任务和租约续期 | 需要 Node consumer、visibility 延长和看门狗 | alarm + SQLite 已有恢复语义 | PGMQ 尚未完成真实 180 秒压测 |
| 多消费者与积压 | 原生适合队列消费 | 需要按任务实例串行化 | PGMQ 有优势，但要防止同一 task 并发更新 |
| 双区域一致性 | 每个 Supabase 项目独立运行，需要分别演练 | 现有双区域任务链路已有验证基础 | PGMQ 尚无真实双区域数据 |
| 回退 | 队列入口可以停用，保留 DO | 当前生产路径不变 | PGMQ PoC 失败时可回退 |

## 已完成的本地证据

- `aiao-media-api:test`：15/15 Node 与 Vitest 测试通过，覆盖最小消息、禁止敏感字段、visibility timeout 参数、task revision CAS、重复消息、重试和归档。
- `aiao-media-api:pgmq-drill`：完成 provider 成功后 ack 中断、visibility timeout 后重启恢复、provider 失败归档和结果过期清理；provider 只调用一次，积分结算只发生一次。
- `aiao-media:production-bundle-test`：15/15 通过，019 migration 在 16 → 20 生产增量包中执行并保留生产入口边界。
- `aiao-media-api:script-test`：59/59 通过，现有 Durable Object 任务脚本没有被 PGMQ consumer 接管。

这些是本地模拟和契约证据，不代表真实 Supabase 队列、真实 provider 延迟或双区域容量已经验收。

## 切换门槛

只有以下条件全部通过，才允许重新发起生产迁移评审：

1. 本地 Supabase integration 验证事务入队与失败回滚；
2. 真实 Node consumer 在 180 秒 provider 延迟、visibility 续期、重启和滚动发布下不丢消息；
3. 结果唯一键、task revision CAS、积分结算和 Storage 清理通过并发与故障注入；
4. 海外与国内两个 Supabase 项目完成同一套故障场景，输出 wall-clock、积压、重试、死信和恢复时间；
5. 用户刷新、重新打开、领取、确认和过期清理与现有 Durable Object 契约逐项对齐；
6. 完成范围评审、回滚演练和生产观察窗口。

## 回退路径

PGMQ PoC 只允许配置为 disabled。停用时停止 Node consumer 和 PGMQ enqueue 调用，继续从现有 Durable Object 入口创建和处理任务；任务正文、积分账本、结果 Storage 和用户取回接口不迁移、不清理。`pgmq-poc-drill.mjs` 会检查 `local-first-worker.ts` 仍包含 Durable Object 任务入口且不导入 PGMQ consumer，作为生产边界回归检查。
