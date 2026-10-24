---
id: MEDIA-EPIC-002
status: In Progress
startDate: 2026-09-26
targetDate: TBD
owner: TBD
---

# 图片生成

## 愿景

让用户用自己配置的图片供应商（浏览器直连或主动选择代理）在本地生成单张 PNG，结果保存到本机 RxDB/OPFS，无需本站后端。

## 目标

- [ ] 图片供应商配置与直连/代理适配器（[MEDIA-US-105](../stories/generation/MEDIA-US-105-provider-management.md)）
- [ ] 图片生成与本机交付：提示词 → 单张 PNG → 本地保存与下载（[MEDIA-US-102](../stories/generation/MEDIA-US-102-image-generation.md)）
- [ ] 图片提示词灵感库与一键套用（[MEDIA-US-106](../stories/generation/MEDIA-US-106-prompt-gallery.md)）
- [ ] 移动设备验收（暂缓，不阻断当前桌面工作，[MEDIA-US-107](../stories/generation/MEDIA-US-107-mobile-verification.md)）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-105 图片供应商配置与适配器](../stories/generation/MEDIA-US-105-provider-management.md) (High)
- [MEDIA-US-102 图片生成与本机交付](../stories/generation/MEDIA-US-102-image-generation.md) (High)
- [MEDIA-US-106 图片提示词灵感库与一键套用](../stories/generation/MEDIA-US-106-prompt-gallery.md) (Medium)
- [MEDIA-US-107 移动设备能力验收](../stories/generation/MEDIA-US-107-mobile-verification.md) (Low，暂缓)

## 非目标

- 服务端任务队列、日额度、人工核查与供应商证据机。
- 声音与视频生成。
- 图生图/参考图（本轮仍暂停）。

## 图片设施进展

MEDIA-US-105/MEDIA-US-102 已交付本机供应商 CRUD、Key 生命周期、浏览器直连与主动代理、本地任务日志和真实 PNG 保存/回读；本机主流程的浏览器验证使用 fixture，准确数量见[验收记录](../verification-report.md)。真实供应商在正式 origin 的 CORS 与生成/保存仍待验，目标不勾选。
