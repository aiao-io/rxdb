# codex/fix-cross-tab-live-query 分支深度评审（US-032）

| 项 | 值 |
| --- | --- |
| 评审对象 | `codex/fix-cross-tab-live-query` @ `4ec1c8d9`（含 2 次合 main） |
| 对比基线 | `main` @ merge-base `06fdcb4b`（`main...FETCH_HEAD` 三点差） |
| 评审日期 | 2026-10-29 |
| 提交历史 | `eee1ab22` 修复 + `c4fcfcdc`/`2b4aee44`/`aea47e68` 合 main 与第一轮评审修复 + `b9b5c5f5`/`59d5e17f`/`4ec1c8d9` 后续演进（WIP 命名，866 行） |
| 变更规模 | 19 文件，+1368/−122；核心门控 1 处重写、5 处小改，测试 +914 行，文档 6 份 |

## 结论摘要

**方向正确、机制自洽，可合入；1 条 P2（建议顺手修）、2 条 P3（清理项），无 P0/P1。**

分支把 UPDATE 增量门控从「缓存补不齐就凭残缺实体硬判」重写为「按任务读取的列逐列验完整性，补不齐/迟到一律回 SQL」。这套模型四层递进（改没改读取列 → 缓存是否比事件新 → 前后态字段齐不齐 → 追加行是否完整），与下游 `newlyMatchedIds` 的追加语义、`applyExternalEntityUpdate` 的陈旧守卫、脏实体的基线语义相互咬合，冷缓存 / 残缺缓存 / 迟到事件 / 同批同 id 多事件 / 外类型撞 id 五类缺陷都修复到位。测试质量显著高于仓库均值（真实双连接 + 查询次数 spy + primeCache 变体钉分支）。前一轮评审（`requirements/reviews/README.md` 已记录 `a.md` 删除轨迹）的 14 条修复在最新提交上均成立。

> 评审局限：本工作树检出的是另一个分支，**未重跑仓库测试套件**（P2-1 与 `= null` 语义已用目标分支源码独立实跑断言，见「验证记录」）。US-032 验证节列出的数字（核心 2693 条、wa-sqlite 双连接 8/8 等）对应评审中途的状态，分支此后又演进 866 行，合入前应重跑核心 `merge_update.spec.ts` 与 wa-sqlite `live-query-cross-connection.spec.ts`。

## 变更全景

| 文件 | 职责 | 评审要点 |
| --- | --- | --- |
| `packages/rxdb/src/query/need_refresh_update.ts` | UPDATE 门控重写 | 核心，见下 |
| `packages/rxdb/src/query/merge-update.utils.ts` | `foldUpdate` 同批合并；`UpdateDataCache` 折叠构造 | 合并语义正确 |
| `packages/rxdb/src/query/merge_update.ts` | `get` 只收本类型事件并折叠；`_recalculate` 只喂本类型事件 | 修复整数主键撞 id |
| `packages/rxdb/src/query/query-relation.utils.ts` | `fieldRoot` / `whereRules` / `fieldColumn`；`whereUsesRelations` 重构复用 | 见发现 P3-1 |
| `packages/rxdb/src/query/query-matching.utils.ts` | `= null` 按 `IS NULL` 判；日期等值遇实体侧为空不抛 | 与 SQL 三值逻辑对齐 |
| `packages/rxdb/src/repository/QueryManager.ts` | `_need_change` 注释：无任务时 UPDATE 不进身份缓存 | 缺口已登记 roadmap 零散收尾项 #6 |
| `packages/rxdb-plugin-tree/src/query/merge_update.ts` | 树查询声明 `TREE_READ_FIELDS = ['parentId']` | 父列缺值读成 null 的误判被门控拦截 |
| `packages/rxdb-plugin-tree/src/query/merge-update-tree.ts` | 3 处 `getSerializedBefore` 改无参 | 折叠语义统一 |
| 测试 ×4 | 核心 +597、跨连接 +228、匹配 +32、树浏览器 +57 | 见测试评估 |
| 文档 ×6 | US-032 / roadmap / status-overview / epic-004 / CHANGELOG / reviews README | 数字一致 |

## 门控模型解析（`need_refresh_update.ts`）

每个任务类型的批次判定流程：

