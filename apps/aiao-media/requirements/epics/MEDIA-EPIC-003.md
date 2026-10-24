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

MEDIA-US-201 阶段 A 的注册、确认、登录、恢复、退出及错误恢复已用真实本地 Auth 与浏览器验证；阶段 B 的工作区绑定、首次同步确认和产品 RLS 待实施。MEDIA-US-202 的本机保存/回读与删除恢复已验，正式供应商仍待验。MEDIA-US-203 已明确后台对象与实施阶段，尚无产品后台实现；见[后台计划](../plans/business-admin.md)。
