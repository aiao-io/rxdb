---
id: MEDIA-US-303
product: aiao-media
title: 自有 Supabase 与平台同步目标管理
status: In Progress
priority: High
epic: MEDIA-EPIC-004
created: 2026-10-30
updated: 2026-10-30
dependsOn: [MEDIA-US-302]
tags: [product-completion]
---

# 用户故事：自有 Supabase 与平台同步目标管理

## 作为/我想要/以便

**作为** 图片创作者或产品运营者  
**我想要** 使用自有 Supabase 与平台同步目标管理  
**以便** 在本地优先的边界下完成创作、数据管理和运营

## 范围边界

### In Scope

- [未来功能需求](../../future-requirements.md) 中此方向的首阶段实现与验收。
- [产品交付计划](../../plans/product-completion-20261030.md) 中明确的技术、运行和发行边界。

### Out of Scope

- 未承诺的其他操作系统、自动更新和任意历史版本迁移。
- 官方管理 OAuth 授权与自动初始化由 [MEDIA-US-304](MEDIA-US-304-supabase-oauth-onboarding.md) 负责，图片文件跨设备同步由 [MEDIA-US-305](MEDIA-US-305-supabase-image-sync.md) 负责；本故事仍只覆盖手工连接与元数据同步目标管理。
- 通过模拟结果替代正式供应商、支付、签名公证或真实设备证据。

## 验收标准

| #   | 前置条件                   | 操作                                       | 预期结果                                                      | 状态 |
| --- | -------------------------- | ------------------------------------------ | ------------------------------------------------------------- | ---- |
| 1   | 用户提供项目地址和公开 Key | 选择自己的项目、平台或断开                 | 拒绝服务端密钥，目标选择不上传，不静默切换到别的目标          | ✅   |
| 2   | 所选项目已初始化或不兼容   | 登录并请求首次同步                         | 检查协议与 RLS，缺表、版本或权限错误不上传；初始化可审阅      | ✅   |
| 3   | 旧目标复制仍在途           | 切换项目、账号或工作区                     | 暂停旧复制并隔离会话，新目标重新登录和确认                    | ⚠️   |
| 4   | 存在远端元数据             | 停止同步、导出、检查配额、删除当前远端记录 | 原图与 Key 不上传；停止状态可恢复；逻辑删除保留本机和必要历史 | ⚠️   |
| 5   | 两个独立设备或副本         | 各目标往返、断网恢复、冲突与删除传播       | 不静默转存目标数据，未知版本拒绝，原图缺失说明准确            | ⚠️   |
| 6   | 生产平台账号服务就绪       | 实际 Web 和桌面跨设备恢复                  | 生产授权、配额与数据管理可验；元数据不冒充原图备份            | ⚠️   |

## 技术笔记

运行边界、预算与保留规则以[产品交付计划](../../plans/product-completion-20261030.md)为准。尚未验收的正式环境不计为已交付。

## 实现文件

- [sync-target.ts](../../../src/app/sync-target.ts)
- [sync-target-settings.ts](../../../src/app/account/sync-target-settings.ts)
- [009-sync-data-management.sql](../../../infra/supabase/migrations/009-sync-data-management.sql)

## References

- [实施和证据](../../plans/product-completion-20261030.md)
- [MEDIA-US-304 Supabase 授权接入与自动初始化](MEDIA-US-304-supabase-oauth-onboarding.md)
- [MEDIA-US-305 图片原文件同步到自有 Supabase](MEDIA-US-305-supabase-image-sync.md)