1. `separateEntities` 按「实体类型名 + 命名空间」分本类型与关系实体。**缓存只喂本类型事件**——关系实体与查询实体撞主键（整数主键最常见）时不再互相顶替。
2. `UpdateDataCache` 构造时按 `foldUpdate` 把同 id 多条事件合成一条：patch 后写覆盖、inversePatch 先写为准，合成后描述「本批之前 → 本批之后」整段变化。**只被前一条改过的列不再从更新后态消失。**
3. `resolveUpdate` 用身份缓存实例补足补丁：脏实体先经 `persistedState` 把被编辑键回退到基线（`EntityStatus.inversePatch` 定义恰为 `pick(origin, keys(patch))`，语义吻合），再叠加本批 `inversePatch` 得前态。
4. `readColumnsOf` 收集任务读取的列：where 规则字段（递归穿透嵌套组）+ orderBy 字段 + 调用方声明的列（树插件传父列）。关系路径落到本表外键属性（`'author.name'` → `'authorId'`），to-many 路径无本表列、交给关系规则。
5. `isUndecidable` 四层递进，任一命中整体回 SQL：
   - **没改读取列**（`touchesColumns` 只认 `patch[col] !== inversePatch[col]` 的值真变）→ 匹配状态与排序位置都没动，缓存缺什么列都不影响结论，直接放行 JS 路径——这是「只改条件不读的列不重数」的实现。
   - **缓存比事件新**（`isStaleEventPayload` 第二道防线：分发层放行后、本批处理前被更新的查询水合推进）→ 叠加迟到的 `inversePatch` 拼出的前态哪个版本都不是。
   - **前后态读列不齐**（`hasFields`：自有属性且非 `undefined`，`null` 是已知值）→ 证明不了匹配状态变化。
   - **findAll 新匹配行整行不齐**（`isIncompleteNewRow`：不在结果里 + 匹配 where + 缺任一持久列）→ 追加进去就是残缺行。
6. 批次内任一事件 `patch` 非空而 `inversePatch` 空（系统表 UPDATE、`notifyExternalUpdate`）→ 前态不可还原，批次级回 SQL（既有保守行为保留）。
7. 通过门控后走 `QueryRulesBuilder` 规则判定；`count_boundary_crossed` 逐实体配对比较 patch/inversePatch 的 where 命中翻转，只被核心 count 消费（树 count 走自己的处理器）。

### 与下游机制的咬合（已逐条验证）

- `isIncompleteNewRow` 只在 `touchesColumns` 为真时执行，而 `handleFindAllUpdate` 只追加 `newlyMatchedIds`（匹配翻转必由 where 列变化引起，`touchesColumns` 必真）——**所有可能追加残缺行的路径都被覆盖**，早退不构成缺口。
- `applyExternalEntityUpdate` 自带 `isStaleEventPayload` 守卫：迟到事件即使过了门控早退，也回滚不了结果实体。
- `handleFindOneUpdate` 新匹配（结果为空时）走 `task.refresh()`，不发射残缺实体；`find`/`findByCursor` 是纯 refresh 类型。
- where 用关系字段时 `matchRelationWhere` 恒真（本实体有 UPDATE 即回 SQL），关系路径不参与 JS 判定，`fieldColumn` 的外键映射只服务于排序键与完整性检查。
- `_recalculate` 改喂 `result.current_entities` 后，`relation_entities` 非空时本就经 `match_relation_where` 走 refresh，收不到关系事件对增量处理器无影响。

## 逐文件评审要点

**`foldUpdate`（merge-update.utils.ts）**：`{...later, patch: {...earlier.patch, ...later.patch}, inversePatch: {...later.inversePatch, ...earlier.inversePatch}}`——inversePatch 先写为准意味着同一列两次修改取「本批之前」的值，验证正确；其余元数据（`updatedAt` 等）取 later，`isStaleEventPayload` 比较基准为最终版本，正确。

**`query-matching.utils.ts` 的 `= null`**：`value === null` 时实体侧 `null`/`undefined` 一并算空，与 `json_extract`/`->>` 对缺失 JSON 键取 NULL、SQL 侧 `IS NULL` 的语义对齐；`!= null` 实体侧为空已由 `NULL_EXCLUDED_OPERATORS`（含 `!=`）短路，与 `IS NOT NULL` 一致——前一轮评审「`!=` 本在集合里」的核实无误。日期等值把 `entityValue` 为空排除出时间点比较（原实现会抛类型错配），与 SQL `col = ?` 在 NULL 上为 UNKNOWN 一致。

