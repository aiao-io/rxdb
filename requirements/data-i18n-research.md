# 数据国际化 / 本地化研究（@aiao/rxdb 场景）

> 本文是 US-910 的设计依据，不是用户故事。结论已经收敛：生产方案采用**每个实体 × 每门语言一张翻译表（C-L）**；单表 + `locale` 列（C）只作为阶段 A 对照实验，不进入阶段 B 公共 API。

## 1. 范围与术语

数据国际化必须拆成四件事：

| 事项         | 定义                                       | 本故事是否负责         |
| ------------ | ------------------------------------------ | ---------------------- |
| 数据内容翻译 | 同一实体的标题、标签等字段按语言存多份值   | 是                     |
| 格式本地化   | 日期、数字、货币和应用层排序               | 否，引擎保持字节序合同 |
| UI 文案翻译  | rxdb-model 自身的菜单、表头和提示语        | 否                     |
| 语言协商     | 请求语言、设备偏好和默认语言的 fallback 链 | 是，限设备级数据读取   |

“翻译是一等同步数据”意味着：翻译行可以离线写入、进入 changelog、push/pull、参与冲突解决，并且删除语义不能依赖“远端自己猜”。

## 2. 当前仓库能力盘点

### 2.1 Schema 与迁移

- 实体 schema 是 `@Entity({ properties, relations, indexes })` 元数据，不是 JSON Schema。
- `RxDB.#ensureEntityTables()` 能补建缺失实体表，但没有通用的业务表列迁移路径。
- 库级 `MigrationType` 可以执行显式迁移；给已发布业务表自动补列不是现有能力。
- 因此，“新增翻译实体不需要改主表”可以成立；“把既有 `Recipe.title` 自动迁出且零迁移”不成立。
- 阶段 A 必须使用语言无关的新试点主实体，或者另立字段搬迁故事。

证据：`../packages/rxdb/src/RxDB.ts` 的建表与 migration 流程、`../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts` 的缺失表补建路径。

### 2.2 同步

同步策略包括 `Full`、`Filter`、`QueryCache` 和 `None`。

- `Full` 是本地 changelog 与远端变更的双向版本化同步。
- `Filter` 的 `remote.filter()` 在 pull 和过期清理时生效。
- Filter **不限制 push**；现有测试明确要求 Filter repository 仍然 push 本地变更。
- Filter 每个实体只有一条 `RxDBSync.lastPullRemoteChangeId` 水位，不能把“切换过滤集合”当成自动基线补拉。
- `cleanupExpired()` 使用受信 merge 删除本地过期副本，不产生用户 changelog；它适合缓存清理，不适合替代远端删除。
- `SyncDisabled` 没有 local/remote 主适配器。它适合完全不参与同步的内部表，不适合需要参加跨实体业务事务的本地翻译表。
- `RxDBSync.enabled` 是现有的实体同步启停开关，适合 C-L 的“语言表启用/停用”；不需要运行时改写实体 metadata 或重建 repository。

证据：

- `../packages/rxdb/src/entity/sync-options.interface.ts`
- `../packages/rxdb/src/entity/primary-adapter.ts`
- `../packages/rxdb-plugin-sync/src/sync-repository.ts`
- `../packages/rxdb-plugin-sync/src/pull-repository.ts`
- `../packages/rxdb-plugin-sync/src/cleanup-expired.ts`
- `../packages/rxdb/src/system/sync.ts`

### 2.3 HTTP 与同步测试基础设施

`../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts` 当前 v1 只支持 `SyncType.QueryCache`。`../apps/dev-rxdb-http-server/README.md` 也明确说明该服务没有 Full/Filter 同步、离线写队列和冲突解决。

因此：

- US-910 的 A3/A4/A5/A6 不能把 `dev-rxdb-http-server` 当作同步远端；
- HTTP 协议 demo 可以继续验证 QueryCache 合同，但必须与 US-910 的 Full/Filter/tombstone 夹具分开；
- 阶段 A 需要新的同步测试服务或现有 sync plugin 的完整远端夹具。

