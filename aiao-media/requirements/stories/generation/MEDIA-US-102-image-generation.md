---
id: MEDIA-US-102
legacyId: aiao-media:US-102
product: aiao-media
title: 图片生成与本机交付
status: In Review
priority: High
epic: MEDIA-EPIC-002
created: 2026-09-26
updated: 2026-11-13
dependsOn: [MEDIA-US-108, MEDIA-US-109, MEDIA-US-202, MEDIA-US-301]
tags: [image, text-to-image, local-first, credits]
---

# 用户故事：图片生成与本机交付

## 作为/我想要/以便

**作为** 已登录、有可用积分的图片创作者

**我想要** 套用灵感或填写提示词，经平台服务端任务生成一张图片

**以便** 预览、保存到当前浏览器并下载

## 范围边界

### In Scope

- `/create` 复用 Tiptap 输入和本机草稿，提供正方形、横向、纵向三种画幅。提交前用 `serializePrompt()` 展开模板参数并校验；最终纯文本非空且不超过 2000 个 JavaScript `string.length` 单位，不静默截断，不发送编辑器 JSON、HTML 或字段标签。
- 生成统一经平台服务端任务：提交前校验登录与积分（[MEDIA-US-108](MEDIA-US-108-platform-generation.md)），任务提交、刷新续接与结果取回见 [MEDIA-US-109](MEDIA-US-109-relay-durable-task.md)。创作页不出现供应商、通道或 Key 配置。
- 请求前先持久化本地任务 ID、提示词/参数快照和发送状态，快照不含凭据。Web Locks 与本地任务记录防止双击、多标签页和刷新产生重复请求。
- 区分生成中、明确拒绝、结果待核查、已生成但未保存、已保存。超时、断网、5xx、无效回执或页面中断不自动重发；重开页面后仍保留不确定状态。
- 结果交付：校验 PNG/JPEG 原始字节、实际尺寸和可解码性，原图不转码，MIME 与下载后缀匹配真实格式，作品记录真实输出尺寸，不用请求尺寸冒充实际输出。
- 先显示真实结果，再按文件写入、元数据关联和回读结果标记“已保存到本机”。保存失败保留可下载结果与重试保存入口，重试不再次生成；文件和作品管理见 MEDIA-US-202。
- 全站及结果旁提供反馈入口；当前支持复制反馈内容，不把复制成功显示为反馈已提交。

### Out of Scope

- 参考图上传、图生图、局部编辑、批量/多图生成、自动故障转移。
- 积分余额、消费与额度（见 [MEDIA-US-108](MEDIA-US-108-platform-generation.md)）；服务端任务、加密与结果暂存（见 [MEDIA-US-109](MEDIA-US-109-relay-durable-task.md)）。
- 用户自配供应商与浏览器直连（按 [D-19](../../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商) 已出范围）。
- 离线调用远程模型；将模板示例图当作真实生成结果。
- 移动设备/移动系统输入法验收；当前优先桌面能力。

## 验收标准

| #   | 前置条件                       | 操作                         | 预期结果                                                       | 状态 |
| --- | ------------------------------ | ---------------------------- | -------------------------------------------------------------- | ---- |
| 1   | 草稿已就绪，平台任务为 fixture | 分别选择三种画幅生成         | 每次只发一个请求，画幅/单张参数正确，PNG/JPEG 原图可保存与下载 | ✅   |
| 2   | 未填必填参数或最终提示词超长   | 尝试提交                     | 保留输入并阻止调用；发送的有效提示词只含展开后的纯文本         | ✅   |
| 3   | 平台任务返回图片               | 保存后刷新作品页             | RxDB 元数据与 OPFS 原图可回读，实际输出信息可追溯              | ✅   |
| 4   | 请求断网或结果不确定           | 刷新页面并再次尝试           | 保留待核查状态，无自动重发                                     | ✅   |
| 5   | 两个标签页或连续点击生成       | 同时提交                     | 同一工作区只产生一次在途生成请求                               | ✅   |
| 6   | OPFS 写入失败                  | 下载结果，恢复存储后重试保存 | 不虚报已保存；下载仍可用，重试不再次调用模型                   | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

本地闭环由 `aiao-media-e2e:local-first-e2e` 验证：真实 Chrome、RxDB、WASM、IndexedDB 和 OPFS，平台任务为 fixture；它证明状态与保存行为，不证明真实平台任务与积分在正式 origin 可用。PNG/JPEG 原图交付、`.jpg` 下载后缀与兼容标记 2 的实现与证据见 [JPEG 交付验收](../../plans/jpeg-delivery-verification.md)。

按 [D-19](../../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商)，本故事收缩为本机交付；原直连/代理三画幅证据与 MiniMax 原生适配随用户自配供应商出范围（历史见[正式交付验收](../../plans/public-delivery-verification.md)与[供应商补验](../../plans/provider-acceptance-follow-up.md)），平台路径的正式环境证据在 [MEDIA-US-108](MEDIA-US-108-platform-generation.md)。

当前任务沿用 `processing`、`completed`、`failed`、`needs_review` 等契约状态，保存标记与生成状态分开。页面中断后不假设请求未发送，也不假设平台可查询或撤销原请求。

## 实现文件

- [本地创作入口](../../../apps/web/src/app/local-image-mvp.ts)及[界面](../../../apps/web/src/app/local-image-mvp.html)
- [提示词序列化与校验](../../../apps/web/src/app/prompts/prompt-state.ts)
- [本地文件与作品存储](../../../apps/web/src/local-data/browser-media.ts)
- [真实应用浏览器测试](../../../apps/web-e2e/src/local-first.spec.ts)

## References

- [MEDIA-US-106 图片提示词灵感库与一键套用](MEDIA-US-106-prompt-gallery.md)
- [MEDIA-US-108 平台积分生图与额度](MEDIA-US-108-platform-generation.md)
- [MEDIA-US-109 平台生图服务端任务与刷新续接](MEDIA-US-109-relay-durable-task.md)
- [MEDIA-US-202 本地图片作品与任务历史](../account/MEDIA-US-202-library.md)
- [MEDIA-US-301 浏览器本地草稿与图片持久化](../local-first/MEDIA-US-301-browser-persistence.md)
- [真实应用集成验证](../../plans/local-first-app-verification.md)
