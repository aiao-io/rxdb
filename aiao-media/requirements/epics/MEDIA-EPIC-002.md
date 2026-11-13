---
id: MEDIA-EPIC-002
status: In Progress
startDate: 2026-09-26
targetDate: TBD
owner: TBD
---

# 图片生成

## 愿景

让登录用户以平台积分生成单张 PNG/JPEG（模型与凭据由平台统一托管），结果原样保存到本机 RxDB/OPFS；未登录保留本地草稿、灵感浏览与本机作品。

## 目标

- [ ] 平台积分生图与额度（[MEDIA-US-108](../stories/generation/MEDIA-US-108-platform-generation.md)）
- [ ] 平台生图服务端任务与刷新续接（[MEDIA-US-109](../stories/generation/MEDIA-US-109-relay-durable-task.md)）
- [ ] 图片生成与本机交付：提示词 → 单张 PNG/JPEG → 本地保存与下载（[MEDIA-US-102](../stories/generation/MEDIA-US-102-image-generation.md)）
- [ ] 图片提示词灵感库与一键套用（[MEDIA-US-106](../stories/generation/MEDIA-US-106-prompt-gallery.md)）

- [ ] 移动设备验收（暂缓，不阻断当前桌面工作，[MEDIA-US-107](../stories/generation/MEDIA-US-107-mobile-verification.md)）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-108 平台积分生图与额度](../stories/generation/MEDIA-US-108-platform-generation.md) (High)
- [MEDIA-US-109 平台生图服务端任务与刷新续接](../stories/generation/MEDIA-US-109-relay-durable-task.md) (High)
- [MEDIA-US-102 图片生成与本机交付](../stories/generation/MEDIA-US-102-image-generation.md) (High)
- [MEDIA-US-106 图片提示词灵感库与一键套用](../stories/generation/MEDIA-US-106-prompt-gallery.md) (Medium)
- [MEDIA-US-107 移动设备能力验收](../stories/generation/MEDIA-US-107-mobile-verification.md) (Low，暂缓)

## 非目标

- 用户自配供应商、浏览器直连与用户自有 Key（[D-19](../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商) 已移除；模型由平台统一托管）。
- 声音与视频生成。
- 图生图/参考图（本轮仍暂停）。

## 进展

按 [D-19](../decisions.md#d-19登录用户经平台积分生图移除用户自配供应商)，平台积分生图重新纳入当前范围：MEDIA-US-108/206 需求已重新设计、实现尚未开始；109 已实现本地闭环，上游 Key 改由平台凭据后进行真实账号验证与正式发布；102 收缩为本机交付、全部 AC 已验（In Review）；106 的 AC7 桌面 IME 仍未验，107 移动验收继续暂缓。逐条进展与关闭条件见[状态概览](../status-overview.md#未完成验收与关闭条件)。