### 2.4 搜索

搜索插件扫描 `config.entities` 中的 `searchable` 字段，在连接期安装 FTS/PG 搜索后端。

- C-L 的每门语言是独立 collection，搜索可以用现有 `collections` scope 按语言表筛选。
- C 单表的 locale 是普通行字段，现有搜索 API 没有 locale where predicate；不能宣称“C 天然按语言过滤”。
- 搜索原生结果是翻译行 id，不是主实体 id。i18n 必须提供结果映射，至少返回 `entityId`、`locale`、`fieldName`、`snippet`。
- 生成翻译实体必须在搜索插件扫描之前进入 `config.entities`，否则不会建索引。
- SQLite FTS5 和 PGlite 搜索按 US-702 / US-703 的适配器能力矩阵验收，不把所有适配器都假设成支持 FTS5。

### 2.5 现有 Recipe

`modules/recipes-domain` 的 `Recipe` 当前是 HTTP QueryCache 示例，主表仍含 `title` 和 `tag`。它不能直接作为 US-910 的语言无关主表试点，否则会同时引入：

- 已有字段和翻译表的双重权威；
- 已发布库字段搬迁；
- QueryCache 与翻译 Full sync 混用；
- HTTP demo 合同被意外改变。

阶段 A 使用新的 `LocalizedRecipe` 或等价试点实体，现有 Recipe 保持行为不变。

## 3. 方案空间

### 3.1 内嵌映射 / 每语言主表列

排除原因：

- 多设备写不同语言仍落在同一个实体 LWW 冲突域；
- 增加语言会碰到主表 schema 或迁移；
- keyValue/json 不能稳定进入现有 searchable 白名单；
- 既有主实体 API 会把默认语言和业务实体身份绑定。

### 3.2 C：单张翻译表 + `locale` 列

形状：

```text
Translation {
  id,
  parentId,
  fieldName,
  locale,
  value,
  ...audit fields
}
```

优点：加语言是数据写入，不需要新表。缺点：

- 现有 Filter 只过滤 pull，不过滤 push；
- locale 集合变化需要独立 watermark 或重新基线；
- cleanup 后再次启用 locale 可能从旧 watermark 继续，拿不到历史行；
- 现有搜索 API 无法直接按 locale 过滤；
- 搜索结果需要从单表翻译行映射回主实体。

结论：保留为阶段 A 研究对照，不作为阶段 B 生产 strategy。

### 3.3 C-L：每门语言一张翻译表

形状：

```text
LocalizedRecipeZhHans {
  id,
  parentId,
  fieldName,
  value,
  ...audit fields
}

LocalizedRecipeEn {
  id,
  parentId,
  fieldName,
  value,
  ...audit fields
}
```

优点：

- 不同语言天然处于不同实体/行的冲突域；
- 加语言只需要新增实体表，不改主表列；
- 每门语言可以用现有 `RxDBSync.enabled` 独立启停；
- 搜索天然按 collection 分语言；
- 每张表可以用 `(parentId, fieldName)` 做自然唯一键。

成本：

- 实体数量随语言增加（阶段 A 有实体数量压力探针兜底，见 §7）；
- fallback 需要跨 repository 查找；
- 删除必须覆盖未启用但本地保留的语言表；
- 迟到翻译更新必须在客户端合并层丢弃（见 §6.4），远端保持通用。

结论：这是 US-910 的生产方案。**每语言一张表 = 每实体独立 `RxDBSync.enabled` 与独立
`lastPullRemoteChangeId`**，按语言启停同步、独立水位、独立冲突域全部免费获得，`rxdb-plugin-sync`
零改动。

### 3.4 多态单语言表（C-L 合并实体维度）

形状：每种语言一张表服务**所有**可翻译实体：

