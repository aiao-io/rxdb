# Implementation Plan: epic-009 首轮切片第 3 步

**Branch**: `claude/bom-related-work-77235b` | **Created**: 2026-10-14

## 技术上下文（第 1、2 步已就位）

- `@aiao/rxdb-plugin-bom`：实体、双后端触发器（结构列 / 已发布协议 / 十进制格式 / 追溯发布 / 判环 / 历史批次）、`resolve/`（解析、历史装载、展开/反查）、`decimal.utils.ts`（入口规范化，34 位有效数字）
- US-030 阶段 A：CHECK DSL（and/or 组合、`null`/`notNull`、字段间 `ref` 比较），编译进实体 `checks`
- 测试装配：双后端共享断言、`loadHistory` 建 fixture、`tableRef(backend, table)` 直连 SQL

## 设计

### 1. 实体与 schema 变更（`entities.ts`）

- `BomHeader` 新增：`baseUom`（string）、`baseQty`（string，default `'1'`）、`assemblyScrap`（string，default `'0'`）、`assemblyScrapConvention`（enum `additive/yield`，default `additive`）
- `BomLineOccurrence` 新增：`uom`（string，行 UoM）、`qtyFormula`（string nullable）、`formulaGrammarVersion`（string nullable）、`isFixedQty`（boolean，default false）、`tierGroupNo`（string nullable）、`lotsizeFrom` / `lotsizeTo`（string nullable）、`componentScrap`（string，default `'0'`）、`componentScrapConvention`（enum，default `additive`）、`componentScrapFixed`（string，default `'0'`）、`uomConversion`（string nullable，行级换算率）、`phantomOverride`（boolean nullable，US-511 阶段 C）
- `BomItem` 新增：`stockUom`（string）、`uomDecimals`（integer，default 0）、`uomConversion`（string nullable，物料级换算率）
- 实体级 CHECK（US-030 阶段 A）：
  - AC#7 `qty_xor_formula`：`or(and(qty notNull, qtyFormula null), and(qty null, qtyFormula notNull))`
  - AC#21 `tier_columns_shape`：`or(and(tier null, from null, to null), and(tier notNull, from notNull))`
- 所有新十进制列沿用既有格式触发器（`BOM_DECIMAL_FIELDS` 清单扩展）；良率制损耗域（AC#12）与阶梯边界域（AC#25/#26）是**条件谓词**，不走既有全字段格式触发器：
  - `bom_line_occurrence` 新触发器：`componentScrapConvention = 'yield'` 时 `componentScrap` 必须 `= '0' OR substr(·,1,2) = '0.'`（装配损耗同型触发器在 `bom_header`）
  - `lotsize_from` / `lotsize_to`：15 位有效数字 + 整数部分 ≤ 15 位 + 小数部分 ≤ 15 位（逐字节 `length` 谓词），两后端同消息 `rxdb:bom_decimal_format:lotsize_*:…`

### 2. 十进制 kernel（`src/quantity/decimal.ts`）

纯 BigInt 定点，不经 JS number：

- 表示 `{ coeff: bigint, exp: number }`（值 = coeff × 10^exp；exp ≤ 0 规范化后为小数位数的相反数）
- `parse(canonical)`（入口已规范化，kernel 只认规范串）、`add/sub`（指数对齐）、`mul`（coeff 相乘、exp 相加）、`div`（放大余数到 34 位有效数字后整除，half-even 看余数）、`cmp`、`toCanonical()`
- `roundHalfEven(sig)`：34 位有效数字收敛（除法的每一步与最终值）
- `ceilTo(decimals)`：目标小数位向上取整（需求行舍入；`ceilTo(0)` = 向上取整到整数）
- 零的特殊形态（`'0'`）贯穿四则

### 3. 公式求值器（`src/quantity/formula.ts`）

- 语法：十进制字面量（含指数，经 `normalizeDecimalString`）、`+` `-` `*` `/`、括号、命名参数（标识符）；空白忽略
- `FORMULA_GRAMMAR_VERSION = '1'`；tokenizer + 递归下降；除零（kernel 判 0 除数）、负结果、非有限（kernel 恒有限）→ `BomQuantityError`（点名公式与参数名，AC#14）
- `evaluate(formula, params: Record<string, string>)` → 规范串

### 4. 单位换算（`src/quantity/uom.ts`）

