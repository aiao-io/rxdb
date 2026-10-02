---
id: RV-022
title: US-028 可排序实体立项评审
status: Open
created: 2026-10-02
updated: 2026-10-02
pr:
---

# Review：US-028 可排序实体立项评审

RV-018 的 13 条已全部回写进 [US-028](../stories/core/US-028-sortable-entity.md)。本次只回答两件事：**能不能立项**，以及立项前排序契约里还剩什么硬伤。

## 结论

❌ **不立项，留在立项池。** 故事自己写的两条解锁条件都没满足；另有 3 条 P1 需在任何立项前回写。

## 已复核成立的前提

| 断言                                                                          | 证据                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `sortOrder` 在 core 与 rxdb-model 零实现                                      | `grep -rln sortOrder packages/rxdb/src packages/rxdb-model*/src` 零命中                                           |
| 三端 `EntityList` 已关手柄                                                    | 三处 `LIST_TABLE_OPTIONS`：`rowSeriesNumber: { title: '', width: 40, dragOrder: false }`                          |
| `rowReordered` 无消费方                                                       | apps / modules / website 下无 `EntityTable` / `QueryTable` 直接调用                                               |
| JS 比较器是码点序、NULL 靠前                                                  | `query-matching.utils.ts` 的 `compareOrderValues`：`if (left == null) return -1;`，随后 `<` / `>`                 |
| 默认字母表初始键 `a0`                                                         | 实测 `generateKeyBetween(null, null) === 'a0'`                                                                    |
| 事务内可读锚点                                                                | `TransactionExecutor` 的 TSDoc 示例：`executor.getRepository(Todo)` 后 `find` 再 `update`                         |
| `EntityList` 的 `normal` 状态是显式 `[id desc]`，`findByCursor` 要求末尾 `id` | `buildCursorOrderBy()`；`Repository.findByCursor`：`'orderBy must end with id field for cursor-based pagination'` |

## R00 解锁条件未满足（立项判据）

**问题**：故事「价值待证」的解锁条件是「出现需要手动排序的扁平实体」或「有调用方直接渲染 `EntityTable` / `QueryTable` 并要落库」。逐项查：

- 唯一的扁平演示实体 `rxdb-test/entities/Todo.ts` 只有 `title` / `completed`，没有排序字段；`modules/angular-todo` 内无拖拽代码。
- apps / modules / website 无 `<aiao-entity-table>` / `<aiao-query-table>` / `<EntityTable>` / `<QueryTable>` 直接调用。
- `gh issue list --search "sort OR 排序 OR order"` 无结果。

