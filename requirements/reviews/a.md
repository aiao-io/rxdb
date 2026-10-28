# codex/fix-cross-tab-live-query 分支评审报告

> 评审对象：`codex/fix-cross-tab-live-query` @ `aea47e68`（PR [#167](https://github.com/aiao-io/rxdb/pull/167)）。实现提交是 `eee1ab22`「fix(rxdb): 修复跨 Tab 增量更新导致活查询过期」，之后两次合入 main，都没有改动被评审的文件。
> 范围：与 `main`（merge-base `06fdcb4b`）的净差异，9 个文件、+574 / −56。逻辑改动只有 [`query_need_refresh_update`](../../packages/rxdb/src/query/need_refresh_update.ts) 里新增的字段完整性门控；其余是核心单测、wa-sqlite 双连接用例、[US-032](../stories/core/US-032-cross-tab-update-live-query.md)，以及 roadmap、status-overview、epic-004、CHANGELOG、README。
> 复验方式：从 10 个角度找问题，21 组候选逐组对照源码反驳验证（19 组成立、2 组驳回），再查漏一轮；成文时又逐条核对了引用的符号和原文。所有结论都来自读源码推演出的失败场景，没有补复现用例，也没有跑测试。按 TDD 铁律，修之前先把场景写成红测试。

## 结论（TL;DR）

- 门控的方向成立：字段不全时回 SQL，比拿残缺实体推出「没变化」可靠。`hasUnknownBefore` 改成早退，与原来的 `before_unknown` 语义一致。
- 判据过宽，有三处是本分支引入的回归（P1）：
  - 只看实体字段齐不齐，不看补丁改了哪些字段，冷缓存行只改无关字段也会整查（P1-1）；
  - orderBy 用关系路径时，完整性检查恒判残缺（P1-2）；
  - where 遍历缺 `isRule` 守卫，嵌套组用大写 combinator 时每批都抛错（P1-3）。
- 判据也不够：字段齐全不等于值可信。有三条 main 上就有的缺陷，正好落在 US-032 要解决的问题里，新门控挡不住（P2-1～P2-3）。
- 另有 4 条 main 既有缺陷（P2-4～P2-7）、2 条测试证据不足（P2-8、P2-9）、1 条需求文档问题（P2-10）、2 条注释与热路径清理（P3-1、P3-2）。
- 合计 **0 P0 + 3 P1 + 10 P2 + 2 P3**。建议合并前修完 P1。P2-1～P2-3 要么在本 PR 修，要么在 US-032 写明不覆盖，否则故事的验收结论站不住：P2-1 的热缓存变体直接违反 AC#3「不永久保留旧结果」。

## 问题一览

| 编号  | 来源                   | 问题                                                         |
| ----- | ---------------------- | ------------------------------------------------------------ |
| P1-1  | 本分支引入             | 完整性门控不看补丁改了哪些字段，无关字段更新也强制整查       |
| P1-2  | 本分支引入             | 关系路径 orderBy 让完整性检查恒判残缺                        |
| P1-3  | 本分支引入             | `whereFields` 缺 `isRule` 守卫，大写 combinator 抛 TypeError |
| P2-1  | 既有，US-032 范围内    | 同批同 id 多条 UPDATE 拼出的前后态错位                       |
| P2-2  | 既有，US-032 范围内    | `requiredFields` 漏了树查询依赖的 `parentId`                 |
| P2-3  | 既有，US-032 范围内    | 脏实体的未保存值参与判定                                     |
| P2-4  | 既有                   | 无活任务时丢弃 UPDATE，过期实体照样通过门控                  |
| P2-5  | 既有                   | 缓存比迟到事件新时，拼出混合版本的前态                       |
| P2-6  | 既有                   | `_recalculate` 收到未按实体类型分离的整批事件                |
| P2-7  | 既有，US-032 AC 依赖它 | JSON 路径 `= null` / `!= null` 的 JS 判定与 SQL 相反         |
| P2-8  | 测试                   | 核心单测没覆盖 `incompleteResult` 分支                       |
| P2-9  | 测试                   | primeCache 变体分不清实际走了哪条路径                        |
| P2-10 | 需求文档               | count 成本描述过时，正文写入了瞬时状态                       |
| P3-1  | 注释                   | 注释仍说叠加补丁能重建完整实体，与门控矛盾                   |
| P3-2  | 性能                   | 热路径没有惰性求值，重复分配数组                             |

## 必须修（P1，本分支引入）

### P1-1 完整性门控不看补丁改了哪些字段，无关字段更新也强制整查

- **证据**：[`incompletePredicate`](../../packages/rxdb/src/query/need_refresh_update.ts) 只检查解析后的实体有没有带齐 `requiredFields`，与本次 `patch` / `inversePatch` 的键无关：

  ```ts
  const incompletePredicate = resolvedCurrentEntities.some(
    e => !hasFields(e.patch, requiredFields) || !hasFields(e.inversePatch, requiredFields)
  );
  ```

  缓存未命中时，序列化只能拿补丁本身建实体，`{title, updatedAt}` 这样的补丁必然缺 where 列。新用例把这个行为固化成了期望：[merge_update.spec.ts](../../packages/rxdb/src/__tests__/query/merge_update.spec.ts) 里 `count 对$name采用正确的刷新策略` 的「undefined」「缺少字段」两档、`JSON 路径在$name中缺键时 count 保持正确刷新策略` 的「缺少顶层字段」档，用的都是只改 `title` 的补丁，断言 `refreshes: 1`。这几档的操作也和 AC#5「更新相关字段」对不上。

- **场景**：Tab B 挂着 `count({where: status = 'active'})` 和 `find({where: projectId = P, orderBy: createdAt desc, limit: 20})`。count 不水合实体，所以这一行不在缓存里。Tab A 每次自动保存只改 `title`，B 就对每个任务整查一次 COUNT / SELECT。main 上 `count_boundary_crossed`、`result_contains`、`match_order_by` 都是 false，一次 SQL 都不跑，而结果确实不会变。这正是 [`_recalculate`](../../packages/rxdb/src/query/merge_update.ts) 所在文件里 count 分支注释要避免的「与计数无关的变更也打一次 COUNT」。
- **后果放大**：sqlite-core 的树查询刷新走 [`addQueryCache(result, true)`](../../packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts)。按 SqliteRepository.ts 里的注释，这是「整行覆盖 + `modified` 归零」，多出来的刷新会冲掉树节点上用户还没保存的编辑。
- **修复**：只有 `keys(patch) ∪ keys(inversePatch)` 与任务读取的字段（where、orderBy，树查询再加 `parentId`）有交集时，才要求字段完整。没有交集，说明匹配状态和排序位置都没变。同时改掉上面几档用例的期望，让 AC#5 的用例改相关字段，并补一条「无关字段补丁不刷新」的反向用例。

### P1-2 关系路径 orderBy 让完整性检查恒判残缺

- **证据**：orderBy 字段也经 [`rootField`](../../packages/rxdb/src/query/need_refresh_update.ts) 取根段：

  ```ts
  ...((task.options as FindOptions<T>).orderBy?.map(order => rootField(order.field)) ?? [])
  ```

  `'owner.name'`（SQLC-025 支持的关系排序）得到 `owner`。关系不是实体实例的自有属性：它经原型上的访问器读取，外键列是 `ownerId`。所以 [`hasFields`](../../packages/rxdb/src/query/need_refresh_update.ts) 里 `Object.hasOwn(entity, 'owner')` 恒为 false，`incompletePredicate` 恒为真。

- **场景**：`findAll({where: status = 'active', orderBy: [{field: 'owner.name'}]})` 共 300 行，同 Tab 改其中一行的 `title`。main 走 `result_contains`，在 JS 里原地合并，不跑 SQL；本分支每次保存都跑一次带 JOIN 的全量 SELECT，并重新水合 300 行，所有挂着这个查询的 Tab 都一样。find / findOne / findByCursor 对页外编辑也从「不刷新」变成「每次刷新」，与 AC#6「完整快照保留原有计算路径」不符。结果仍然正确，损失在性能。
- **修复**：MANY_TO_ONE / ONE_TO_ONE 的关系根映射成该关系的外键列（如 `ownerId`），to-many 交给既有的关系规则（`uses_relations`）。

### P1-3 `whereFields` 缺 `isRule` 守卫，大写 combinator 的嵌套组抛 TypeError

- **证据**：[`whereFields`](../../packages/rxdb/src/query/need_refresh_update.ts) 把所有不是规则组的元素都当成规则去取 `rule.field`：

  ```ts
  return where.rules.flatMap(rule => (isRuleGroup(rule) ? whereFields(rule) : [rootField(rule.field)]));
  ```

  而 [`isRuleGroup`](../../packages/rxdb/src/query/query-matching.utils.ts) 只认小写：`(combinator === 'and' || combinator === 'or')`。sqlite-core 和 PGlite 的 SQL 翻译都接受 `'AND'` / `'OR'`，这样的嵌套组在这里会被当成规则，`rootField(undefined)` 抛 TypeError。另外，根段解析是新写的一套（`split(/[.:]/)`），与 [`whereUsesRelations`](../../packages/rxdb/src/query/query-relation.utils.ts) 的 `includes('.') ? '.' : ':'` 语义不同，也没有后者用的 `isRule` 守卫。

- **场景**：`where = {combinator: 'and', rules: [{combinator: 'AND', rules: [...]}]}` 在 SQL 侧能正常出结果。到了本分支，每一批命中该任务的 UPDATE 都会在计算 `requiredFields` 时抛错，[`_need_change`](../../packages/rxdb/src/repository/QueryManager.ts) 所在的 QueryManager 打出 `查询缓存合并失败，退回整查`，并多整查一次。main 只在短路求值真正走到这个元素时才会抛。
- **修复**：复用 `query-relation.utils.ts` 里带 `isRule` 守卫的遍历和根段解析，去掉两套语义。

## 建议（P2）

### US-032 范围内、新门控挡不住的既有缺陷

以下三条在 main 上就存在。它们都会让跨 Tab 增量 UPDATE 之后的活查询停在过期结果上，正是 US-032 要解决的问题。

#### P2-1 同批同 id 多条 UPDATE 拼出的前后态错位

- **证据**：[`UpdateDataCache`](../../packages/rxdb/src/query/merge-update.utils.ts) 的 `dataById` 按事件顺序后写覆盖，[`UpdateDataCache.getSerializedBefore`](../../packages/rxdb/src/query/merge-update.utils.ts) 却是先到先得（命中 `serializedBeforeCache` 就直接返回）。于是 after 来自最后一条 patch，before 是「after 叠加第一条的 inversePatch」：只被后一条改过的字段，在 before 里直接照抄 after。字段是齐的，完整性检查照样通过。前几条 patch 也从来没有落到身份缓存实例上。
- **场景**：Tab B 冷缓存，只挂着 `count({where: body = 'x'})`。Tab A 在 16ms 批处理窗口内先后保存 `title = 'ready'` 和 `body = 'x'`，B 收到一批 `[e1 {title: draft→ready}, e2 {body: shared→x}]`。after = `{id, body: 'x'}`，before = `{...after, title: 'draft'}`，两侧 `body` 都是 `'x'`：不跨界、不刷新，count 停在 0，库里是 1。热缓存的变体 `[status: inactive→active, title]` 会让缓存里的 `status` 永远停在 inactive，之后所有增量都在这个错值上判断。
- **修复**：在 `UpdateDataCache` 构造时按 id 折叠，patch 正序叠加，inversePatch 逆序叠加。

#### P2-2 `requiredFields` 漏了树查询依赖的 `parentId`

- **证据**：树插件经核心公开的 [`queryNeedRefreshUpdate`](../../packages/rxdb-plugin-tree/src/query/merge_update.ts) 走同一道门控，但 `requiredFields` 只收 where / orderBy 的根字段。冷缓存的稀疏 UPDATE 翻转 where 时会被判为完整，进入 [`handleFindDescendantsUpdate`](../../packages/rxdb-plugin-tree/src/query/merge-update-tree.ts)；[`get_tree_parent_id`](../../packages/rxdb-plugin-tree/src/query/query-tree.utils.ts) 对缺失的 `parentId` 返回 null，也就是当成根节点。
- **场景**：Tab B 挂着 `findDescendants({entityId: 'root', where: status = 'active'})`。root 下的子节点 N 不在缓存里，它的 `status` 从 inactive 改成 active，补丁是 `{status, updatedAt}`。门控看到 `status` 两侧都在，走 recalculate；`isEntityDescendant` 判定稀疏的 N 不是后代，于是不刷新，N 永远不会出现。`countDescendants` 同理少计 1。
- **备注**：本分支删掉了 roadmap 里「UPDATE 门控在实体缓存未命中时判不出 where 跨界」这一行，改由 US-032 覆盖；这个同类缺口随之失去了跟踪。
- **修复**：树任务把父列并入 `requiredFields`。按 P1-1 改成「补丁键与读取字段有交集才要求完整」时，父列同样算读取字段。

#### P2-3 脏实体的未保存值参与判定

- **证据**：解析出的 after 就是身份缓存实例。实体有未保存的编辑时，[`createEntityRef`](../../packages/rxdb/src/entity/entity-manager.ts) → [`applyExternal`](../../packages/rxdb/src/entity/entity-status.ts) → `mergeExternal` 会保留本地值，门控于是拿没持久化的值判断 SQL 活查询有没有跨界。字段是齐的，完整性检查照样通过。
- **场景**：库里 X = `{status: 'inactive', priority: 5}`，Tab B 的 `count(status = 'active' AND priority = 5)` 为 0；用户在表单里把 priority 改成 3，还没保存。Tab A 把 status 改成 active，库里计数变成 1。B 端 after = `{active, 3}`、before = `{inactive, 3}`，两侧都不匹配，不刷新，count 停在 0。之后用户 `reset()` 放弃编辑，也不会触发任何事件，计数永久过期。
- **修复**：脏实体的已编辑键与 `requiredFields` 有交集时按「未知」处理（回 SQL），或者改用实体的 origin 值判定。

### main 上的其他既有缺陷

以下四条与本分支的改动没有直接关系，新门控也挡不住。建议另立故事或登记进 roadmap。

#### P2-4 无活任务时丢弃 UPDATE，过期实体照样通过门控

- **证据**：[`_need_change`](../../packages/rxdb/src/repository/QueryManager.ts) 在 `this.#query_task_map.size === 0` 时直接 return，所以身份缓存实例只在该仓储有活任务时才接收 UPDATE。新门控把「字段存在」当成「值已知」，应用代码手里持有的实体可能字段齐全、值却已过期。
- **场景**：Tab B 用 `firstValueFrom(repo.findOne(...))` 读到 N，存进 store，任务随即被清理。Tab A 把 N.priority 从 3 改成 5，B 丢弃了这条事件。之后 B 订阅 `count(status = 'active' AND priority = 5)`，SQL 得 0，且不回填 N。Tab A 再把 status 改成 active：B 命中缓存，after = `{active, 3}`、before = `{inactive, 3}`，不跨界、不刷新，count 停在 0，库里是 1。能否复现还取决于 N 是否已被 WeakRef 回收。
- **修复方向**：没有任务时也把 UPDATE 合进缓存里已有的实例，或者让门控能识别缓存实例已经落后。

#### P2-5 缓存比迟到事件新时，拼出混合版本的前态

- **证据**：QueryManager 序列化事件时，如果缓存实例比事件新（[`isStaleEventPayload`](../../packages/rxdb/src/repository/QueryManager.ts)），就直接返回缓存实例：

  ```ts
  if (cached && isStaleEventPayload(cached, entityData)) return cached as InstanceType<T>;
  ```

  门控随后用「新状态叠加迟到事件的 inversePatch」拼出 before。字段是齐的，迟到事件真实的跨界看不见，后一条事件也看不出来。

- **场景**：N = `{active, 5}`，计入 `count(status = 'active' AND priority = 5)`。Tab A 先写 e_c（status → inactive），再写 e_x（priority → 1）。B 处理 e_c 之前，某个 find 已经把 N 水合成 `{inactive, 1}`；16ms 批处理、BroadcastChannel、`performChunk` 空闲回调都可能拉开这个窗口。处理 e_c：after `{inactive, 1}` 对 before `{active, 1}`，不跨界；处理 e_x：`{inactive, 1}` 对 `{inactive, 5}`，也不跨界。count 停在 1，库里是 0。
- **修复方向**：命中陈旧守卫的事件按「前态未知」处理，回 SQL。

#### P2-6 `_recalculate` 收到未按实体类型分离的整批事件

- **证据**：[`_recalculate`](../../packages/rxdb/src/query/merge_update.ts) 在 merge_update 末尾以 `_recalculate(task, entities)` 调用，传的是整批事件；merge_create 和 merge_remove 传的都是 `current_entities`。QueryManager 按仓储共享的依赖表放行了其他实体类型，`classifyUpdates` 对外类型的事件照样跑本任务的 where，`handleFindAllUpdate` 会把外类型实例塞进结果。门控里的 `UpdateDataCache` 也按裸 id 混存所有类型。
- **场景**：Todo 仓储上有一个 where 经关系引用 Tag 的任务，Tag 因此进入共享依赖表；另有 `findAll({where: updatedAt >= X})`。同一批里既有结果内某个 Todo 的 UPDATE（触发 recalculate），又有一个 `updatedAt` 越过 X 的 Tag UPDATE，Tag 实例就被追加进 Todo 列表。整数主键下 Todo#5 和 Tag#5 撞 id 时，Tag 的 patch 还会被应用到 Todo#5 上。
- **修复方向**：`_recalculate` 改传 `current_entities`，`UpdateDataCache` 的键带上实体类型。

#### P2-7 JSON 路径 `= null` / `!= null` 的 JS 判定与 SQL 相反

- **证据**：[`whereFields`](../../packages/rxdb/src/query/need_refresh_update.ts) 上方注释写「JSON 子键缺失是已知值」，缺键交给 [`isEntityMatchWhere`](../../packages/rxdb/src/query/query-matching.utils.ts) 判定。但对 JSON 路径，JS 侧 `isEqual(null, undefined)` 为 false，SQL 侧 `json_extract(...) IS NULL` 对缺失的键为真。JS 侧语义是既有的，但 US-032 的 AC#4「按现有 JSON 查询语义判定」与 AC#5「结果与 SQL 一致」合起来依赖它，而这在 null 比较上不成立。
- **场景**：`count({where: settings.theme = null})`，缓存里是完整行 `settings = {theme: 'dark'}`。另一个 Tab 发来 patch `{settings: {}}`、inversePatch `{settings: {theme: 'dark'}}`。门控看到 `settings` 两侧都在，不早退；after 取值为 undefined，判 false；before 是 `'dark'`，也判 false；不跨界、不刷新。但 SQL 已经把这一行计进去了，count 少 1。反过来，`!= null` 的 findAll 会留着一条 SQL 本应排除的行。新用例只测了 `= 'dark'`。
- **修复方向**：JS 侧对 JSON 路径的 null 比较按 SQL 语义把缺键当作 null，或者含 null 比较的 JSON 规则一律回 SQL；同时把 AC#5 的措辞收窄到实际覆盖的范围。

### 测试与需求文档

#### P2-8 核心单测没覆盖 `incompleteResult` 分支

- **证据**：[merge_update.spec.ts](../../packages/rxdb/src/__tests__/query/merge_update.spec.ts) 里的 `TestEntity` 没有实体元数据，`tryGetEntityMetadata` 返回 undefined，`resultFields` 恒为 `[]`。用例 `%s 没有缓存时通过 SQL 取得新匹配行的完整字段` 的 findAll 档能变绿，只是因为缺 `priority` 走了 `incompletePredicate`。
- **后果**：删掉或取反 `incompleteResult` 条件，核心测试全部照样通过，只有 wa-sqlite 浏览器端「findAll 单字段筛选…」这一条能发现。
- **修复**：补一条核心用例：实体带元数据、where 只有单个字段、补丁只含该字段。

#### P2-9 primeCache 变体分不清实际走了哪条路径

- **证据**：[live-query-cross-connection.spec.ts](../../packages/rxdb-adapter-wa-sqlite/src/__tests__/live-query-cross-connection.spec.ts) 的 `接收端只有 count，复合筛选跨界后自动重数（先收到未匹配更新：%s）` 在 `primeCache = true` 时，是 AC#3（缓存里残留残缺实体）唯一的真实双连接证据。但它没有断言第二条更新到达时，那个稀疏实体还在缓存里。身份缓存基于 WeakRef，count 任务不强引用它；一旦被 GC，就会走冷缓存分支。两条路径都会刷新到 1，用例分辨不出来。
- **修复**：第一次更新后取 `const sparse = b.entityManager.getEntityRef(ConformanceNote, id)`，断言它已定义且没有 `body`，并把这个引用一直保持到最后一次 poll。

#### P2-10 count 成本描述过时，正文写入了瞬时状态

- **证据**：[roadmap](../roadmap.md)「活 count 查询的刷新成本」一行写的触发条件是「命中 where 的 CREATE / REMOVE 与跨 where 边界的 UPDATE」。本分支之后，缺 where 字段的稀疏 UPDATE 不跨界也会重数（见 P1-1），这在只挂 count 的 Tab 上是常态。另外，roadmap 和 [status-overview](../status-overview.md) 的 US-032 行写着「affected 门禁运行中」，[US-032](../stories/core/US-032-cross-tab-update-live-query.md) 的「验证」一节写着「affected 全量门禁仍在运行，不作为当前通过证据」。
- **依据**：[CONVENTIONS](../CONVENTIONS.md)「结论必须写出复验方式」一节要求「文档只写当前结论」，派生视图回答「现在」。main 受保护，合并前门禁必然已经跑完，这三处在合并那一刻就过时了。`requirements-consistency --check` 查不出这两类问题。
- **修复**：P1-1 修完后按实际触发条件改写成本描述；三处门禁状态改成合并时的实际结论，或者删掉。

## 清理（P3）

### P3-1 注释仍说叠加补丁能重建完整实体，与门控矛盾

- **证据**：`resolvedCurrentEntities` 上方的注释说叠加 patch / inversePatch 是在「为 QueryRulesBuilder 重建完整实体」，紧接着的门控注释却是「残缺缓存不能证明更新前后的匹配状态」。`hasUnknownBefore` 的 TSDoc（「靠『更新后完整实体叠加 `inversePatch`』倒推更新前态」）和 [`UpdateDataCache.getSerializedBefore`](../../packages/rxdb/src/query/merge-update.utils.ts) 的 TSDoc 也重复了「完整」这个前提。本分支删掉了原来限定这个前提的「边界」一段，这些注释现在读起来像是无条件成立。
- **修复**：改成「用缓存实例叠加补丁，补足未改动的字段；补不齐 where / orderBy 列时，由下方门控回 SQL」。

### P3-2 热路径没有惰性求值，重复分配数组

- **证据**：`incompletePredicate` 和 `incompleteResult` 在 `hasUnknownBefore(...) ||` 之前就已经作为常量算完；`hasFields` 每次调用都 `Array.from` 复制一遍字段集（每个实体两次，本来就是数组的 `resultFields` 也复制）；`requiredFields` 和 `resultFields` 每个任务、每批事件都重建一次；`incompleteResult` 还会扫描已经在结果集里的完整实体；`uses_relations` 在早退之前计算，早退之后才用。
- **量级**：一批 200 个实体遇到 20 个活查询，单是 `incompletePredicate` 就要分配约 8000 个数组，全部发生在 `performChunk` 的空闲回调里。`RxDBChange` 的 inversePatch 是 `{}`，`hasUnknownBefore` 已经决定要刷新时，这两次扫描完全是浪费。
- **修复**：改成惰性求值（`hasUnknownBefore(...) || incompletePredicate() || incompleteResult()`），用 `for…of` 直接遍历 Set，按任务或元数据缓存字段表，跳过结果集里已有的 id。

## 未列入

- **驳回**：`task.options` 未判空就读 `orderBy`（核实不成立）；早退分支写死 `count_boundary_crossed: false`（早退时 `refresh` 已经是 true，merge_update 里 `needs_refresh = result.refresh || …` 照样刷新）。
- **低优先级、未展开**：两份新 spec 里的测试辅助函数重复；门控决定回 SQL 之前，序列化仍会把残缺实体写进身份缓存（US-032「症状与证据」已说明，归入 Out of Scope 的「通用缓存水合重构」）；两套 where 遍历的重复已并入 P1-3。