**脏实体（`persistedState`）**：`status.inversePatch` 只含被编辑键的 origin 值（不含 `updatedAt`，保存时 updatedAt 由系统回填、不在用户 patch 里），因此回退基线不会扭曲陈旧判定的时间戳基准；`mergeExternal` 逐字段避让编辑键，外部更新推进的正是这份基线——注释与实现吻合。

**树插件接线**：`TREE_READ_FIELDS = ['parentId']` 修复「`get_tree_parent_id` 把缺失读成 null → 子节点被当根、新匹配永远进不了结果」。树 count 处理器（`handleCountDescendantsUpdate`）用 `classification` 的折叠后结论 + 原始事件各自判 `parentChanged`，同 id 多条事件循环两次的判定组合正确。

**`get` 分支**：`separateEntities(...).current_entities.filter(id === task.options)` + `reduce(foldUpdate)`——同 id 外类型事件不再误落 `get` 结果，同批两条补丁都落上。`get` 仍无 stale 检查（与旧行为一致，不属本分支范围）。

## 发现清单

### P2-1 大写组合子 `'AND'`/`'OR'` 在收集侧与求值侧不对称（既有缺口，建议顺手修）

- **收集侧**：`whereRules` 只认 `isRuleGroup`（小写 `and`/`or`），大写组合子被跳过——字段不参与 `readColumns`，完整性门控对它组内的字段失效。
- **求值侧**：`is_entity_match_rule_group_or_rule` 对不认的元素直接走 `get_entity_match_rule`，其第一行 `get(entity, rule.field)` 在 `field` 为 `undefined` 时抛 `Cannot read properties of undefined (reading 'split')`（lodash 路径解析），连 `switch(operator)` 的 `default` 分支都走不到。`isEntityMatchWhere` 在 `merge_update` 的同步调用链里，抛错即中断整批事件处理。已用目标分支代码实跑复现（见「验证记录」）。
- SQL 翻译侧（sqlite-core/PGlite）接受大写 `AND`，用户查询能跑通 SQL 却让增量判定崩溃——三个入口对同一输入的容错不一致。
- 现有测试只覆盖「首条规则已判 false 短路」场景，未覆盖「首条为 true 走到大写组」。
- 建议：求值侧把大写组合子归一化（翻译成小写）或抛带定位信息的明确配置错误；收集侧随之对齐。此缺口旧代码同样存在，但本分支首次把收集侧系统化，是顺手修掉的好时机。

### P3-1 `fieldColumn` 命名与 TSDoc 有误导性

`fieldColumn` 返回的是 **JS 属性名**（普通字段返回字段名本身，关系路径返回外键属性名 `${name}Id`），不是数据库列名（用户可经 `columnName` 自定义，属性名 ≠ 列名）。当前两个消费点（`touchesColumns`、`hasFields`）都在属性名空间操作，语义一致、无 bug；但函数名与「本表列名」的文档会诱导未来使用者拿它拼 SQL 列名或与 `columnName` 对照。建议改名（如 `fieldProperty`）或改 TSDoc 写明「属性名空间」。

### P3-2 `getSerializedBefore` 的可选参数签名已无内部使用，建议收紧

`serializedBeforeCache` 只按 id 缓存。签名仍暴露 `inversePatch` 可选参数：外部插件若对同 id 混用带参/不带参调用，第二次调用会静默拿到第一次的缓存结果。本分支已把全部内部调用（含树插件 3 处）改为无参，签名可以删掉该参数消除误用面。

## 已核实正确的关键机制（防后人重复排查）

- 外键属性名固定 `${name}Id`（`columnName` 只影响数据库列名），`fieldColumn` 的关系映射对所有 MANY_TO_ONE/ONE_TO_ONE 成立（含 ONE_TO_ONE，注释同样声明「写入必须走 `${name}Id`」）。
- `hasUnknownBefore` 用**原始事件**判定（折叠前），比折叠后判定更保守——两条事件中任一条 `inversePatch` 为空即回 SQL，不因折叠「补足」而漏判。
- `resolvedCurrentEntities` 每 id 去重后交 `QueryRulesBuilder`，`ResolvedUpdate` 形状（`{id, patch, inversePatch}` + 额外 `event`）与 `QueryRuleChange` 兼容。
- `serialize`（`QueryManager.#serialize`）经 `createEntityRef` 命中身份缓存时返回同一实例、未命中时把残缺实例写进缓存——「缓存命中 ≠ 完整」的判定依赖 `hasFields` 而非命中与否，验收标准 #3 成立。
- 公共面 `query_need_refresh_update as queryNeedRefreshUpdate` 重命名导出不变，`readFields` 可选参数向后兼容，三框架绑定零改动（对称性无影响）。
- 跨连接测试的「只改条件不读的列不重数」用 `vi.spyOn(adapter, 'transaction')` 在**收方**计数，初始查询在 spy 建立前已落地，断言 `1` 次恰为第二次（改了条件列的）重数——计数设计无误。