**修复方案**：维持 Backlog / Low、立项池不动。若 owner 仍要立项，须作为显式定案覆盖[价值待证](../CONVENTIONS.md#价值待证)并写明理由；不要为了满足解锁条件去给 Todo 加排序字段——那是凭 Epic 惯性排期。

## R01（P1）游标分页跨过 NULL 键直接抛错

**问题**：故事允许存量 NULL 键（「未回填时查询按 NULL 靠前、`id asc` 稳定展示」），而阶段 B 的 `EntityList` 走 `findByCursor([sortOrder asc, id asc])`。翻页游标落在 NULL 行时，`Repository.ts` 的 `_generate_cursor_rule_group` 生成：

```ts
andRules.push({ field, operator, value: cursor[field] }); // { sortOrder, '>', null }
```

sqlite-core `query_sql.utils.ts` 对此直接拒绝：

```ts
if (isNull && rule.operator !== '=' && rule.operator !== '!=') {
  throw new RxDBAdapterSqliteError(`Operator '${rule.operator}' cannot be combined with a null value ...`);
```

JS 侧 `compareRuleValues` 对右值 NULL 返回 `false`。结果：第二页抛错；即使不抛，`sortOrder > NULL` 分支恒假，非 NULL 区段永远翻不到，列表会被误判为 `hasMore = false`，UI 启用谓词第 5 条随之误开手柄。AC#11 只写「查询」，没覆盖游标翻页。

**根因**：键集分页的游标谓词按「排序列非空」写，从未处理 NULL 区段。同一缺陷今天就存在于 `EntityList` 按 `nullable` 列做列头排序的路径上（静态推演，未跑红测），与 US-028 无关，可单独作为零散收尾项先修。

**修复方案**：见 R02；R02 不采纳时，AC#11 补「NULL 与非 NULL 混合序列的游标翻页」，并给出游标谓词对 NULL 的展开规则（asc 且 NULL 靠前时：`(col IS NULL AND id > c) OR col IS NOT NULL`）。

## R02（P1，简化）可排序字段要求 `nullable: false`

**问题**：契约里有一整套 NULL 处理——SQLite / PGlite NULL 位置统一、NULL 锚点报错、未回填按 NULL 靠前展示、AC#11 的 NULL 用例，再加 R01。这些全是因为允许 NULL 才存在的特殊情况。

**根因**：引擎已经能在 schema 上禁止 NULL：`PropertyType` 的 `nullable` 默认 `false`，两端建表都据此发 `NOT NULL`（sqlite-core `create_table_sql.ts`：`if (!property.nullable) columnSQL += ' NOT NULL';`，PGlite `create_table_sql.ts` 同构）。故事没利用这一点。

**修复方案**：「声明与 schema」的元数据校验加一条：字段 `nullable` 必须为假，否则初始化报错。随之：

- 删掉 NULL 位置统一与 NULL 锚点相关条款，R01 与 R03 的降序 NULL 问题一并消失；空串 / 非法格式 / 重复键的锚点校验与 PGlite `COLLATE "C"` 保留。
- 「历史数据」改为：给已有实体启用即一次 schema 迁移，存量行必须在迁移里显式回填——由 DDL 强制，不靠运行期报错兜。
- 同步拉取带入 NULL 时由 `NOT NULL` 约束直接拒绝，符合「无 fallback」。

需 owner 定案的代价：远端带入 NULL 会让整批拉取失败，而不是延迟到下一次以它为锚点的写入才报错。plan 须证明创建追加规范化发生在任何非空校验之前。

## R03（P1）AC#4 的「最坏插入键长 169」只覆盖一个方向

**问题**：实测（`@aiao/utils` 默认字母表，起点 `a0` / `a1` 之间，1,000 次）：

| 插入方式                               | 末键长度 |
| -------------------------------------- | -------- |
| 固定下界，每次插在下界与上一次新键之间 | 169      |
| 固定上界，每次插在上一次新键与上界之间 | **202**  |

AC#4 写的「1,000 次最坏插入后键长 169」不是最坏情况。

**修复方案**：AC#4 改为两个方向各测一次，预算写 202（或写成「两个方向的实测值」并在用例里各自断言）。

## R04（P2）降序方向的 NULL 位置未定义

**问题**：契约只规定 asc 时 NULL 靠前。`compareOrderValues(...) * direction` 让 JS 侧 desc 时 NULL 靠后；SQLite `DESC` 也是 NULL 靠后，PostgreSQL `DESC` 默认 `NULLS FIRST`，两端不一致。可排序字段作为普通列做列头降序排序、以及 `findByCursor` 的 `before` 翻页经 `_invert_order_by` 反转后都会走到这条路径。

**修复方案**：采纳 R02 则自动消解；否则契约写明「desc 时 NULL 靠后（与 asc 镜像）」，PGlite 显式 `NULLS LAST`。

## R05（P2）roadmap 与故事漂移

**问题**：

- 抽象数：故事写「至少 4 个」，roadmap 立项池写「至少三项」（漏了 `EntityTable` 的移动上下文输出）。
- roadmap 解锁条件仍写「把 `rowReordered` 落库」，故事已改为 VTable `source` / `target` 移动意图，`rowReordered` 不变；且 roadmap 漏了「落在整表一条序列的首版边界内」这一限定。
- AC#1「不带 `orderBy` 查询」没有列出覆盖哪些读入口；`Repository.find` 做了 options 归一化，`findAll` 原样下发，归一化落点不同。

**修复方案**：roadmap 立项池行按故事同步；AC#1 列明 `find` / `findAll` / `findOne` / `findOneOrFail` 四个入口（`count` 不受影响）。

## 解决记录

- [ ] owner 定案 R00（维持立项池 / 显式覆盖价值待证）与 R02（是否强制 `nullable: false`）
- [ ] R01～R05 回写 US-028 与 roadmap
- [ ] R01 中列头排序的现存缺陷另起零散收尾项：先补红测
