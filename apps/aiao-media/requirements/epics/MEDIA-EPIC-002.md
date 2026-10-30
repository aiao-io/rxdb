---
id: MEDIA-EPIC-002
status: In Progress
startDate: 2026-09-26
targetDate: TBD
owner: TBD
---

# 图片生成

## 愿景

让用户用自己配置的图片供应商（浏览器直连或主动选择代理）在本地生成单张 PNG/JPEG，结果原样保存到本机 RxDB/OPFS，无需本站后端。

## 目标

- [ ] 图片供应商配置与直连/代理适配器（[MEDIA-US-105](../stories/generation/MEDIA-US-105-provider-management.md)）
- [ ] 图片生成与本机交付：提示词 → 单张 PNG/JPEG → 本地保存与下载（[MEDIA-US-102](../stories/generation/MEDIA-US-102-image-generation.md)）
- [ ] 图片提示词灵感库与一键套用（[MEDIA-US-106](../stories/generation/MEDIA-US-106-prompt-gallery.md)）
- [ ] 移动设备验收（暂缓，不阻断当前桌面工作，[MEDIA-US-107](../stories/generation/MEDIA-US-107-mobile-verification.md)）

- [ ] 平台生图、额度与持久任务（[MEDIA-US-108](../stories/generation/MEDIA-US-108-platform-generation.md)）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-105 图片供应商配置与适配器](../stories/generation/MEDIA-US-105-provider-management.md) (High)
- [MEDIA-US-102 图片生成与本机交付](../stories/generation/MEDIA-US-102-image-generation.md) (High)
- [MEDIA-US-106 图片提示词灵感库与一键套用](../stories/generation/MEDIA-US-106-prompt-gallery.md) (Medium)
- [MEDIA-US-107 移动设备能力验收](../stories/generation/MEDIA-US-107-mobile-verification.md) (Low，暂缓)

- [MEDIA-US-108 平台生图、额度与持久任务](../stories/generation/MEDIA-US-108-platform-generation.md) (High)

## 非目标

- 通用供应商证据机与用户自有 Key 的异步托管。
- 声音与视频生成。
- 图生图/参考图（本轮仍暂停）。

## 进展

既有四条故事和新增平台故事均有未过的真实环境 AC，逐条进展与关闭条件见[状态概览](../status-overview.md#未完成验收与关闭条件)，正式环境证据见[验收记录](../verification-report.md#正式环境证据)。
