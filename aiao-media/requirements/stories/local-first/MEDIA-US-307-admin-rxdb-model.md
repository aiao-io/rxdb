---
id: MEDIA-US-307
title: rxdb-model 驱动后台配置编辑
status: Backlog
priority: High
epic: MEDIA-EPIC-004
created: 2026-11-15
updated: 2026-11-15
dependsOn: [MEDIA-US-208, MEDIA-US-306]
tags: [rxdb, rxdb-model, admin, angular, forms]
---

# 用户故事：rxdb-model 驱动后台配置编辑

## 作为/我想要/以便

**作为** 平台管理员

**我想要** 使用 `rxdb-model` 的列表、详情、表单和表格组件查看与编辑后台配置

**以便** 配置页面共享 RxDB 实体模型，支持离线编辑、校验、撤销和同步，不再维护一套手写远端状态机

## 范围边界

### In Scope

- 为模板、Provider Policy、平台模型和工作区配置定义共享领域实体、schema、关系和字段元数据。
- Admin 使用 `@aiao/rxdb-model-angular` 的 Entity List、Entity Detail、Entity Form、Entity Table 和 Query Builder。
- 页面读取和编辑本地 RxDB，保存后进入同步和 working-tree 捕获流程。
- 表单支持字段类型、必填、格式、权限、revision/CAS 和服务端错误显示。
- 列表、详情和编辑页面显示同步状态、冲突状态、未提交变更和最近一次提交。
- 复用 `@aiao/rxdb-model` 的跨框架领域接口；Angular 是本产品当前实现端，React/Vue 对称性由公共包继续保证。

### Out of Scope

- Auth 用户列表、封禁和 Auth Admin API 页面；这些操作由 MEDIA-US-208 的 Edge Function 专用动作负责。
- 完整 branch/commit projection 应用协议；该范围由 MEDIA-US-308 负责。
- 通过组件绕过 RLS 或使用 service role。
- 一次性把所有历史 Admin 页面重写；先覆盖配置领域。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 领域实体 schema 和 repository 已注册 | 打开配置列表、详情和编辑页 | 页面通过 RxDB repository 读取；不再以 Worker API 响应作为唯一状态源 | ⬜ |
| 2 | 管理员打开模板或策略编辑页 | 修改字段并保存 | 本地实体立即更新，校验错误可见，变更进入 working-tree | ⬜ |
| 3 | 浏览器暂时断网 | 查看和编辑已同步配置 | 已有数据可查看；允许的本地编辑不会丢失，恢复网络后进入同步队列 | ⬜ |
| 4 | 配置字段为空、格式错误或超过限制 | 提交表单 | `rxdb-model` 和实体 schema 提供明确错误；无效值不进入已提交状态 | ⬜ |
| 5 | 另一个客户端先修改同一配置 | 当前管理员提交旧 revision | 保存被 CAS/冲突策略拒绝或进入冲突态；页面显示可恢复信息，不静默覆盖 | ⬜ |
| 6 | 当前账号无管理员权限或已撤权 | 打开或保存管理配置 | Supabase RLS/RPC 拒绝；页面不展示可操作的特权控件 | ⬜ |
| 7 | Admin 刷新或重新打开页面 | 恢复列表、筛选、详情和未提交状态 | 本地 RxDB 状态可恢复；不会因为页面刷新丢失已保存的本地变更 | ⬜ |
| 8 | 配置变更已经提交并同步 | 查看详情和变更状态 | 页面能显示 branch、commit、同步状态和最近一次应用结果 | ⬜ |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 交付阶段

| 阶段 | 范围 | 关闭条件 |
| --- | --- | --- |
| A | 共享领域实体和 repository | AC1、AC4 通过 |
| B | Angular Admin 配置页面 | AC2、AC3、AC6、AC7 通过 |
| C | 同步和提交状态显示 | AC5、AC8 通过，并与 MEDIA-US-308 联调 |

## 技术笔记

相关公共包为 [@aiao/rxdb-model](../../../../packages/rxdb-model/README.md) 和 [@aiao/rxdb-model-angular](../../../../packages/rxdb-model-angular/README.md)。当前 Admin 主要由 [admin-console.ts](../../../apps/admin/src/app/admin-console.ts) 手写 signals、模板和远端请求状态；迁移时先把模板、策略和平台模型抽成 RxDB entity，再接入 Entity List/Detail/Form。

`rxdb-model` 只负责模型驱动的显示、编辑和交互，不改变 Supabase RLS、RPC 或 Edge Function 的权限边界。

## 实现文件

- `packages/rxdb-model/` — 跨框架实体模型和字段能力。
- `packages/rxdb-model-angular/` — Angular 组件绑定。
- `aiao-media/apps/admin/src/app/admin-console.ts` — 当前 Admin 配置入口，迁移目标。
- `aiao-media/packages/domain/` — Aiao Media 共享领域实体目标目录。

## References

- [架构评审](../../plans/supabase-first-architecture-review-20261115.md#71-使用-rxdb-model-做后台显示和编辑)
- [MEDIA-US-208 Supabase 后台直连与特权 Edge Function 边界](../account/MEDIA-US-208-supabase-admin-boundary.md)
- [MEDIA-US-306 后台服务 RxDB 双向同步](MEDIA-US-306-backend-rxdb-sync.md)
- [需求约定](../../CONVENTIONS.md)
