---
id: MEDIA-US-303
product: aiao-media
title: 平台账号与同步管理
status: In Progress
priority: High
epic: MEDIA-EPIC-004
created: 2026-10-30
updated: 2026-11-06
dependsOn: [MEDIA-US-302]
tags: [product-completion, supabase, platform, sync]
---

# 用户故事：平台账号与同步管理

## 作为/我想要/以便

**作为** 跨设备创作的图片用户  
**我想要** 注册或登录平台账号后直接使用同步服务  
**以便** 在多台设备继续使用草稿、作品信息和已确认上传的原图，无需维护自己的 Supabase 项目

## 范围边界

### In Scope

- 按 [D-16](../../decisions.md#d-16统一使用平台-supabase) 统一连接部署方配置的 Supabase；用户只操作平台账号与同步范围，不填写项目 URL、Key、SQL 或管理授权。
- 平台登录与首次绑定、同步数据范围分别确认，元数据继续使用现有 adapter/history/sync；原图范围与文件传输由 [MEDIA-US-305](MEDIA-US-305-supabase-image-sync.md) 验收。
- 保留停止同步、导出、配额、远端当前记录逻辑删除和账号/工作区隔离；登录和选择平台服务本身不上传数据。
- [产品交付计划](../../plans/product-completion-20261030.md) 的生产、真实设备与发行边界继续适用。

### Out of Scope

- 用户自有 Supabase、管理 OAuth、项目选择和用户项目初始化。
- 未承诺的其他操作系统、自动更新和任意历史版本迁移。
- 通过模拟结果替代真实平台账号、Storage、Web/Tauri 跨设备或生产权限验收。

## 验收标准

| #   | 前置条件                        | 操作                                    | 预期结果                                                                               | 状态 |
| --- | ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| 1   | 平台配置可用或缺失              | 打开同步设置、选择平台或断开            | 仅展示平台账号入口；无 URL/Key/SQL/OAuth 配置；缺配置提示联系服务方；选择不上传数据    | ✅   |
| 2   | 平台能力正常、缺失或不兼容      | 请求协议与图片能力检查                  | 检查协议与 RLS/私有 Storage；失败阻止上传，提示联系服务方，不要求用户初始化项目        | ✅   |
| 3   | 平台账号或工作区的复制仍在途    | 停止同步、退出、切换账号或工作区        | 停止旧复制并隔离会话；迟到响应不进入新空间；本机与已确认云端数据保留，新范围重新确认   | ⚠️   |
| 4   | 平台账号中存在远端元数据        | 停止同步、导出、检查配额、删除当前记录  | 停止状态可恢复；元数据操作不触发原图或 Key 上传；逻辑删除保留本机、冲突与必要历史      | ⚠️   |
| 5   | 两个独立设备使用同一平台账号    | 注册/登录、确认同步、断网重连与冲突处理 | 草稿和作品信息往返、删除与恢复正确；其他账号不可访问；原图是否可取回按文件状态准确显示 | ⚠️   |
| 6   | 生产平台账号与 Storage 服务就绪 | 实际 Web 与 macOS Tauri 跨设备恢复      | 用户无需 Supabase 管理操作；生产授权、配额与数据管理可验；元数据不冒充原图备份         | ⚠️   |

## 技术笔记

2026-11-06 按 D-16 从自有项目/平台双目标改为统一平台。平台配置、连接状态与纯平台设置页已有单元/UI 测试；平台注册后的入口与隔离本地 Auth/数据库双设备接线已补验，Storage 字节为 fixture，不代替真实 Storage、生产 Web/Tauri 验收。详细证据见[平台统一同步验证](../../verification-report.md#2026-11-06-平台统一同步验证)。平台表、权限和 bucket 由部署方预先初始化，不再让终端用户安装。尚未验收的正式环境不计为已交付。

## 实现文件

- [sync-target.ts](../../../src/app/sync-target.ts)
- [sync-target-settings.ts](../../../src/app/account/sync-target-settings.ts)
- [supabase-auth.ts](../../../src/app/supabase-auth.ts)
- [009-sync-data-management.sql](../../../infra/supabase/migrations/009-sync-data-management.sql)

## References

- [实施和证据](../../plans/product-completion-20261030.md)
- [MEDIA-US-305 平台原图同步](MEDIA-US-305-supabase-image-sync.md)