```text
TranslationZhHans {
  id,
  parentType,  // 指向哪个主实体
  parentId,
  fieldName,
  value,
  ...
}
```

优点：L 张表而非 E×L 张；新增可翻译实体是纯数据写入。

成本：

- `parentId` 是多态引用，失去 FK 与 DB 级联兜底——删除安全完全依赖 i18n 删除事务的正确性；
- 失去实体粒度同步控制与水位隔离（水位按语言表计，一门语言的一张表挂掉影响所有实体）；
- 搜索需要 `parentType` 过滤；
- 迟到更新的孤儿判定要做 `parentType + parentId` 双查找。

结论：**不采用，留作降级路线**。只有 §7 的实体数量压力探针实测超预算时才重新审议。

## 4. C-L 数据模型

### 4.1 生成实体

`@Translatable` 是声明，不在装饰器执行时偷偷修改 RxDB 配置。推荐流程：

```ts
@Entity(LOCALIZED_RECIPE_SCHEMA)
@Translatable({
  fields: ['title', 'tag'],
  locales: ['zh-Hans', 'en'],
  defaultLocale: 'en'
})
class LocalizedRecipe extends EntityBase<string> {}

const translationEntities = createTranslatableEntities(LocalizedRecipe);

const db = new RxDB({
  entities: [LocalizedRecipe, ...translationEntities]
});
```

`createTranslatableEntities()` 必须在 `RxDB.init()` / `SchemaManager.init()` 之前完成。生成实体在连接期只作为普通 `config.entities` 被建表和被搜索插件扫描。

### 4.2 翻译行

每行代表一个实体、一个字段、一门语言的一个翻译值。

```text
id          string primary key
parentId    主实体 id，非空 FK
fieldName   string
value       string
createdAt   date
updatedAt   date
```

约束：

- `id` 必须是 `(parentId, fieldName)` 的可证明无碰撞编码，禁止直接未转义拼接 `:`；
- `parentId + fieldName` 唯一；
- `fieldName` 必须在 `fields` 白名单内；
- 只支持 `string`、`enum` 和明确约定的 nullable string；JSON、keyValue、任意数组在构造期拒绝；
- locale 只存在于实体/表身份，不写进 C-L 行，也不使用 locale enum；
- locale 先用 `Intl.getCanonicalLocales()` 规范化；同一实体内不能出现 canonicalization 后重复的 locale；
- 生成的 parent relation 使用 `MANY_TO_ONE + ON DELETE CASCADE`，但 DB cascade 只作兜底。

### 4.3 兼容性

US-910 支持的主实体必须已经是语言无关 schema。对已有 `title` / `tag` 等主表字段：

- 不自动删除列；
- 不自动搬迁存量数据；
- 不同时把主表和翻译表当作两个权威；
- 需要另一个库级 migration story 定义 backfill、双写窗口、回滚和旧客户端兼容。

## 5. Locale 与 fallback

### 5.1 三种 locale 状态

- `deviceLocale`：浏览器/宿主探测结果，运行时值，不同步；
- `devicePreferredLocale`：用户在本设备选择的显示语言，默认 local-only；
- `syncLocales`：本设备允许参与远端同步的语言集合，显式配置，不从当前显示语言隐式推导。

US-910 不把设备 A 的语言选择同步成设备 B 的语言选择。

### 5.2 fallback 契约

优先级：

```text
显式请求 locale
→ 设备显式偏好
→ 设备 locale
→ defaultLocale
```

`resolveTranslation()` 返回：

```ts
{
  value: string | undefined;
  requestedLocale: string;
  matchedLocale: string | undefined;
  isFallback: boolean;
}
```

- 缺失行和空字符串不同；
- 空字符串是已存在值，不触发 fallback；
- 完整 fallback 链无命中返回 `value: undefined`；
- BCP 47 的父语言降级规则在纯函数中固定并测试；
- fallback 链去重，不能因调用方传入重复语言造成重复查询。

## 6. 同步、切换与删除

