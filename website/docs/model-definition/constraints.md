# 存储约束

实体元数据可以声明三类存储约束。它们写进建表 DDL，由数据库在每次写入时检查——不管写入来自仓储、批量 `mutations`、undo / redo 还是同步拉取：

- **CHECK**：`checks`，或属性上的 `check`
- **条件唯一**：索引的 `where`
- **区间排他**：`exclusions`

SQLite family 与 PGlite 的行为一致，违约时抛同一个错误类。远端适配器（supabase / http）不掌控 DDL：主存储在远端的实体声明了约束，`connect()` 直接报错；「本地 + 远端同步」的实体由本地适配器承担约束。

## CHECK

规则写法复用查询的 `RuleGroup`（`combinator` + `rules`），收窄为只看单行的子集，另外多一个字段对字段比较 `ref`：

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'BomLine',
  properties: [
    // 属性级语法糖：编译成名为 qty 的实体级 CHECK
    { name: 'qty', type: PropertyType.integer, nullable: true, check: { operator: '>', value: 0 } },
    { name: 'qtyFormula', type: PropertyType.string, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  checks: [
    {
      name: 'qty_xor_formula', // qty 与 qtyFormula 恰好一项有值
      rule: {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'notNull' },
              { field: 'qtyFormula', operator: 'null' }
            ]
          },
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'null' },
              { field: 'qtyFormula', operator: 'notNull' }
            ]
          }
        ]
      }
    },
    {
      name: 'unit_range', // 字段对字段：下界 ≤ 上界
      rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
    }
  ]
})
export class BomLine extends EntityBase {}
```

- 操作符只有 `=` `!=` `<` `>` `<=` `>=` `in` `notIn` `between` `notBetween` `null` `notNull`；`contains` / `startsWith` / `exists`、关系路径、JSON / 键值 / 二进制 / 加密列在声明期就报错。
- **NULL 按 SQL 三值逻辑放行**：`unitFrom <= unitTo` 遇到 NULL 结果未知，CHECK 通过。要拒绝 NULL 请显式加 `notNull`。
- `integer` 列的字面量不能超出 32 位整数值域（PG 把它建成 `integer`），需要更大值域请把列声明为 `bigint`。
- 违约抛 `RxDBCheckViolationError`，带实体名、约束名和这次写入的冲突列值。

## 条件唯一

给唯一索引加 `where`，只对满足条件的行生效：

```ts
@Entity({
  name: 'ItemRevision',
  properties: [
    { name: 'itemId', type: PropertyType.uuid },
    { name: 'state', type: PropertyType.string }
  ],
  indexes: [
    {
      name: 'released_item', // 同一物料至多一个已发布修订，草稿不受限
      properties: ['itemId'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ]
})
export class ItemRevision extends EntityBase {}
```

- `where` 与 CHECK 用同一套规则写法和同一组操作符；只能配 `unique: true`，普通索引带 `where` 在声明期报错。
- 违约与普通唯一冲突是同一种错误（PG `23505` / SQLite `UNIQUE constraint failed`），不另起错误类。

## 区间排他

「相等列 + 区间维」：相等列全部相等、且**每一维**区间都相交的两行互斥。适合「同一行发生项的有效期不能重叠」这类不变量：

```ts
@Entity({
  name: 'BomOccurrence',
  properties: [
    { name: 'bomLineId', type: PropertyType.uuid },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['bomLineId'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' }, // 左闭右开：首尾相接不算重叠
        { from: 'unitFrom', to: 'unitTo', bounds: '[]' } // 两端闭合：136 与 137 相邻不算重叠
      ]
    }
  ]
})
export class BomOccurrence extends EntityBase {}
```

- 区间维只接受 `date` / `integer` / `bigint` 列，`bounds` 只能是 `'[)'` 或 `'[]'`。端点为 NULL 即该侧无界。
- 起点晚于终点的倒置区间当空区间，不与任何行冲突；要拒绝倒置区间，另加一条 CHECK `from <= to`。
- 相等列任一为 NULL 的行不参与冲突。
- 违约抛 `RxDBExclusionViolationError`，`ranges` 逐维给出本次写入行（`incoming`）与已有冲突行（`existing`）的区间。
- 检查按行即时进行。同一次 `saveMany` / `mutations`、undo / redo、切换分支里，带区间排他的实体按「删除 → 更新 → 插入」执行，所以「截止旧行 + 新开一行」可以一起保存、一起重放。两行**互换**区间不管什么顺序都要经过重叠，仍会被拒，请经中间值分两步写。
- PGlite 上落成 `EXCLUDE USING gist`，适配器自动装载 `btree_gist` 扩展。Electron 的 PGlite 由主进程创建，需要在 `createRuntime` 里装载 `@electric-sql/pglite/contrib/btree_gist`，可以用 `pgliteServerExtensionRequirementsOf(entities)` 判断要不要装。
- SQLite 上落成插入 / 更新两个触发器，按相等列查找同组行；数据量大时请为相等列另外声明普通索引。

## 已有表与约束漂移

约束名由元数据确定性生成：前缀（`ck_` / `uq_` / `ex_`）+ 表名 + 你给的 `name` + 定义的 8 位哈希。`name` 只允许小写字母开头、由小写字母、数字和下划线组成，整个约束名不能超过 63 字节。

`connect()` 时会把库里实际的约束和声明比对。**已有表上缺了声明的约束、或多出声明外的约束，都会抛 `RxDBConstraintDriftError`**，列出缺失与多余的约束名——框架不替你补建，因为老数据可能本来就违反新约束。在 `migrations` 里补上（迁移排在比对之前执行），再 `connect()` 即可。只改规则不改 `name` 也会换名字，同样按漂移处理。

SQLite 宿主版本须 ≥ 3.47.0（区间排他的触发器消息要带冲突区间）。声明了任一存储约束而宿主版本更低时，`connect()` 报错并点名实际版本；一项都没声明的应用不受影响。
