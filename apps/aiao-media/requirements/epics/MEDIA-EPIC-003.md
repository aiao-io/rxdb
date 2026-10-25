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

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-201 Supabase 账号与资源授权](../stories/account/MEDIA-US-201-sessions.md) (High)
- [MEDIA-US-202 本地图片作品与任务历史](../stories/account/MEDIA-US-202-library.md) (High)
- [MEDIA-US-203 跨用户业务后台管理](../stories/account/MEDIA-US-203-business-admin.md) (High)

## 非目标

- 把本机工作区或 Supabase SDK 配置误算成已经完成的账号同步与远程资源授权。
- 把当前设备的本地保存宣传成云备份或跨设备图片同步。

## 进展

MEDIA-US-201 的真实本地 Auth、绑定/确认、产品 RLS 与在途隔离已验；202 的正式 origin 真实代理三画幅保存/刷新回读/精确下载已验，AC7 为 ✅，本机删除/中断恢复保留各自证据。203 的用户、模板、策略、任务和用量已通过真实本地 API/浏览器验收；本轮 Supabase 仅本地，生产账号/后台保持未部署、属于后续范围。故事/YAML 与目标勾选保持原状态；证据见[正式交付验收](../plans/public-delivery-verification.md)，实施见[后台计划](../plans/business-admin.md)。