### 6.1 C-L 启停（无 profile 机械）

所有语言翻译实体都配置本地主适配器并采用 Full sync 类型。语言是否参与远端同步由对应 `RxDBSync.enabled`
控制。**C-L 下「语言集合变化」不需要任何 profile key / 独立 watermark API**——每语言实体本来就有独立
水位（`RxDBSync.lastPullRemoteChangeId`，[`system/sync.ts`](../packages/rxdb/src/system/sync.ts)）：

- 新增语言：新实体，自己的水位从 0 开始全量拉历史数据；
- 停用：`enabled = false`，只停止 push/pull，本地主 repository 与事务能力保留；
- 重新启用（retain）：从该实体自己的水位继续，语义天然正确，不存在「旧全局 watermark」问题
  （那是 C 单表的病灶，C-L 没有全局水位）；
- 重新启用（purge）：重置该实体水位（`lastPullRemoteChangeId` 置 null 的写入路径在
  [`sync-record-utils.ts`](../packages/rxdb/src/sync-contract/sync-record-utils.ts) 已存在）+
  `cleanupExpired` 本地清理；purge 不产生用户 DELETE changelog；
- 停用不自动产生用户 DELETE changelog；
- 失败保留可重试状态，不把空本地表报告为同步成功。

### 6.2 启停语义（替代原 Profile 变化）

原「profile 变化」的五个步骤随 C-L 一并消失：新增/移除语言集合的计算就是 enabled 开关集合的 diff，
补拉靠新实体的自然水位，UI 状态按 pull 完成事件上报。若阶段 A 实测发现 retain 语义有缺口（预期没有），
再另立 sync 故事，不在 i18n 包里复制 watermark 逻辑。

### 6.3 创建顺序

主实体和初始翻译行必须在同一个本地事务中写入。同步拉取顺序必须父先子后；翻译行暂时找不到父实体时，读 API 返回缺失而不抛出结构错误，最终由父行拉取完成收敛。

### 6.4 删除顺序

i18n repository 的删除事务顺序固定为：

1. 读取主实体关联的全部语言翻译行；
2. 显式删除全部翻译行；
3. 删除主实体；
4. 同一事务提交 changelog 和 FTS 触发器变更。

直接使用不具备 i18n 删除契约的 repository 删除已声明 `@Translatable` 的主实体必须 fail-fast。DB FK cascade 只能防止本地残留，不能替代显式 changelog。

**远端不承担任何父子感知。** 删除经客户端显式逐行 changelog 推送（push 按依赖图拓扑序、DELETE 相位子先父后，
[`cascade-blocking.ts`](../packages/rxdb-plugin-sync/src/cascade-blocking.ts) 的 `requiredBy` 边），
远端只是薄通用 changelog 存储。迟到翻译更新的处理完全在客户端合并层：

- pull 按依赖图拓扑序合入（父先子后，[`topologicalSortForPull`](../packages/rxdb-plugin-sync/src/pull-batch.ts)）；
- **子行变更合入时父行已本地删除 → 丢弃该变更**（写入诊断计数，不写本地 changelog），数据不复活；
- 父行尚未拉到 → 整批单事务回滚、水位不推进、下轮重试（现有事务语义，不丢数据）。全量同步的因果序
  （父创建必然先于子创建进入 changelog）保证该情形罕见；
- 引擎事务内 `defer_foreign_keys = ON`（[`RxDBAdapterSqliteBase`](../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)）
  意味着 FK 违规在 COMMIT 才暴露、会卡死整批水位——所以「丢弃」必须发生在 action 构建期，不能靠 FK 报错兜底。

阶段 A 第一项核实：pull 合并器对「父行缺失的子行变更」的现有实测行为与本模型一致；不一致则先修正模型。

## 7. 搜索与查询

