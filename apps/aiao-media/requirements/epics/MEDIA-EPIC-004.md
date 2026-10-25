---
id: MEDIA-EPIC-004
status: Done
startDate: 2026-10-01
targetDate: TBD
owner: TBD
---

# 本地优先与跨设备同步

## 愿景

应用数据（供应商、草稿、作品、任务）首先可靠落在本地；注册账号后通过 Supabase 在多台设备间同步，供应商配置也可同步到远程。

## 目标

- [x] 浏览器本地草稿、图片与配置可靠持久化（[MEDIA-US-301](../stories/local-first/MEDIA-US-301-browser-persistence.md)）
- [x] 账号 + Supabase 同步与冲突处理（[MEDIA-US-302](../stories/local-first/MEDIA-US-302-draft-sync.md)）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [MEDIA-US-301 浏览器本地草稿与图片持久化](../stories/local-first/MEDIA-US-301-browser-persistence.md) (High)
- [MEDIA-US-302 多端草稿同步与冲突处理](../stories/local-first/MEDIA-US-302-draft-sync.md) (Medium)

## 非目标

- 离线调用远程生成模型。
- Electron 桌面发行。

## 同步实施进展

本地工作区使用固定 UUID、RxDB + wa-sqlite/IndexedDB 与 OPFS，实体为 `SyncType.None`。可选账号会话已经验证，产品 DTO 复制已接线并通过双独立副本本地验证。本仓 Supabase adapter、同步插件与产品集成测试已通过；采用[绑定计划](../plans/account-workspace-binding.md)的账号隔离和确认流程，产品 RLS 已验；按 D-06 无限期保留冲突版本、tombstone 与变更日志，不启用 TTL/自动清理，显式重扫不丢弃本机改动。首阶段固定排除供应商 Key 和图片文件本体。301/302 的全部 AC 已通过当前范围验收，按 D-11 记为 Done，PR 评审与合并继续单独跟踪。首发图片与本地可靠性验收先于复制扩展，见[路线图](../roadmap.md)。
