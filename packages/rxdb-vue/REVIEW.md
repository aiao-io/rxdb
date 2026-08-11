# `@aiao/rxdb-vue` 代码评审

## 结论

🟢 好。Composition API、provider 和无限滚动正确处理订阅释放与响应式 options；Angular 已补齐同名公共入口。

## 修复状态（2026-07-15）

- 三端均公开 `useInfiniteScroll(EntityType, options)` 与 `InfiniteScrollResource`。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：Vue hooks、provide/inject、无限滚动、测试和公开入口；18 个文件，约 1,775 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 三端对称性

- 查询、树、图 hooks 与 Angular/React 同名且能力对齐。
- Vue/React `useInfiniteScroll` API 一致；Angular 未导出该入口，见 `rxdb-angular` 报告。

## 问题

本包未发现独有 P0–P2 问题。
