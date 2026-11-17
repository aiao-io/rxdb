---
id: ADESK-US-125
title: Stocks 本地搜索与演示数据声明
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, stocks, search]
dependsOn: [ADESK-US-101, ADESK-US-102]
capabilities: []
---

# Stocks 本地搜索与演示数据声明

作为查看自选股演示数据的用户，我希望能按股票代码或公司名筛选列表，并清楚知道行情不是实时市场数据，避免把静态演示读数当成真实报价。

## 范围边界

### In Scope

- Stocks 搜索框绑定本地自选股查询，按股票代码或公司名过滤，不区分大小写并支持清空恢复完整列表。
- 无匹配结果时显示明确的空状态，不保留过期的详情内容。
- 筛选后选择股票，详情标题、公司名、价格和走势继续对应当前股票。
- 页面明确声明本地内容为演示数据且没有实时行情源；推算的 Open、High、Low 字段标注为 demo。

### Out of Scope

- 实时行情、交易、账户接入、证券报价订阅和远程自选股同步。
- 股票详情的真实成交量、估值、市值、52 周高低点和新闻数据。
- Stocks widget 的实时刷新，以及复杂的自选股添加、删除和排序管理。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | Stocks 已打开 | 查看自选列表 | 初始显示 6 支本地种子股票，顺序稳定 | ✅ |
| 2 | Stocks 已打开 | 搜索 `NVDA` | 只显示 NVDA | ✅ |
| 3 | Stocks 已打开 | 搜索 `Amazon` | 只显示 AMZN，说明公司名搜索生效 | ✅ |
| 4 | Stocks 已打开 | 搜索不存在的内容 | 显示 `No matching stocks`，列表为空 | ✅ |
| 5 | 搜索结果为空 | 清空搜索 | 恢复完整的 6 支自选股列表 | ✅ |
| 6 | 自选列表可见 | 选择 AMZN | 标题和详情区都显示 AMZN / Amazon.com，详情跟随选择 | ✅ |
| 7 | Stocks 已打开 | 查看行情说明和详情统计 | 显示 `Demo data · No live market feed`，Open、High、Low 标为 demo | ✅ |
| 8 | 本地正式构建 | 跑 Stocks 单测、lint、typecheck、生产构建和浏览器回归 | 主要路径通过并归档原始报告，不声称实时市场能力 | ✅ |

## 验收证据

2026-11-18，本地正式构建自动验收完成，未提交、未发布。`stocks-workflow` 检查组验证了初始自选列表、代码搜索、公司名搜索、空结果、清空恢复、详情联动和演示数据声明，报告见[证据](../../evidence/2026-11-17/aiao-stocks-workflow-green.json)。

- `pnpm nx run aiao-desktop-web:test -- --coverage.enabled=false --run src/app/apps/stocks/stocks-data.spec.ts`：3 条 Stocks 搜索模型用例通过。
- `pnpm nx run aiao-desktop-web:typecheck`、`pnpm nx run aiao-desktop-web:lint` 和 `pnpm nx run aiao-desktop-e2e:lint`：全部通过。
- `pnpm nx run aiao-desktop-e2e:e2e --args='--group=stocks-workflow --parallel=1 --report=../../requirements/evidence/2026-11-17/aiao-stocks-workflow-green.json'`：7 项全绿，`initialWatchlist`、`searchesBySymbol`、`searchesByCompany`、`emptySearch`、`clearsSearch`、`detailFollowsSelection` 和 `declaresDemoData` 均为 `true`，无页面错误；生产构建由 E2E target 的依赖任务完成。

本故事只关闭 Stocks 本地演示数据的搜索和边界说明；实时行情、交易、账户、远程同步和真实指标仍未接入。

## 技术笔记

`filterTickers` 对本地 `Ticker` 列表执行规范化查询；`StocksApp` 用股票代码保存选择状态，筛选后自动回退到第一条可见股票，详情和走势图随当前结果计算。静态统计沿用现有演示算法，并在界面上显式标注。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/stocks/stocks.ts` — 查询、筛选、稳定选择和演示指标标签
- `aiao-desktop/apps/web/src/app/apps/stocks/stocks.html` — 搜索绑定、空状态和演示数据说明
- `aiao-desktop/apps/web/src/app/apps/stocks/stocks-data.ts` — 本地行情筛选模型
- `aiao-desktop/apps/web/src/app/apps/stocks/stocks-data.spec.ts` — 搜索模型单测
- `aiao-desktop/apps/e2e/src/groups/stocks-workflow.mjs` — 正式构建浏览器验收

## References

- [A06 内置应用任务核查与补齐](../../plans/2026-11-17-builtin-workflows.md)
- [Aiao Desktop 验收台账](../../verification-report.md)
