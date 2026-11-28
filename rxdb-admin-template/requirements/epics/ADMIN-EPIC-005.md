---
id: ADMIN-EPIC-005
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# Supabase 接入标准化

## 愿景

Admin 连 Supabase 只用一套标准逻辑：会话、身份、按身份分库与授权快照都来自平台（`rxdb-adapter-supabase` 与 RxDB 核心），三端实体页按同一份授权显隐；协作包只保留仅经 PR 的产品协议。平台缺的能力在根 requirements 补齐，Admin 是它们的第一个三端业务验收。

## 为什么单列一个 Epic

方向见 [D-11](../decisions.md#d-11supabase-接入走平台标准层)。它横跨认证与团队工作区（[ADMIN-EPIC-002](ADMIN-EPIC-002.md)）和协作后端（[ADMIN-EPIC-004](ADMIN-EPIC-004.md)），不新增协作产品能力，改的是连接层的实现归属：今天 Admin 的会话层、团队库命名与权限显隐都是协作包自写的，本机工作台库还没有按账号隔离（D-10 第 4 条）。

## 目标

- [ ] 本机工作台库与团队库按身份命名并绑定，换账号就换库（ADMIN-US-222）。
- [ ] 全局会话改用平台会话层，D-10 与协作契约 C01 的行为不变（ADMIN-US-223）。
- [ ] 团队库接入标准适配器：身份核对与成员授权快照，团队任务编辑按权限显隐（ADMIN-US-224）。

## 故事

本清单只列范围，状态见 [status-overview](../status-overview.md)。

- [ADMIN-US-222 本机库按账号隔离：工作台库与团队库按身份命名并绑定](../stories/collaboration/ADMIN-US-222-identity-bound-local-databases.md) (High)
- [ADMIN-US-223 全局会话改用平台 Supabase 会话层](../stories/collaboration/ADMIN-US-223-platform-supabase-session.md) (Medium)
- [ADMIN-US-224 团队库接入标准 Supabase 适配器：身份核对、成员授权快照与按权限显隐](../stories/collaboration/ADMIN-US-224-team-database-standard-grants.md) (Medium)

实施顺序、平台前置与对照见 [Supabase 接入标准化计划](../plans/supabase-standardization-tasks.md)。

## 后续候选

协作服务端迁到平台的仅经 PR 能力：根 [epic-017](../../../requirements/epics/epic-017-pr-only-team-data.md) 的 US-321（提交图远端交换）、US-322（仅经 PR 写入）、US-239（成员、邀请与协作实时）。三条都价值待证，平台交付后另立 Admin 故事；迁移之前协作包保持现状（D-11 第 3 条）。

## 非目标

- 不改共享数据的写入规则：团队数据仍仅经 PR 合并（D-06、C06），不开日志同步、不开直写。
- 不新增登录方式；OAuth / SSO 仍是[后续候选](../future-requirements.md#后续候选)。
- 不把协作包的领域引擎、命令入口、读取投影或实时频道搬进平台，那是 epic-017 的范围。
