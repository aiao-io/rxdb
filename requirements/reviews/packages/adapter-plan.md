---
title: 适配器包增量评审计划与结果
status: Done
baseline: ffed57da
incrementalFrom: 18ea576f
updated: 2026-10-26
---

# 适配器包增量评审计划与结果

## 范围与方法

覆盖 13 包：rxdb-adapter-{electron,encrypted,http,miniprogram,pglite,sqlite,sqlite-core,sqlite-wasm,sqliteai,supabase,tauri,wa-sqlite} 与 rxdb-taro。以 `18ea576f` 的上一版报告为起点，检查到 `ffed57da`；先按提交和路径盘点，再沿高风险调用链检查与现有测试反查。

本轮重点：影子表/schema 及关联引用、播种/序列/触发器、系统 schema v8、快照/只读/删库、SharedWorker 持有者与 OPFS 回收；VFS 余量扩容与依赖 glue 联动。

缺陷必须有当前源码位置、触发条件与用户影响；无实现增量的包只核对元数据/配置/文档和旧发现的关闭证据。测试文件存在或提交标题含 fix 均不能证明问题已关闭。完整方法、提交清单和 51 包覆盖矩阵见 [本轮记录](./incremental-2026-10-26.md)。

## 结果

去重待处理 20 条：1 P1 + 8 P2 + 11 P3；新增 INC-002（两后端共享根因只计一次）。 逐包问题见同名报告，跨组总数见 [汇总](./summary.md)。首批 6 条已修复记录移出当前问题清单，历史留在 Git。

## 验证与限制

PGlite 定向 53 例、小程序 357 例通过；INC-002 真实 PGlite 回滚反例失败。SQLite 同源路径静态确认；Electron/Tauri 宿主、Supabase 与小程序真机未跑。

当前环境 Node `26.12.0` / pnpm `10.34.9`。上轮 Node 22 / Nx 插件加载失败的说明已过时，按 [实际执行表](./incremental-2026-10-26.md#验证) 判断通过范围；未跑全工作区 lint/typecheck/build/e2e。报告只更新文档，未修生产代码。