- 同量纲标准系数：metric 前缀表（`g`/`kg`/`t`、`mm`/`cm`/`m`/`km`、`ml`/`l`、`pcs` 同词根恒 1）；同一 base 前缀 + 词根 → 标准系数
- 跨量纲：行级 `uom_conversion`（x 行 UoM = 1 子件库存 UoM？——**口径**：`uom_conversion` 声明「1 子件单位 = N 行单位」……采用故事 AC#9 口径：行级覆盖「1 盒 = 4 件」→ `uomConversion = '4'`，即 1 行 UoM 单位含 4 子件库存单位？AC#9 例子：B→C 行声明行级覆盖 1 盒 = 4 件，C 的 G = 4 件 → 归一为 1 盒（4 ÷ 4）。所以换算率 = 每 1 行单位含多少库存单位（`4 件/盒`），G(库存单位) = G(行单位) × rate。物料级同理「1 盒 = 10 件」→ rate 10。**定义**：`uom_conversion` = 1 行单位折合的库存单位数；`D = G'' × rate`，phantom 再 `P = D × (1 / header.base 单位含库存单位数)`——头基准换算走同一机制（stock_uom → base_uom 需要物料级/行级 rate？故事：进入子 BOM 前转到其 `bom_header.base_uom`——base_uom 与 stock_uom 同量纲（都是库存单位族）用标准系数，跨量纲用显式 rate。AC#9：C 库存 UoM 件、头 base_uom 盒、物料级 1 盒 = 10 件、行级覆盖 1 盒 = 4 件——头基准换算的 rate 来源是「行级覆盖 > 物料级」——注意这是 B→C 行的行级覆盖被用于 C 的头基准归一。**归一流程**：行 UoM → 库存 UoM（rate 1：行级 > 物料级 > 标准系数），库存 UoM → 头基准 UoM（rate 2：同一 rate 来源链）。
- 缺换算率 / 量纲不兼容 → `BomQuantityError` 点名路径与缺失换算（AC#10），不默认 1

### 5. 七步展开（`src/quantity/explosion.ts`）

复用 `expansion.ts` 的 BFS 骨架，节点 = 头（进入子 BOM 时按修订解析头，与 `expandBom` 同口径；**节点携数量**：`{ header, P, uom }`）：

1. 根：`target` 解析父修订（复用 `buildParentRevisionSql`）→ 头的集合（多备选未指定 → unresolved 拒绝，复用 `assertCompleteResolution`）；调用方给 `plannedQty`（值 + 单位）→ 换算到根头 `base_uom` 作为 P（缺换算率拒绝）
2. 每层：取头的已解析发生项（`buildChildrenOfRevisionsSql` 扩展列或复用 + 头信息查询）；阶梯行按 `(tier_group_no)` 分组、按损耗前 P 恰好命中一行（`lotsize_from <= P < lotsize_to`，边界比较用 kernel 十进制比较），P 落在组内所有区间外 → `BomQuantityError`（AC#19）
3. 七步公式（见 spec 功能需求 1）；公式参数由调用方给，缺参 / 错 → 整次拒绝
4. phantom = `COALESCE(occurrence.phantomOverride, revision.defaultPhantom)`：真 → 换算到子头基准 UoM 作 P 下钻（不产出需求行、不舍入）；假 → `ceilTo(stockUomDecimals)` 产出需求行；虚拟件无已发布头 → 整次拒绝（AC#18）；非虚拟件无头 → 叶子需求行
5. 需求行 `{ path, itemId, revisionId, qty, uom, rounded }`；预算结算复用（深度 / 展开数 / 路径数 / signal → `truncated`）
6. manifest 追加：`conversions`（用到的换算率）、`formulaParams`、`formulaGrammarVersion`、`algorithmVersion`（`'1'`：34 位 + half-even + 七步顺序 + 需求行向上取整）

### 6. 阶梯切片发布校验（`backend/bom-trigger-ddl.ts` 扩展）

- `bom_header` 发布转移触发器（两后端）追加：同 `(headerId, tierGroupNo)` 组内两条阶梯行，`生效域相交 AND 批量区间相交`（批量比较：SQLite `CAST(... AS REAL)`、PG `::numeric`，15 位域内结论一致）→ `rxdb:bom_publish_validation:…` 点名组号、两个发生项 id、日期段与批量段（AC#24）
- 边界域触发器（见 §1，保存期拒绝 AC#25/#26）

### 7. 插件接线（`plugin.ts` / `index.ts`）

- 门面 `explodeBom(context, target, options)`；导出类型与常量（`FORMULA_GRAMMAR_VERSION`、`EXPLOSION_ALGORITHM_VERSION`）
- 错误家族：`BomQuantityError`（数量语义违约：缺换算率 / 阶梯越界 / 公式错误，点名路径）

### 8. 测试矩阵（TDD，双后端）

| 面                                             | 位置                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| kernel / 公式 / 换算（纯单测）                 | `quantity/decimal.spec.ts`、`formula.spec.ts`、`uom.spec.ts`（34 位 golden、half-even、ceil、除零、参数缺失） |
| 存储约束（AC#7/#12/#21/#25/#26）               | `bom-quantity-schema.spec.ts`（直连 SQL 拒绝 + 入口保存）                                                     |
| 七步 golden（AC#20/#22 展开段/#16/#17/#15/#2） | `bom-explosion.spec.ts`（双后端，golden 逐字断言）                                                            |
| 阶梯（AC#6/#19/#24）                           | `bom-tier.spec.ts`（双后端，发布期校验直连触发）                                                              |
| 损耗（AC#11/#12）                              | `bom-scrap.spec.ts`                                                                                           |
| phantom（AC#4/#8/#9/#18）                      | `bom-phantom.spec.ts`（双后端）                                                                               |
| 单位换算（AC#5/#10）                           | `bom-uom.spec.ts`（双后端）                                                                                   |

### 9. 门禁与回写

api-baseline 更新、覆盖率 ≥ 80%、affected full、故事回写（US-511 阶段 A/C/B1 勾选 + 关闭记录；epic/roadmap/status-overview 第 3 步记录）、specs/013 quickstart。
