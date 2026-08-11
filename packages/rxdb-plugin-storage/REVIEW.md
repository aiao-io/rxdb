# `@aiao/rxdb-plugin-storage` 代码评审

> ## ⚠️ 本报告已作废（superseded）
>
> **不要引用本报告的结论。** 它给出的 🟢 绿灯是错的。
>
> - **失效原因**（STOR-011）：基线是 `03a46a5d…`（2026-07-14，19 文件 / ~2,853 行），
>   当时代码已经演进到 20 文件 / ~3,723 行；「无 P1/P2」与「补偿回滚和生命周期充分」
>   两条结论都不再成立。
> - **实际状态**：后续评审在本包提出 13 条 finding（STOR-001 ~ 013），其中
>   STOR-001（install 篡改模块级实体 metadata）与 STOR-002（路径锁只覆盖 upload，
>   其余写 API 的补偿会删掉并发提交的文件）是 P1，**恰好落在本报告断言「充分」的那两处**。
> - **当前基线**：`code-reviews/incomplete/STOR-*.md`（每条顶部的 `## 判定：` 块为准）
>   与 `code-reviews/incomplete/TRIAGE.md`。
>
> 保留原文仅为存档，说明「一次绿灯评审会在代码演进后变成误导」。

## 结论（已作废）

🟢 好。OPFS 文件与 RxDB metadata 的非原子跨存储操作均有补偿回滚，路径规范化和对象 URL 生命周期覆盖充分。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：OPFS 存储、metadata、远端 fetch、预览/下载、测试和公开入口；19 个文件，约 2,853 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

本轮未发现 P0、P1 或 P2 问题。

## 其余观察

- 上传、改名、目录改名和删除在 metadata 或文件操作失败后都会恢复另一侧状态；回滚失败以 `AggregateError` 暴露。
- `fetch()` 对同一 OPFS path 共用 in-flight 请求，命中已有文件时不重复下载，且支持 Abort 与离线错误区分。
- 路径拒绝空段、`..` 与非法文件名；下载临时 Object URL 在 finally 中回收。