## 测试评估

- **真实双连接（wa-sqlite，8 用例）**：count 复合筛选跨界重数（含 `primeCache` 变体：持有 `getEntityRef` 返回的残缺实体到最后一次断言，否则 WeakRef 回收后两条路径都刷到 1、分不出验的是哪条）；「只改条件不读的列不重数」；findAll/find/findByCursor 空结果 + 稀疏 UPDATE 出新行；findAll 单字段筛选的新行含未改完整字段；空筛选 + 完整缓存走增量不查 SQL。
- **核心 spec（+597）**：冷缓存 / 残缺缓存连续事件 / 嵌套 and+or / JSON 路径顶层列与内部键 / 显式 null vs undefined vs 缺失 / 折叠判定与逐条落地 / 脏实体（`defineProperty` 挂 `STATUS`）/ 迟到事件（缓存 `updatedAt` 新于事件）/ 大写组合子短路 / 外类型撞 id / `get` 不吃外类型事件 / 带元数据 Post-Tag 夹具（关系路径排序、整行追加、次级排序列缺失回 SQL）。
- **树插件（+57）**：findDescendants / countDescendants 稀疏补丁回 SQL、只改无关列不触发 SQL。
- 断言风格良好：`expectIncrementalUpdate` 钉住 patch 不含 `body`（真稀疏补丁）；核心用例断言 `cached` 实例被两条补丁都改到（折叠落到身份缓存）。
- 验收标准 11 条与用例一一对应，US-032 表格全部标 ✅。

## 文档一致性

- `status-overview.md` 120→121、`roadmap.md` 34→35、README「86/121」、epic-004 新增 US-032 条目、CHANGELOG Fixes 条目——数字与叙述互相吻合。
- `requirements/reviews/README.md` 记录前一轮评审删除轨迹（`a.md` @ `aea47e68`，3 P1 + 10 P2 + 2 P3，修 14 判不修 1），与本分支提交历史吻合；其「评审说法不实」的自纠（`!= null` 半条）与代码一致。
- US-032 复验入口引用的 `7bb16a90` 为有效 commit。
- roadmap 零散收尾项 #6（无活任务时 UPDATE 不进身份缓存）登记在 `QueryManager._need_change` 注释，位置与判据对应。

## 验证记录（2026-10-29 实跑）

用 `git archive FETCH_HEAD` 提取目标分支的 `packages/rxdb/src` 与 `packages/utils/src` 到临时目录，esbuild 打包（`@aiao/utils` 以 shim 指回同分支源码）后以 node 断言，8/8 通过：

| 断言 | 结果 |
| --- | --- |
| P2-1 大写 AND 首条真（走到组） | 抛出 `Cannot read properties of undefined (reading 'split')` ✓ |
| P2-1 大写 AND 首条假（短路） | 返回 `false`，不抛 ✓ |
| `= null` + JSON 缺键 / 整列 null / 有值 | `true` / `true` / `false` ✓ |
| `!= null` + JSON 缺键 / 有值 | `false` / `true` ✓ |
| sanity：小写 `and` 复合条件 | `true` ✓ |

注意：实跑同时修正了 P2-1 的抛错位置描述——错误发生在 `get_entity_match_rule` 第一行的 lodash 路径解析，而非 `switch(operator)` 的 `default` 分支（`Unknown operator` 只在操作符为不认识的字符串时触发，大写组没有 `field` 键，走不到 switch）。

## 合入前建议

1. 在目标分支重跑 `pnpm nx test rxdb` 与 `pnpm nx test rxdb-adapter-wa-sqlite`（重点 `merge_update.spec.ts` 与 `live-query-cross-connection.spec.ts`，可用 vitest 过滤参数单独跑），确认评审后 866 行演进未回归（US-032 验证节数字早于这些提交）。
2. 顺手处理 P2-1（大写组合子），至少补一条「首条规则为 true 走到大写组」的用例固定行为。
3. P3-1 / P3-2 属清理项，可随本分支一并改或另立小任务。
