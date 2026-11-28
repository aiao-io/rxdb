---
id: epic-017-pr-only-team-data
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 仅经 PR 的团队数据：Supabase 上的提交图交换、数据 PR 与团队协作

## 愿景

团队共享数据只能经「任务分支 → 提交 → 数据 PR → 绑定候选的审核 → 原子合并」改变，任何客户端（包括管理员与合并者）都不能直写。这套能力落在 `packages/*`：在 Supabase 上只靠参考 SQL、RLS、Realtime 与一个命令入口即可部署，应用给实体声明写入模式即可使用，而不是复制 Admin 的产品私有协作包。

## 为什么单列一个 Epic

- [epic-015](epic-015-identity-scoped-sync.md) 的写入模式目标「实体声明只读、直写或仅经 PR」里，仅经 PR **尚无故事认领**；同一个 epic 的非目标又排除了「改写 Admin 现有的 PR 协作链路」。把 Admin 的链路做成可复用能力是另一件事，单列。
- [epic-014](epic-014-commit-graph-remote-exchange.md) 只交付了本地一半（导入远端提交、回写式 discard / restore），非目标写明推送协议与服务端由使用方负责（Admin 见其协作包），三方字段级合并「平台需要时另立故事」。
- 今天仓库里唯一的实现在 Admin 协作包（`private: true`）：纯 TypeScript 领域引擎、`admin_private` 下的表、RLS 只读投影、Edge Function 与 Node 两个命令入口；规则在 Admin [协作契约](../../rxdb-admin-template/requirements/collaboration-contract.md) C01～C06 里逐条验收过。

## 立项

2026-11-28 owner 定方向：应用连 Supabase 要有一套标准逻辑，`rxdb-adapter-supabase` 能解决的由它解决；Admin 里有而平台没有的场景，列故事补齐、做成可复用。连接层的缺口（会话层、整库一个作用域、只接身份与授权）登记在 epic-015（[US-237](../stories/adapter/US-237-supabase-session-layer.md)、[US-039](../stories/core/US-039-instance-access-scope.md)、[US-238](../stories/adapter/US-238-supabase-adapter-identity-grants-only.md)）；本 Epic 登记日志同步 + RLS 直写给不了的那部分。

## 已定的边界

- **日志同步不替代提交图。** 日志同步按行传最终状态，不保留提交 ID、父链与原作者，也表达不了「只有合并能改共享数据」；同一份团队数据不同时走日志同步与提交交换（epic-015 非目标）。
- **服务端权威。** 共享数据、共享头与合并审计只在服务端事务里写；本地判定只是快速失败。
- **规则以 Admin 协作契约为准。** C02 保存与提交、C03 双设备分叉、C04 最终合并候选、C05 审核聚合、C06 共享数据唯一写入口是验收依据；平台化不放宽其中任何一条。
- **先有平台、后迁 Admin。** 本 Epic 的故事交付之前，Admin 协作包保持现状；迁移由 Admin 另立故事。

## 目标

- [ ] 提交图远端交换：服务端存提交与引用，按预期头比较交换上传、分页下载，与 working-tree 的导出 / 导入对接（[US-321](../stories/collaboration/US-321-supabase-commit-exchange.md)）
- [ ] 仅经 PR 写入：实体声明写入模式；数据 PR、绑定候选的检查与审核、三方字段合并、原子合并与审计（[US-322](../stories/collaboration/US-322-pr-only-write-mode.md)）
- [ ] 团队成员、邀请与协作实时：六项权限的授予与撤回、邀请绑定已验证邮箱、撤权即时生效、私有频道的业务通知与在线成员（[US-239](../stories/adapter/US-239-supabase-team-membership-realtime.md)）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-321 Supabase 上的提交图远端交换：服务端存提交与引用，按预期头上传、分页下载，跨设备保留提交身份](../stories/collaboration/US-321-supabase-commit-exchange.md) (Medium)
- [US-322 仅经 PR 写入：实体声明写入模式，共享数据只能经绑定候选的审核与原子合并改变](../stories/collaboration/US-322-pr-only-write-mode.md) (Medium) — 前置 US-321
- [US-239 Supabase 团队成员、邀请与协作实时：邀请绑定已验证邮箱、撤权即时生效、私有频道的业务通知与在线成员](../stories/adapter/US-239-supabase-team-membership-realtime.md) (Low)

## 非目标

- CRDT 与自动合并：冲突按 git 方式由用户裁决（同 epic-015）。
- 由实体配置生成 RLS；在浏览器里持有 service role 或其他绕过 RLS 的凭据。
- 多区域部署、跨组织共享、组织层级。

## 价值待证

具名使用方只有 Admin，它已有可用的产品实现；第二个使用方尚未出现。按 [CONVENTIONS「价值待证」](../CONVENTIONS.md#价值待证)，三条故事留在 Backlog 的立项池，各自的解锁信号写在故事的「解锁条件」节。解锁任何一条，都在本节补一条解锁记录。

## 待冻结的决策

1. **服务端形态**：领域引擎用 TypeScript（Admin 现状，Edge Function 与 Node 入口共用一个引擎）还是 PL/pgSQL RPC（平台现有的 Supabase 部署只有 PostgREST + RPC + RLS，没有 Edge Function）。Admin D-09 第 1 条定过「不改写为 PL/pgSQL」，平台化时重新权衡。**阻塞 US-321 与 US-322。**
2. **包划分**：客户端部分（写入模式声明、上传队列、导入）进 `rxdb-plugin-working-tree` 还是新包；服务端引擎与 SQL 放在哪个包、怎么发布。
3. **合并规则的可配置面**：审批阶段、免审批、必须处理线程是平台默认还是全部交给应用。
