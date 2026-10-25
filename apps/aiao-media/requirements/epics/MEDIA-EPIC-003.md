---
id: MEDIA-EPIC-003
status: In Progress
startDate: 2026-10-01
targetDate: TBD
owner: jimmy
---

# 账户、作品库与业务管理

## 愿景

本机创作无需账号；需要多设备共享时，再用 Supabase 账号授权同步非敏感数据，并保持本机图片文件边界。

## 目标

- [ ] 完成 Supabase Auth、工作区绑定及远程资源授权（[MEDIA-US-201](../stories/account/MEDIA-US-201-sessions.md)）
- [ ] 本地图片作品及任务历史持久化（[MEDIA-US-202](../stories/account/MEDIA-US-202-library.md)）
- [ ] 跨用户管理用户、模板、供应商策略、任务与用量（[MEDIA-US-203](../stories/account/MEDIA-US-203-business-admin.md)）
- [ ] 本地作品检索、稳定分页与真实视口按需预览（[MEDIA-US-204](../stories/account/MEDIA-US-204-library-search.md)）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-201 Supabase 账号与资源授权](../stories/account/MEDIA-US-201-sessions.md) (High)
- [MEDIA-US-202 本地图片作品与任务历史](../stories/account/MEDIA-US-202-library.md) (High)
- [MEDIA-US-203 跨用户业务后台管理](../stories/account/MEDIA-US-203-business-admin.md) (High)
- [MEDIA-US-204 本地作品检索与按需预览](../stories/account/MEDIA-US-204-library-search.md) (High)

## 非目标

- 把本机工作区或 Supabase SDK 配置误算成已经完成的账号同步与远程资源授权。
- 把当前设备的本地保存宣传成云备份或跨设备图片同步。

## 进展

MEDIA-US-201/203 的账号、绑定、授权与后台已通过真实本地验收；202 的正式代理三画幅与本机恢复保留原证据。204 的检索、24 件稳定分页、真实 IO 生命周期、ready 冷启动与全库 metadata 未知态已完成分层本地验收：原生压力为 1,005 条 metadata，全应用为 50 张图片，统一本机 E2E 31/31；全部 AC✅，待 PR 评审，未部署/未合并，已转为 In Review。具体边界见[实施清单](../plans/library-search-tasks.md)。201/202/203/204 均已完成当前范围验收，状态为 In Review，等待 PR 评审与合并。Supabase 仍仅本地，既有正式证据见[正式交付验收](../plans/public-delivery-verification.md)。