- 搜索范围按 C-L collection 选择语言；不新增单表 locale where 的假能力。
- i18n 搜索 API 必须把原生翻译行结果映射为：`entityId`、`locale`、`fieldName`、`rank`、`snippet`。
- 删除主实体后，翻译 collection 和 FTS 结果都必须消失。
- fallback 读取和列表查询必须避免一对多 join 造成主实体重复；按默认语言排序必须有稳定的分页测试。
- 主表派生镜像列不是默认方案；只有查询正确性已证明、性能基准超预算时才另立决策。

## 8. 阶段路线

### 阶段 A：方案验证

- 新的语言无关试点实体；不改现有 Recipe。
- **第一项核实**：pull 合并器对「父行缺失的子行变更」的现有行为（§6.4 模型的前提）。
- **实体数量压力探针**：生成 100 个翻译实体度量 init / connect / 首次搜索，给 E×L 定案或触发 §3.4 降级。
- **薄通用 Full-sync 参考夹具**（按实体存 changelog + pull/push 端点 + LWW，无父子智能），
  建议拆为独立故事先行交付；本地 AC（建模、fallback、搜索、id 生成、分页、孤儿规则单测）不依赖夹具、可先行。
- C-L 完整验证；C 只验证 push、watermark、搜索过滤限制并记录为对照结果。
- 双本地库、远端历史数据、切换语言、部分同步删除、迟到更新和 FTS 全部纳入测试。

### 阶段 B：插件

- `@Translatable` metadata + `createTranslatableEntities()`；建表前注册。
- C-L 翻译实体、i18n repository、删除事务、fallback、搜索映射、合并期孤儿规则。
- 三端只共享核心输入输出契约，不强求 Angular/React/Vue 使用同一种生命周期 API。
- sync plugin 默认零改动；仅当 A13 核实结果要求合并层钩子时新增最小扩展点。

## 9. 决策记录

1. 生产表粒度选 C-L；C 只做研究对照；多态单语言表（§3.4）留作实体数量超预算时的降级路线。
2. US-910 不修改已发布 Recipe 的 `title` / `tag` schema；字段迁移另立故事。
3. `dev-rxdb-http-server` 不承担 US-910 的 Full/Filter 同步验收；同步参考夹具是薄通用服务（无父子智能），建议拆独立故事。
4. 语言启停就是每语言实体的 `RxDBSync.enabled` 开关：新增语言靠新实体的自然水位全量拉，retain 从原水位继续，
   purge 重置该实体水位 + `cleanupExpired`；不引入任何 profile key / 独立 watermark API，sync plugin 零改动。
5. 设备 locale 与同步语言集合不自动同步到其他设备。
6. 「迟到翻译更新不复活」在**客户端合并层**解决：父行已本地删除 → 丢弃子行变更；父行未到 → 整批回滚下轮重试。
   远端不产生级联 tombstone、不拦截。FK 的 COMMIT 期违规会卡死整批水位，因此丢弃必须发生在 action 构建期。
7. 生成实体必须在 `SchemaManager.init()` 之前进入 `config.entities`。

## 参考

- 本仓库：[US-910](stories/future/US-910-data-i18n.md)、[US-702](stories/future/US-702-full-text-search.md)、[US-703](stories/future/US-703-pglite-full-text-search.md)、[US-028](stories/core/US-028-sortable-entity.md)、[US-030](stories/core/US-030-declarative-storage-constraints.md)
- 代码：`../packages/rxdb/src/RxDB.ts`、`../packages/rxdb/src/schema/SchemaManager.ts`、`../packages/rxdb-plugin-sync/src/pull-repository.ts`、`../packages/rxdb-plugin-sync/src/cleanup-expired.ts`、`../packages/rxdb-plugin-search/src/plugin.ts`
- 外部：[RxDB schema](https://rxdb.info/rx-schema.html)、[localize_translate](https://hex.pm/packages/localize_translate/0.1.0/files/guides/translatable_database_systems.md)、[emdash i18n PR](https://github.com/emdash-cms/emdash/pull/916)
