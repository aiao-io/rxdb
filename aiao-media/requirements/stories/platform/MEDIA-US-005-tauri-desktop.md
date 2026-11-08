---
id: MEDIA-US-005
product: aiao-media
title: Tauri 本地安装版
status: In Progress
priority: High
epic: MEDIA-EPIC-001
created: 2026-10-30
updated: 2026-10-30
dependsOn: [MEDIA-US-301]
tags: [product-completion]
---

# 用户故事：Tauri 本地安装版

## 作为/我想要/以便

**作为** 图片创作者或产品运营者  
**我想要** 使用Tauri 本地安装版  
**以便** 在本地优先的边界下完成创作、数据管理和运营

## 范围边界

### In Scope

- [未来功能需求](../../future-requirements.md) 中此方向的首阶段实现与验收。
- [产品交付计划](../../plans/product-completion-20261030.md) 中明确的技术、运行和发行边界。

### Out of Scope

- 未承诺的其他操作系统、自动更新、图片文件跨设备同步和任意历史版本迁移。
- 通过模拟结果替代正式供应商、支付、签名公证或真实设备证据。

## 验收标准

| #   | 前置条件                 | 操作                                      | 预期结果                                     | 状态 |
| --- | ------------------------ | ----------------------------------------- | -------------------------------------------- | ---- |
| 1   | 干净 macOS Apple Silicon | 构建安装包并启动应用                      | 本机界面可用，远程页面无原生权限             | ⚠️   |
| 2   | 已有原生工作区           | 重开、清理 WebView 缓存或遇到更高版本标记 | 恢复原工作区；未知标记拒绝访问，禁止降级     | ✅   |
| 3   | 原图或备份已就绪         | 保存文件、取消或写入失败                  | 对话框确认目标，临时文件提交；失败保留原文件 | ⚠️   |
| 4   | 已有 Web 备份            | 桌面导入及重开                            | 原库保留，原图精确回读；不隐式共用浏览器数据 | ⚠️   |
| 5   | 旧版安装和数据存在       | 签名发行、手动升级及卸载重装              | 签名、公证与兼容升级可复验，卸载数据策略明确 | ⚠️   |

## 技术笔记

运行边界、预算与保留规则以[产品交付计划](../../plans/product-completion-20261030.md)为准。尚未验收的正式环境不计为已交付。

## 实现文件

- [main.rs](../../../src-tauri/src/main.rs)
- [files.rs](../../../src-tauri/src/files.rs)
- [local-backend.ts](../../../src/platform/tauri/local-backend.ts)

## References

- [实施和证据](../../plans/product-completion-20261030.md)
