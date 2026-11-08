---
id: RV-01a1bbbdb6a07c31a83e2ee1d21f64bf
title: '多实例网关直接发送合法实体代理负载，外部更新通知抛 DataCloneError'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
anchors:
  - 'packages/rxdb/src/gateway/RxDBTabsGateway.ts#broadcastEntityEvent'
  - 'packages/rxdb/src/entity/entity-manager.ts#notifyExternalUpdate'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bbbdb6a07c31a83e2ee1d21f64bf：多实例网关直接发送合法实体代理负载，外部更新通知抛 DataCloneError

## 问题与影响

开启默认的多实例网关后，把已挂载实体作为 notifyExternalUpdate 的完整 patch 传入，会同步抛 DataCloneError，跨连接通知未送达。该参数类型为 Readonly<Partial<InstanceType<T>>>，完整实体实例是合法输入；实例由核心构造为 Proxy，原样送给 BroadcastChannel 不能结构化克隆。普通字面量 patch 正常。需要完整实体代理负载，按 P2 边界条件记录，不泛化为所有通知或所有多实例写入失败。

## 证据与根因

冻结快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/src/entity/entity-manager.ts:634` 附近的 notifyExternalUpdate 直接把传入 patch 放进 EntityLocalUpdatedEvent。`packages/rxdb/src/gateway/RxDBTabsGateway.ts:250` 附近的出站广播将完整原 event 交给 topic.emit；`packages/utils/src/@browser/broadcast-channel-pool.ts:76` 附近最终直接 channel.postMessage(message)，途中没有把实体代理快照化。接收端的 cloneGatewayEvent 发生在消息已经经过结构化克隆之后，无法解决出站 Proxy。

有界复现使用真实 RxDB、实体装饰器与 Node 原生 BroadcastChannel / Web Locks：

1. 注册一个带 title 的实体和真实 PGlite 适配器工厂，multiInstance=true；只调用 init()，不连接或打开存储。
2. new Row({title:current}) 得到核心挂载代理。
3. notifyExternalUpdate(Row,entity.id,entity) 同步抛 DataCloneError：[object Object] could not be cloned。
4. 对照以 {title:entity.title} 为 patch 调用成功。

这验证的是公开通知与实际广播序列化边界，不是模拟 channel 的行为。接口明确允许在尚未连接适配器时发通知，因此没有以未连接状态代替业务前置条件。当前 gateway 两份测试都使用同步原样传递的 topic 替身和普通对象负载，未验证真实实体 Proxy 的发送。

## 修复方向

在广播边界形成可结构化克隆的数据快照，保留 bigint、Date、binary view 与表集标签的现有语义；同步核对系统表与外部通知生产者。补真实挂载实体作为 patch、普通 patch、异构值和接收端副本隔离的回归，错误应在有效消息发送前被处理。

## 处理记录

### EV-01a1bbbdb6ca7fa981b9d705d7fe017c：发现

- 时间：2026-11-08T15:18:55.064Z
- 操作：review/full（parallel-001/core）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：公开API接受的完整实体在真实广播边界不可发送，普通对象对照成功。
- 验证：`node <git-common-dir>/ai-review/v1/runs/full-main-20261108/parallel-001/core/repro-gateway-entity-patch.mjs`，退出 0，entityError.name=DataCloneError、plainError=null；未连接存储、未改业务或原测试。
- 剩余事项：补正式回归并按 fix/verify 处理；PGlite正常系统表生产链另由storage组核对，不将未运行的链路计为已证实。
