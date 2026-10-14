# Quickstart: epic-009 首轮切片第 3 步（验证记录）

**日期**：2026-10-14 | **分支**：`claude/bom-related-work-77235b`

## 交付物

| 项 | 落点 |
| --- | --- |
| 十进制 kernel | `packages/rxdb-plugin-bom/src/quantity/decimal.ts` — 纯 BigInt 定点，34 位有效数字、half-even、`ceilToDecimalPlaces` |
| 公式求值器 | `quantity/formula.ts` — 受限语法（字面量 / 四则 / 括号 / Unicode 命名参数），`FORMULA_GRAMMAR_VERSION = '1'` |
| 单位换算 | `quantity/uom.ts` — metric 前缀标准系数 + 行级/物料级显式换算率（1 目标单位 = N 源单位，行级覆盖物料级），缺率拒绝 |
| 七步展开 | `quantity/explosion.ts` — `explodeBom`（BFS + 预算结算复用 US-510 骨架），`EXPLOSION_ALGORITHM_VERSION = '1'` |
| 实体扩展 | `entities.ts` — 头 / 行发生项 / 物料共 20 个新列 + 单行 CHECK（`qty_xor_formula` / `tier_columns_shape`） |
| 存储触发器 | `backend/bom-trigger-ddl.ts` — 十进制格式字段化、良率损耗域、阶梯边界 15 位域（两后端保存期一致拒绝）、头发布阶梯切片校验（SQLite `CAST AS REAL` / PG `::numeric`） |
| 测试 | 8 个新 spec（decimal / formula / uom 纯单测 + quantity-schema / explosion / tier / phantom 双后端集成），190/190 通过 |

## 测试与门禁（截至当日）

- `rxdb-plugin-bom`:test — 190/190 通过（14 个 spec）；覆盖率 96.01% 语句 / 88.02% 分支 / 93.44% 函数 / 97.16% 行（四指标 ≥ 80%）
- `rxdb-plugin-bom`:lint / :typecheck — 零警告 / 零错误
- `audit:api-surface` — 基线已更新（explodeBom / 十进制 kernel / 公式 / 换算等新导出）
- affected full（272 任务）— **272/272 全绿**（本机负载 flaky 轮转：wa-sqlite / sqlite-wasm / electron / tauri / http-server / alipay-probe / vue-e2e 七处时序敏感测试在多轮全量中轮流超时或断言竞态，均单跑全绿、与本改动无关；第九次全量 272/272 通过，nx 标记 7 个 flaky 任务）

## 排障记录（第 3 步踩过的坑）

1. **BigInt 幂指数须非负**：`10n ** BigInt(-3)` 抛 `RangeError`——同量纲换算的负指数走除法分支。
2. **测试 fixture 的 itemNo / 修订唯一性**：同一子件出现在多条边时，`loadHistory` 的 revisions 必须先去重（部分唯一索引按 `(itemId, effectiveFrom)`）；同 describe 共享库时 itemNo 加随机前缀（第 2 步同款）。
3. **SQLite 的 RAISE 必须是触发器体顶层语句**：不能藏在标量子查询 `(SELECT RAISE(...))` 里——消息表达式（点名组号与发生项）直接内联在 SELECT 里拼接；PG 侧则查进 `violation` 变量后 `RAISE EXCEPTION '%', violation`。
4. **同一行同区间的排他约束先于 CHECK**：测单行 CHECK（恰好一项、阶梯形状）时每个发生项要自建逻辑行，否则排他违约先浮出。
5. **中文参数名**：ident 正则要用 Unicode 属性转义 `[\p{L}_][\p{L}\p{N}_]*`（u flag），`[A-Za-z_]` 匹配不了「长/宽」。
6. **公式行 fixture 的 qty 兜底**：`occurrence.qty ?? '1'` 会把公式行的 qty 兜底成非空，撞 `qty_xor_formula`——公式行显式传 null。
7. **换算率口径**：`uom_conversion` = 「1 目标单位含多少源单位」，转换是 `X ÷ rate`——AC#9 的 4 件 ÷ 4 = 1 盒、物料级 ÷ 10 = 0.4 盒，两段换算（行 UoM→库存→头基准）共用同一率链。
8. **本机门禁负载 flaky**（第 2 步已记录）：本轮 `rxdb-adapter-wa-sqlite:test` 的 backup「restore 中途 kill」测试在并行负载下 30s 超时，单跑 877/877 全绿；按「先单跑、再重跑全量」处理。

## 下一步（第 4 步）

US-507 阶段 C（位号计数的编辑 / 发布协议）+ US-525 阶段 A（分层种子的 A 层与分阶段 golden、无路线版算式面板）。
