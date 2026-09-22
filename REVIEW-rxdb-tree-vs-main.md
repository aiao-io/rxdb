# rxdb-tree 分支代码评审报告（vs main）

- **评审日期**：2026-09-22
- **分支**：`rxdb-tree`（4 个提交：`aa8e673a`、`c25455ea`、`3495c593`、`a74fdad3`），合并基 `860f882d`
- **范围**：270 个文件，+6229 / −1832 行
- **方法**：10 个评审角度 × 12 个查找 agent 并行收集 45 个候选 → 去重后 19 组对抗式验证（CONFIRMED / PLAUSIBLE / REFUTED 三态投票）→ 1 个全新视角补漏扫描

## 结论

**🔴 不建议按当前状态合并。** 有两项 P0：

1. **三个新发布包的公开 API 实际不可用**（`use-tree.ts` 的 options 类型解析为 `never`，见 [F-01](#f-01)）；
2. **插件代码被内联进四个适配器/生成器的发布产物**（external 配置缺失，见 [F-02](#f-02)）。

此外有一批增量 merge 处理器与 SQL 契约的分歧（多为存量问题随迁移原样带入，见 [F-03](#f-03) 至 [F-11](#f-11)）、一个自定义仓库静默失效的架构缺口（[F-12](#f-12)）、文档/制品问题与测试覆盖缺口。

**架构方向本身验证良好**：插件抽取的边界干净（核心不再 import 插件、插件只 import `@aiao/rxdb` 公开导出、无依赖环）、三端对称、所有跨包导入与 peer 依赖解析正确、api-baseline 与 exports 一致、CI 两个审计门禁通过。

---

## 一、P0（阻断合并）

### F-01　三端 use-tree 钩子 options 类型为 `never`，公开 API 不可用

- **位置**：`packages/rxdb-plugin-tree-angular/src/use-tree.ts:25,43,56,74`（`-react`、`-vue` 包同）
- **问题**：四个树钩子把 options 类型化为 `UseOptions<EntityStaticType<T, 'findTreeOptions'>>`，但 `'findTreeOptions'` 键在任何地方都不存在：
  - 核心 `DerivedEntityStaticType`（`packages/rxdb/src/entity/entity.interface.ts:65-73`）没有该分支，未知键终态为 `never`；
  - 插件没有为静态类型槽做 `declare module` 扩充；
  - client-generator 只生成按方法的 `findDescendantsOptions` / `countDescendantsOptions` / `findAncestorsOptions` / `countAncestorsOptions` 键。
- **后果**：对任何真实实体（生成实体如 `MenuLarge`、手写实体），`EntityStaticType<T, 'findTreeOptions'>` = `never`，`UseOptions<never> = () => never`。README 文档中的调用 `useFindDescendants(Category, () => ({ entityId: 'root' }))` 是 TS2345 编译错误。**三个新发布包的唯一对外 API 不可调用**。
- **为什么测试没抓住**：三个包的 `tri-framework-generics.spec.ts` 都手写声明了 `static [ENTITY_STATIC_TYPES]: { findTreeOptions: ... }` 槽位，只有带这个魔法槽的桩实体能编译，掩盖了与生成器输出的不匹配。
- **同类问题**：核心框架包里的 graph 钩子（`packages/rxdb-angular/src/hooks.ts:261,279,301` 用 `'findNeighborsOptions' | 'findPathsOptions'`）存在同样的潜在缺陷（存量，非本分支引入）。
- **修复建议**：钩子层直接约束为插件的公开 `FindTreeOptions<T>`（如 `UseOptions<FindTreeOptions<T>>`），而不是引用一个没有任何东西填充的注册表键；或由生成器/插件补齐该静态类型槽并加真实实体编译的契约测试。

### F-02　四个构建配置未把插件加入 external，插件代码被内联进发布产物

- **位置**：`packages/rxdb-adapter-pglite/vite.config.mts:155`、`packages/rxdb-adapter-sqlite-core/vite.config.mts:59`、`packages/rxdb-adapter-supabase/vite.config.mts:58`、`packages/rxdb-client-generator/vite.config.mts:70`
- **问题**：本分支给这四个包新增了 `@aiao/rxdb-plugin-tree` 的**运行时**导入（`assertTreeLevel`、`TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`、testing 套件的 `TreeAdjacencyListEntityBase`），四个包的 `rolldownOptions.external` 均为字面量数组、无 glob，且都未加入该包。同一列表里的其他 `@aiao/*` 运行时依赖全部外置。
- **已证实的后果**（dist 实测）：
  - `rxdb-client-generator/dist` 内联了 `//#region ../rxdb-plugin-tree/dist/index.js`；
  - `rxdb-adapter-sqlite-core/dist/testing.js` 内嵌了第二个 `TreeAdjacencyListEntityBase` 类身份（`tree-entity-base.ts` / `tree-entity.decorator.ts` / `merge_create.ts` 都被打包）；
  - pglite / supabase / sqlite-core 的 dist 里内联了 `assertTreeLevel` 的报错字符串，无任何插件 import。
- **后果**：消费者升级插件不会改变这些包的行为（构建期冻结副本）；声明的运行时依赖成为死重量；sqlite-core 的 `testing` 入口与工作区插件存在重复类身份——团队在 pglite 配置注释里已承认重复类身份是真实故障模式。
- **修复建议**：四个 external 列表各加 `'@aiao/rxdb-plugin-tree'`（或统一改用 `/^@aiao\//` 正则，与 `-react`/`-vue` 插件包的做法一致）。

---

## 二、P1（增量 merge 与 SQL 契约分歧——均为存量缺陷随迁移带入）

> 说明：以下 F-03～F-11 的代码与 `main` 上 `packages/rxdb/src/query/` 中的原件逐字节相同（仅 import 路径变更），缺陷在 main 上已存在。但本分支把这些代码提升为**新发布插件包的对外行为**，且部分缺陷落在分支自己新增的数值 id 契约上，故仍按真实缺陷报告。

### F-03　REMOVE 级联检查用真值判断，数值 id 0 的祖先被跳过

- **位置**：`packages/rxdb-plugin-tree/src/query/merge_remove.ts:42`
- **问题**：`if (ancestor?.id && removed_ids.has(ancestor.id))` —— `RxDBEntityId = string | number | bigint`，id 0 合法（分支新增的 `numeric-id-tree-merge.spec.ts` 即为此契约）。结果含 `[{id:5},{id:0,parentId:5},{id:2,parentId:0}]` 时删除节点 0：节点 2 的链走到 id 0 被真值判断吞掉，节点 2 作为断链子节点残留，再无事件移除它。
- **测试缺口**：`numeric-id-tree-merge.spec.ts` 的 DELETE 只覆盖 findAncestors；`merge_tree_remove.spec.ts` 该路径只用字符串 id。
- **修复**：改为 `if (removed_ids.has(ancestor.id))`（`traverseAncestors` 已保证 ancestor 非空，`ancestor?.` 也是多余防御）。

### F-04　同批双移动时后代判定走陈旧父链

- **位置**：`packages/rxdb-plugin-tree/src/query/tree-helper.ts:36-39`（消费于 `merge-update-tree.ts:92`）
- **问题**：`resolveParentEntity` 优先读批前 `oldResultMap`，`cache.getSerializedUpdate` 仅在 id 缺席时被咨询。同一批更新 `Y.parentId A→null` 且 `M.parentId Y→Y′`（Y′ 在结果内）时，检查 M 会从 oldResultMap 解析出 Y 仍是 `parentId=A`，误判 M 是 A 的后代而保留。**已用临时 vitest spec 实测复现**：handler 输出 `['A','M']`，正确应为 `['A']`。
- **反衬**：孤儿重查的 `resolveParent`（`merge-update-tree.ts:128-129`）顺序正确（cache → survivingMap → oldResultMap）。
- **修复**：把 cache 优先顺序统一到 resolveParentEntity；并补「一批内两个节点连续移动」的回归用例（现有 `merge-update-tree.handlers.spec.ts` 未覆盖）。

### F-05　findDescendants 锚点被重挂载后无刷新守卫

- **位置**：`packages/rxdb-plugin-tree/src/query/merge-update-tree.ts:92-97`
- **问题**：`handleFindDescendantsUpdate` 没有「目标被重挂载」守卫，而兄弟处理器 `handleFindAncestorsUpdate` 有（`:284-288` `targetParentIdChanged` + `:303-305` → `task.refresh()`）。`findDescendants({entityId:A})` 持有 `[A]`，UPDATE 把 A 的 `parentId: null→B`：`isEntityDescendant(A,A)` 沿 B 的链查找失败 → A 被移除，孤儿清扫连带剥掉链上后代。**实测**：handler 输出 `[]`、refreshCalls 0。SQL 重跑仍返回 `[A]`，实时查询丢锚点且永不恢复。
- **修复**：为 findDescendants 增加与 findAncestors 对称的 target 重挂载守卫 + 锚点恢复逻辑。

### F-06　处理器对锚点/根应用 where 过滤，SQL 不过滤

- **位置**：`packages/rxdb-plugin-tree/src/query/merge-update-tree.ts:66`（锚点）与 `:437`（count 根）
- **问题**：SQL 的锚点项（`WHERE id = ?` / 整树 `WHERE parentId IS NULL`）从不附加 where 规则组（规则只进递归成员），而处理器：
  - `:66-69` 把翻转后不匹配 where 的锚点移除（SQL 重跑保留锚点）；
  - `:437` 对整树 countDescendants 的根做 where 增减（SQL 无条件统计根）。
  - 连带：锚点 own `parentId` 变更时整个子树被孤儿清扫剥掉（见 F-05）。
- **修复**：处理器对「锚点/根」豁免 where 判定（与 SQL 同口径），并补 where + 锚点翻转的回归用例。

### F-07　findAncestors / countAncestors 新增匹配祖先不检查 level 上限

- **位置**：`packages/rxdb-plugin-tree/src/query/merge-update-tree.ts:333-345`（count 变体 `:567-639` 同缺）
- **问题**：`findAncestors({entityId:X, level:1, where:{active:true}})` → SQL `[X,P]`；深度 2 的祖父 G 翻转匹配时被无界加入（中间链可解析时）。默认 level 0（SQL 只回锚点）时任何可解析祖先都会被加入。同文件 findDescendants 路径三处都检查了 level；`merge_create.ts:57` 的创建路径也传了 level（`isAncestorOf(..., options.level)`）。
- **修复**：新增匹配循环加入 `level` 深度判定，与 findDescendants 对称。

### F-08　findAncestors REMOVE 不剪断链祖先，陈旧行残留

- **位置**：`packages/rxdb-plugin-tree/src/query/merge_remove.ts:57-63`
- **问题**：链 `T→P→X→Y`，实时 `findAncestors({entityId:T, level≥4})` 持 `[T,P,X,Y]`；物理删除 X：处理器只过滤被删 id 本身，保留 `[T,P,Y]`；SQL 重跑止于 P（P.parentId 指向已删除行）返回 `[T,P]`。Y 是陈旧行直到无关刷新。findDescendants 分支有 `traverseAncestors` 级联检查，此分支没有；`result_contains` 使 refresh 规则不可达。
- **注意**：`merge_tree_remove.spec.ts:871-926` 已把该陈旧行为钉死为预期——修 bug 时需同步改测试。

### F-09　`level === undefined` 死分支与契约相悖，测试固化错误语义

- **位置**：`packages/rxdb-plugin-tree/src/query/merge-update-tree.ts:412-417`
- **问题**：`TreeRepository.#normalizeOptions` 总把 level 归一为 0..100（`undefined → 0`），该分支在生产不可达；注释却声称「没给 level 就是『不限层级』」——与 `FindTreeOptions` 契约（`@default 0`）和 SQL 语义（`c.__level < 0` → 仅锚点）相悖。只有绕过 facade 的 harness 任务或插件作者直建任务能走到该分支，且现有 spec 把它钉为「任意深度 ±1」语义——同一任务类型两条路径语义相反。
- **修复**：删除该分支与注释，统一按归一后 level 处理；相应调整钉死错误语义的 spec。

### F-10　harness 指纹对 bigint 塌缩为常量 `['{}']`

- **位置**：`packages/rxdb/src/testing/query-task-harness.ts:41-47`
- **问题**：迁移中指纹由按类型分发改成按形状分发，标量分支 `typeof` 漏掉 `bigint`：`1n` 与 `2n` 指纹同为 `['{}']`，`QueryTask.#next` 判定未变化而抑制第二次发射（旧实现产生 `[1n]`/`[2n]` 可区分）。TSDoc 声称 bigint「真出现了就该在 getFingerprintPrimitive 处报错」，但 bigint 根本到不了那里——声称的失败模式不触发，实际是静默指纹碰撞。当前无 spec 触发（潜伏），但迁移过程中测试基础设施行为发生了退化。
- **修复**：标量分支补 `typeof result === 'bigint'`，或按 TSDoc 声称的方式显式抛错。

### F-11　parentId 变更判断两套拼写，null/undefined 语义分叉

- **位置**：`packages/rxdb-plugin-tree/src/query/merge_update.ts:33-35`（Reflect 拼写）vs `merge-update-tree.ts:76-80,165-167,284-288,297-302,456-459,605-608`（`get_tree_parent_id` 拼写，7 处内联）
- **问题**：Reflect 拼写 `null !== undefined` 判「变更」；coalesced 拼写把 null/undefined 都归一为 null 判「未变更」。仓库内有三个真实生产者能产生该分叉（ORM dirty tracking、`notifyExternalUpdate` 的 `inversePatch: {}`、PGlite 分支切换事件）。后果为单向不一致：findAncestors 全额刷新 vs findDescendants 增量路径视为无操作——过度刷新而非错误结果，属设计漂移。
- **修复**：提取唯一的 `hasTreeParentChanged(event)`（放 `query-tree.utils.ts` 的 `get_tree_parent_id` 旁），七处调用点统一。

### F-12　核心 merge fallback 丢失树类型，自定义仓库树任务静默失效

- **位置**：`packages/rxdb/src/repository/QueryManager.ts:415-425`（fallback：`#query_task_merge_*_map.get(task.type) || merge_*`）
- **问题**：本分支从核心 merge 函数删除了全部树任务 case，只有插件 `TreeRepository` 构造函数注册按类型处理器。插件对 `RepositoryQueryExtensions` 的模块扩充是**全局**的——编译期任何自定义仓库的 `createTask` 都接受 `type:'findDescendants'`；运行时无任何守卫，fallback 无匹配 case、无 refresh/recalculate 规则、无报错。首个权威结果落地后，该实时查询对后续事件永远不再发射。
- **修复建议**（择一）：(a) 未注册任务类型在 QueryManager 层显式报错（fail-fast，符合「无 fallback 兜底」铁律）；(b) 为树类型保留核心默认 merge 实现；(c) 收窄类型扩充，使非插件仓库编译期就无法发出树类型。

---

## 三、P2（设计取舍、测试覆盖、文档制品）

### F-13　TreeRepository + QueryCache 禁令对公共校验器直接调用方失效

- **位置**：`packages/rxdb/src/entity/metadata-validate.ts:539-543, 571-575`
- **问题**：旧硬编码 `metadata.repository !== 'TreeRepository'` 检查对任何调用方生效；新逻辑只在调用方传入可选 `isSyncTypeUnsupported` 查询时生效，而只有 `EntityManager.init()` 传入。外部工具直接调用 `validateEntityMetadata` 会把树实体 + QueryCache 报为干净，`init()` 稍后抛错。以 `'TreeRepository'` 名注册自定义配置且不带 `unsupportedSyncTypes` 时禁令静默消失。
- **定性**：US-025 阶段 E 的**有意设计**（核心不再认识具体仓储名），TSDoc（`:529-530`）与 spec 已文档化。但这是对外部集成方真实的静默行为变化：公共签名新增了可选第三参、规则名 `unsupportedTreeQueryCache` → `unsupportedRepositorySyncType`（按名匹配规则的工具会断）。建议在迁移文档中显式写明。

### F-14　插件 unsupportedSyncTypes 声明无端到端测试

- **位置**：`packages/rxdb-plugin-tree/src/plugin.ts:28-32`
- **问题**：该声明是禁令的唯一载体，但全仓没有任何文件把树实体与 QueryCache 组合：插件测试只用 `SyncType.None`，核心 AC#8（真实 `@TreeEntity` + QueryCache 在 init() fail-fast）被有意替换为合成 RestrictedRepository 测试。键名被改/字段被删时所有套件保持绿色，禁令静默消失。
- **修复**：在插件包补一条端到端用例（安装插件 + QueryCache 同步的树实体 + init() 断言报错）。US-025 阶段 E 验收标准里没有这条 AC，需要补上。

### F-15　文档引用未公开的 API 名

- **位置**：`website/docs/migration/tree-split.md:88,90` 与 `website/docs/plugins/rxdb-plugin-tree/README.md:76`（同句亦在 `packages/rxdb-plugin-tree/README.md:77`）
- **问题**：把 `classifyUpdates`、`invalidateEntityFingerprint` 列为 `@aiao/rxdb` 的公开导出。二者实为模块内部导出，且被契约测试 `incremental-merge-surface.spec.ts` 的 `INTERNAL_ONLY_EXPORTS` 显式钉为「不得公开」——文档与基线事实相反，用户照抄即 TS2305。
- **修复**：改为真实的公开名（`prepareIncrementalUpdate`、`getFingerprintByEntity`/`getFingerprintByEntities`/`getFingerprintPrimitive`），四处（含包 README）同步。

### F-16　提交的 review-report.md 是陈旧制品

- **位置**：`review-report.md`（仓库根，本分支提交）
- **问题**：三个 P0 全部描述已修复的导入断裂（`fixtures/query-task-harness` 旧路径、`rxdb.private` 导入、`../../RxDB` 式相对导入在 HEAD 均不存在），且在其自身提交时就已过时。「🔴 阻断」结论建立在虚假 P0 上，会误导后续评审者。其中 P1 的建议（build/lint 通过不足以证明 typecheck/test，四条验证命令仍有效）值得保留为独立检查清单。

---

## 四、效率问题（7 项，均为存量迁移带入，已确认）

所有站点与 main 原件逐字节相同，按「继承」标记。修复优先级低于上述正确性问题，但合并前值得在插件包内做一轮专项清理：

| #   | 位置                               | 问题                                                                                                                                                 | 更便宜的做法                                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| E1  | `merge_remove.ts:35-47`            | 每个 REMOVE 批次对每个幸存实体全链遍历（每实体新建 visited Set），O(N×depth)；单点删除打 10k 结果集 = ~10k 次全链遍历                                | 批次级 id 备忘 Map 或受影响的子树一次标记                          |
| E2  | `merge-update-tree.ts:122-151`     | 孤儿重查对每个幸存实体从头走链（每步最多 3 次 Map 查找 + 每实体新 visited Set），O(N×depth)；拖拽流程即触发                                          | 一次标记被移节点的后代子树                                         |
| E3  | `merge-update-tree.ts:423-463`     | countDescendants 对每实体走链两次（before/after），parentId 未变时第二次是完全重复——却先走链后判 parentId                                            | 把 `hasParentIdChanged` 提升到走链之前并复用 before 结果           |
| E4  | `merge-update-tree.ts:586-618`     | countAncestors 对批次每个候选重走同一条不变的目标祖先链，O(N×depth)                                                                                  | 走一次建 Set，候选 O(1) 查                                         |
| E5  | `merge-update-tree.ts:427,585,616` | count 处理器每事件重算 `isEntityMatchWhere`，而 `classifyUpdates` 已把同样结果算进 `classification.matchBeforeIds/matchNowIds`（参数传入但从未使用） | 改读 classification 集合，删除 where 参数                          |
| E6  | `merge-update-tree.ts:199-202`     | newlyMatched 成员检查每事件两次线性 `.some()` 扫描，O(N×M)                                                                                           | 维护 Set（其中一次扫描严格冗余：push 时已同步 `oldResultMap.set`） |
| E7  | `merge_create.ts:34-37`            | 每 CREATE 批次把旧结果集物化两次（Array.from + spread 再拼接）只为建查找 Map                                                                         | `buildEntityMap` 直接消费 Set.forEach + 批次数组                   |

## 五、清理与架构（9 项确认，1 项驳回）

**C1　`IRepositoryConfig.mergeOperations` 是死通道**（`packages/rxdb/src/rxdb.types.ts:68`、`entity-manager.ts:98`）。写方两个（核心 + graph 插件），读方为零（分支自己的 TSDoc 承认）；真正生效的是 `QueryManager.registerMerge*Fn` 构造器注册。`rxdb.types.ts:80-89` 的 `@example` 仍展示 `mergeOperations` 仿佛生效，误导插件作者。建议删字段或让 QueryManager 消费它，二选一。

**C2　`merge_remove.ts:30,52` 死代码**：findDescendants 分支把 options 强转为 `FindAllOptions<T>` 读 `orderBy` 并调用 `calculateOrderBy`，但 `FindTreeOptions` 不声明 orderBy，排序永不可达（注释自己承认）。删除强转/import/注释。

**C3　`merge-update-tree.ts:563-580` 无行为缓存**：`ancestorCache` 的条目在同一迭代内计算并消费、函数返回即弃；对重复 entityId 的 ±1 累加并不去重，注释「避免重复计算」名不副实。改为普通局部变量。

**C4　三端 use-tree 钩子映射三份复制**（`use-tree.ts:23-76` ×3）：四组 `(方法, 默认值)` 映射逐字节相同，且 `useRepositoryQuery` 的 `method` 参数是裸 string（拼错编译不报）。提取到 `packages/rxdb-plugin-tree/src/constants.ts` 单一导出。

**C5　entityBaseModuleSpecifier 解析四处实现**（`entity-definition.ts:71-78`、`RepositoryGeneratorBase.ts:106-112`、`RxDBClientGenerator.ts:490,534`）：同一「哪个模块持有实体基类」逻辑四份，失败模式不一（一处抛错、两处静默落回 `@aiao/rxdb`）。提到 `RxDBClientGenerator.utils.ts` 一处。

**C6　三个互相独立的树深度上限**：`tree-helper.ts:7` `MAX_TREE_DEPTH=100`（私有）、`tree-level.utils.ts:10` `TREE_MAX_LEVEL=100`（公开契约）、`query-tree.utils.ts:31` `traverseAncestors` 默认 `maxDepth=1000`。提高文档化 level 契约不会传播到另两个守卫。统一导入 `TREE_MAX_LEVEL`。

**C7　四个树任务类型硬编码在七处**：`constants.ts:13`、`tree-query.interface.ts` 四个接口字面量、`TreeRepository.ts:46-52`（_STATIC_METHODS）与 `:77,90,107,120`（createTask 字面量）、`merge_create/update/remove` 的 switch case。加第五种树查询要同步改七处，漏一处静默落回核心默认 merge。从接口字面量派生单一来源。

**C8　三个 SQL 适配器把「可选」插件硬依赖**（`rxdb-adapter-pglite/package.json:73` 等）：导入的不只是类型，还有运行时的 `assertTreeLevel`——插件成为 sqlite/pglite/supabase 用户的强制安装，插件版本与适配器版本可脱节。建议适配器只保留类型依赖，或把契约常量移到双方都依赖的中立位置。

**C9　findAncestors 毯式刷新守卫使内层精确检查成为死代码**（`merge_update.ts:83-86` vs `merge-update-tree.ts:284-302`）：任何实体的 parentId 编辑都全额 SQL 刷新，`targetParentIdChanged`/`anyTrackedAncestorMoved` 在生产流程不可达（只有直调 handler 的单测能触达）。**但**该守卫同时是「移入链内」正确性场景的唯一兜底——不能简单删除，应把内层检查并入守卫语义或显式标注「兜底」。

**C10（驳回）** `merge-update.utils.ts` 的 `classifyUpdates` 可注入参数与 `prepareIncrementalUpdate` 的 `RT` 参数「过度参数化」：验证驳回——`classifyUpdates` 根本不在 api-baseline 中且被契约测试钉为内部导出；`RT` 出现在签名中用于约束 `task: QueryTask<T, RT>` 并可由调用方推断，非死参数。

## 六、规范符合性（AGENTS.md / CLAUDE.md）

- **TSDoc 缺失（新包新导出，违反「新包/新导出必须补齐 TSDoc」）**：
  - `packages/rxdb-plugin-tree/src/plugin.ts:15`（`RxDBPluginTree` 类）与 `:66`（`rxDBPluginTree` 工厂）——两个名字都在 api-baseline 中；
  - `packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts:20`（`TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`）。
  - 附：`packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts:96-98` 的「共享工具：添加静态查询方法」JSDoc 块悬空在 `addTypeImport` 自己的 doc 块之上（其真正目标 `addStaticMethod` 没有 doc），typedoc 会挂错成员。
- **嵌套 > 3 层**：`merge-update-tree.ts:93`（五层）——存量迁移带入，无 max-depth ESLint 规则可拦。
- **fallback 兜底模式**：`merge-update-tree.ts:88` 序列化缺失时退回 patch 合成实体——存量迁移带入，有注释说明理由，但违反「无 fallback 兜底」铁律。
- **覆盖率门槛缺失**：`packages/rxdb-plugin-tree/vite.config.mts:108-115` 无 `thresholds` 块，而结构上最近的同类 `rxdb-plugin-search` 有 80/80/80/80（RXD-043「让 Nx target 自己变红」）——删除测试或分支失守时 `nx test` 保持绿色，只有 `scripts/audit/coverage-baseline.json` 漂移检查事后才抓得到。注：graph/history/querycache 同样缺，属多数派模式，但新包宜对齐最近的同类。

---

## 七、已驳回的候选（避免重复报告）

| 候选                                                                                     | 结论         | 理由                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| merge_create 创建锚点不补祖先/后代、不匹配 where 的锚点被过滤（`merge_create.ts:26,56`） | **REFUTED**  | 树实体自引用关系使每个 CREATE 都经 `match_relation_where` 走 `task.refresh()`（实测 `queryNeedRefreshCreate`），增量路径在生产不可达；单测只有靠无 metadata 的 harness 才走到增量分支。**附带观察**（建议记录）：插件的 CREATE 增量路径对标准树实体是生产死代码，且单测的 harness 保真度不足——是测试保真度缺口，不是声称的 bug。 |
| `merge_update.ts:83` 守卫是纯浪费、应删除                                                | **部分修正** | 守卫确实让内层检查成为死代码（见 C9），但它同时是「移入链内」场景的唯一正确性兜底，删除会重新引入陈旧结果缺陷。                                                                                                                                                                                                                  |
| `use-tree` 发现中的 `'findTreeOptions'` 问题仅限生成实体                                 | **修正**     | 手写实体同样中招（不声明槽位即 never），且 graph 钩子存在同类潜在缺陷。                                                                                                                                                                                                                                                          |

## 八、验证通过的方面（干净清单）

- **迁移保真度**：所有移动文件与 main 原件逐字节一致（仅 import 路径变更），守卫、决策表、数值 id 处理均保留；10 个被删树 spec 在插件中原样存在。
- **边界干净**：无核心→插件 import；插件只 import `@aiao/rxdb` 公开导出；`unsupportedTreeQueryCache` → `unsupportedRepositorySyncType` 的泛化方向正确；无依赖环。
- **跨文件追踪（角度 C 全绿）**：所有 `@aiao/rxdb-plugin-tree` import 可解析、无 stale harness 导入残留、无引用已删符号的消费者、peer 依赖版本匹配、generator 三文件互相一致。
- **三端对称**：`use-tree.ts` ×3、`index.ts` ×3、generics spec ×3 除框架名外逐行等价；hooks 移除对称。
- **缺失插件守卫**不可绕过（`missing-plugin-error.spec.ts` 覆盖），merge 处理器注册幂等，插件 install/uninstall scope 守卫正确。
- **CI 门禁**：`api-surface.mjs` 与 `requirements-consistency.mjs` 通过；api-baseline 与 exports 一致；新包覆盖率已登记且高于 80%（93/90/97/94，三框架绑定 100）；无 TODO/FIXME/console.log/.skip/.only。
- **demo 应用**：所有注册树实体的 setup 文件都补了 `.use(rxDBPluginTree)`；未用树实体的应用不受影响。

## 九、修复优先级建议

1. **合并前必做**：F-01（钩子类型）、F-02（external 配置）、F-12（fallback 缺口）、F-15/F-16（文档与陈旧制品）。
2. **合并前强烈建议**：F-03（数值 id 0，落在本分支新增契约上）、F-05/F-04（实测复现的陈旧结果）。
3. **跟随修复（存量带入）**：F-06～F-11——作为插件包正式对外发布前的契约对齐专项；F-14 补端到端用例。
4. **可延后**：E1-E7 效率项、C1-C9 清理项、TSDoc/嵌套/fallback 规范项——建议开独立清理 PR，避免与契约修复混在一起。
5. **保留 review-report.md 中仍有效的部分**：P1 的四条验证命令清单（build/lint 通过不足以证明 typecheck/test）与「变更边界不清晰」提醒。

---

_本报告由 10 角度 × 12 查找 agent + 19 组对抗式验证 + 1 轮补漏扫描生成；关键缺陷（F-04、F-05、F-12 的静默失效、E 系列复杂度）均经源码级或实测级验证。_
