---
id: MEDIA-US-206
product: aiao-media
title: 后台积分管理
status: In Progress
priority: High
epic: MEDIA-EPIC-003
created: 2026-11-13
updated: 2026-11-13
dependsOn: [MEDIA-US-201, MEDIA-US-203]
tags: [credits, admin, platform, billing]
---

# 用户故事：后台积分管理

## 作为/我想要/以便

**作为** 平台运营管理员

**我想要** 在后台查看用户积分，并增加或减少积分、查看完整流水

**以便** 发放与回收积分，支撑 [MEDIA-US-108](../generation/MEDIA-US-108-platform-generation.md) 的积分生图

## 范围边界

### In Scope

- 按平台账号/邮箱查询用户，查看积分余额与流水；流水含时间、操作人、数值、原因与来源，生成消费与后台调整可区分。
- 增加/减少积分必须填写原因；服务端原子更新余额并写流水，防并发与负余额；重复提交不重复生效。
- 权限：仅有效管理员可操作（沿用 [MEDIA-US-203](MEDIA-US-203-business-admin.md) 的管理员授权与审计）；匿名/普通用户/跨站请求被拒；流水不可事后篡改（无修改/删除接口）。
- 用户端余额与本人流水可见，与 [MEDIA-US-108](../generation/MEDIA-US-108-platform-generation.md) 的生成消费同源。
- 海外 Cloudflare 与国内自建共用同一套后台入口与账本表结构（D-18）。

### Out of Scope

- 充值、退款、价格体系与支付渠道（[MEDIA-US-205](MEDIA-US-205-platform-billing.md) 继续按 D-17 暂缓）。
- 批量导入导出、积分有效期/过期回收策略、自动发放规则。
- 把积分用作生成以外的通用货币；仅用于平台生图消费。

## 验收标准

| #   | 前置条件               | 操作                           | 预期结果                                                                       | 状态 |
| --- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ---- |
| 1   | 管理员已登录后台       | 按邮箱/账号查询并查看余额/流水 | 余额与流水可见；流水含时间、操作人、数值、原因与来源，生成消费与后台调整可区分 | ✅   |
| 2   | 用户 A 有余额          | 管理员增加/减少积分并填写原因  | 余额即时更新，用户端可见变化；流水记录完整                                     | ✅   |
| 3   | 并发调整或余额不足     | 重复提交、扣减到负余额         | 服务端原子执行；负余额被拒；重复提交不双扣                                     | ✅   |
| 4   | 匿名/普通用户/伪造角色 | 调用积分管理接口               | 仅有效管理员可操作；流水不可篡改；日志与响应无凭据                             | ✅   |
| 5   | 海外与国内自建部署就绪 | 分别发放并生成                 | 同一积分契约：账本、发放与消费两侧一致                                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 交付阶段

| 阶段 | 内容               | 关闭条件                           |
| ---- | ------------------ | ---------------------------------- |
| A    | 积分账本与后台接口 | AC1–4 通过；账本 schema 与权限已验 |
| B    | 用户端余额与流水   | 与 MEDIA-US-108 的消费流水同源可见 |
| C    | 双部署验收         | AC5 通过；海外与国内发放/消费一致  |

## 技术笔记

2026-11-13 已完成积分账本、后台发放/回收、用户余额与流水及权限校验。AC1–4 通过 PGlite、真实本地 Supabase Auth/PostgreSQL 与 UI 单测验证，包含真实并发幂等、负余额保护、RLS 和即时撤权，见[交付证据](../../plans/credits-delivery-20261113.md)。生成消费已接入 MEDIA-US-109/108 的同一账本，登录、确认扣费、释放与本人流水通过本地浏览器验收，见[平台接线记录](../../plans/platform-relay-credits-20261113.md)；AC5 需要正式海外与国内分别发放并生成，故事保持 In Progress。账本与生成消费同源；管理员授权与审计沿用 [MEDIA-US-203](MEDIA-US-203-business-admin.md)。供应商策略管理随 D-19 移除，不进入本故事范围。

## 实现文件

- [账本迁移](../../../infra/supabase/migrations/012-credits.sql) — 余额、不可变流水、预占与结算。
- [积分 API](../../../apps/api/src/credits-api.ts)、[管理入口](../../../apps/api/src/admin-api.ts)。
- [后台用户页](../../../apps/admin/src/app/admin-console.ts)、[用户积分面板](../../../apps/web/src/app/credits-panel.ts)。
- [数据库契约](../../../scripts/product/credits-contract.test.mjs)、[真实本地验收](../../../scripts/product/test-credits-local.mjs)。

## References

- [MEDIA-US-108 平台积分生图与额度](../generation/MEDIA-US-108-platform-generation.md)
- [MEDIA-US-203 跨用户业务后台管理](MEDIA-US-203-business-admin.md)
- [D-19 登录用户经平台积分生图](../../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商)
- [需求约定](../../CONVENTIONS.md)
