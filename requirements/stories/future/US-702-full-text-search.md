---
id: US-702
title: 全文搜索
status: Done
priority: Medium
epic: epic-004-future-features
created: 2025-12-08
updated: 2026-05-10
tags: [search, plugin]
---

# 用户故事：全文搜索

## 作为/我想要/以便

**作为** 用户
**我想要** 在文档中进行全文搜索
**以便** 快速找到相关信息

## 验收标准

| #   | 前置条件             | 操作                  | 预期结果                                           | 状态     |
| --- | -------------------- | --------------------- | -------------------------------------------------- | -------- |
| 1   | 文本字段配置全文索引 | 初始化数据库          | 自动创建 FTS5 虚拟表 + 内容回填                    | ✅       |
| 2   | 搜索关键词           | 调用 `setQuery()`     | `results$` 流式返回按相关性排序的结果，300ms 防抖  | ✅       |
| 3   | 搜索结果             | 在三端 demo 页面展示  | `useSearch()` / `SearchController` API 对称        | ✅       |
| 4   | SQLite 适配器        | 使用 FTS5 虚拟表      | 高性能全文搜索；adapter 缺失能力时降级 unsupported | ✅       |
| 5   | 集合变更             | 触发再查询            | 反应式刷新绕过 debounce，与 RxDB 变更同步          | ✅       |
| 6   | 跨框架               | Angular / React / Vue | 三端实现 + e2e parity 通过                         | ✅       |
| 7   | PGlite 适配器        | tsvector / tsquery    | PG 原生全文搜索（由 US-703 跟进）                  | ↪ US-703 |

## 技术笔记

- 核心包：`@aiao/rxdb-plugin-search` — FTS5 安装器、查询编译器、状态机、scope resolver、adapter guard
- 三端绑定：`@aiao/rxdb-plugin-search-angular | -react | -vue` — `useSearch()` / Angular `SearchController`
- Schema mismatch 自动检测，adapter 缺 FTS5 能力时进入 `state: 'unsupported'` 安全降级
- 反应式管线：debounced query (300 ms) + `switchMap` 取消 + retry/clear/分页/scope filter
- 跨框架 parity 测试：`packages/rxdb-test/cross-framework-fixtures/search-parity.ts` 提供共享种子数据
- Performance baseline：`benchmarks/reports/rxdb-plugin-search-2026-04-22.md` 已固化进 CI gate
- Accessibility：三端 `/search` demo 通过 axe + Lighthouse a11y 100 分

## 实现文件

- `packages/rxdb-plugin-search/` — 插件核心（20 单测文件 / 131 用例）
- `packages/rxdb-plugin-search-angular/` — Angular 集成
- `packages/rxdb-plugin-search-react/` — React 集成
- `packages/rxdb-plugin-search-vue/` — Vue 集成
- `apps/dev-rxdb-{angular,react,vue}/.../search.*` — 三端 demo 页面

## 后续工作

- PGlite 适配器路径（tsvector + GIN）— [US-703](./US-703-pglite-full-text-search.md)
- 中文分词集成（jieba / ICU）— 评估中

## 参考

- spec `001-add-global-search`
- [PR #243](https://github.com/aiao-io/aiao/pull/243) — 添加全局搜索
- [Epic: 未来功能](../../epics/epic-004-future-features.md)
