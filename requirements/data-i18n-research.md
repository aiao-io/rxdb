# 数据国际化 / 本地化研究（@aiao/rxdb 场景）

> 研究文档，不是用户故事。回答一个问题：**在本地优先 + 多端同步的 @aiao/rxdb 语境里，
> 实体上的人类可读字段要支持多语言，应该怎么建模、要不要为此新增引擎/插件机制。**
> 结论先行：**翻译内容是一等公民的同步数据**；推荐做法是**主表只留语言无关字段、
> 全部可翻译文本按语言进翻译表**（「每语言一张表」与「单表 + locale 列」两种表粒度
> 暂缓定案，阶段 0 手写实测后在实际工作中决策，插件两种都生成），由一个新的
> `@Translatable` 声明式插件生成翻译实体与三端绑定，Angular / React / Vue 三端都要演示。
> 决定性论据仍是同步冲突粒度（见 5.1）。

## 1. 范围与术语

「国际化 / 本地化」在数据层实际是四件事，本仓库现状各不相同（证据见第 2 节）：

| # | 事 | 定义 | 落点 |
| - | - | - | - |
| 1 | **数据内容翻译** | 实体字段按语言存多份值（Recipe 标题的中文/英文/法文） | 实体 schema、同步、查询、搜索 —— **本文主角** |
| 2 | 格式本地化 | 数字/日期/货币/排序按 locale 呈现 | 应用层 `Intl`，引擎合同是字节序（见 5.5） |
| 3 | UI 文案翻译 | 组件自身的菜单/标签/表头翻译 | rxdb-model 组件现全硬编码中文，独立问题 |
| 4 | 语言协商 | 请求 locale → 用户偏好 → 默认语言的 fallback 链 | 应用层，先例是 electron 的 `resolveLocaleId` |

**范围声明**：第 1 类的翻译内容**必须是参与 RxDB 同步的一等数据**——离线可写、
进 changelog、走 push/pull、参与冲突解决，和主实体字段没有区别。不做「翻译只在
服务端、客户端只读」的假设；如果某个场景翻译确实远端权威（如机翻缓存），那是
`SyncType.QueryCache`（远端权威 + 本地行缓存）的用武之地，不是本方案的默认形态。

## 2. 现状盘点

### 2.1 引擎侧积木（`@aiao/rxdb`）

**没有 JSON Schema，也没有 Mango 前缀**——「schema」是 `@Entity({ properties: [...] })` 的
元数据数组，由 `SchemaManager` 登记、建表 SQL 由适配器生成。

- **嵌套对象字段两种**（`property-types.interface.ts`）：
  - `PropertyType.keyValue`（`KeyValueProperty`）：整体一列，**键必须预声明**
    （`properties: KeyValuePropertyMetadata[]`，键值限 `string/number/integer/date/boolean`）。
    支持点路径查询（`_try_process_top_level_flatmap` 走 `json_extract(col,'$.key')`），
    JS 侧增量匹配用 lodash `get` 对齐同一语义。限制：键本身含点号无法区分嵌套路径——
    BCP 47 locale 标签（`zh-Hans`）不含点号，作键安全。entity-table 有现成
    `key-value-editor`（通用 KV 编辑器，不是翻译编辑表单）。
  - `PropertyType.json`（`JSONProperty`）：任意结构，**无结构校验、不可索引、不能按元素查询**。
- **查询算子全集**（`repository/query.interface.ts:136-157`）：
  `= != < > <= >= contains notContains startsWith notStartsWith endsWith notEndsWith
  null notNull in notIn between notBetween exists notExists`，规则组支持 `and/or` 嵌套。
  **没有 regex、没有大小写不敏感**（`query_sql.utils.ts:374-417`，决策注释 SQLC-007，
  子串走 `instr()/substr()` 二进制比较）。点路径（关系穿透与 keyValue）可查询、
  可作 `orderBy` 排序键；`FindOptions.projection` 支持列选择。
- **索引**：实体级 `indexes: [{ name, properties: string[], unique, normalized }]`，
  复合索引可用。
- **schema 演进：没有 per-entity 版本与迁移策略。** 抓手是库级 `MigrationType`
  （`rxdb.interface.ts:20-47`：`{ name, up(executor), down() }`，经 `config.migrations`
  声明，`migration-runner.ts` 按 name 排序 + 唯一键 INSERT 认领执行权）。**已有业务表补列
  没有通用路径**：建表走 `RxDB.#ensureEntityTables` 只补**缺失的表**（整表 CREATE，
  `RxDBAdapterSqliteBase.ts:810` 注释），列级演进全是系统表手写专用函数
  （`ensureChangeRejectionColumns`、`ensureBranchActiveKey`）——元数据给已有实体加属性，
  不会自动 `ALTER TABLE`。**新增实体则零迁移成本**，新旧库同一条建表路径。
- **同步**：changelog 操作日志（`rxdb_change` 表的 `patch/inversePatch`），push = 待推变更集，
  pull = 远端变更套用为动作集。冲突侧：
  - 自定义 `ConflictResolver` hook 存在（`sync-contract/conflict.ts:53-90`），默认
    `LWWConflictResolver`（`createdAt` → `clientId` 字典序 → 本地优先）。
  - 运行时**只自动应用 `KEEP_LOCAL`/`KEEP_REMOTE`**；返回 `MERGE`/`DEFER` 派发
    `ConflictPendingEvent` 并**整轮回滚（fail-closed，水位线不推进）**，正确用法是应用侧
    合并后以普通本地写落库再 pull。
  - **字段级合并：没有内置**，三方合并的 `base` 只是可选数据。
- **同步策略按实体配置**（`entity/sync-options.interface.ts`）：
  `SyncType { Full, Filter, QueryCache, None }`，解析优先级「实例覆盖 > 实体 `sync` >
  库级默认」（`entity-sync-resolver.ts:79-96`，覆盖是构造时固化的 `ReadonlyMap`）。
  - `Filter`：`remote.filter: () => RuleGroup` 是**运行时求值的闭包**，
    「拉取与过期清理都按 `remote.filter()` 取子集」（接口文档原文）——
    `cleanup-expired.ts` 负责清理**不再满足 Filter 条件的本地行**。
  - `None` 有三个变体：`Local`（只本地）、`Remote`（只远端）、`SyncDisabled`
    （完全不参与同步，显式阻止推送与拉取）。
- **全文搜索**（`rxdb-plugin-search`）：`searchable: true` 白名单只收
  `string/enum/stringArray`（`plugin.ts:546` fail-fast）——**keyValue/json 列不可 searchable**。
  SQLite 侧 FTS5，CJK unigram + bigram 补偿已有（`rxdb-adapter-sqlite-core` 的
  `fts5/cjk-bigram.ts`），jieba/ICU 词典分词未立项（US-702「后续工作」）。

### 2.2 模型与 UI 侧

- **UI 文案翻译：完全没有**（全仓搜 `ngx-translate|vue-i18n|i18next|react-intl|@angular/localize`
  零命中）。rxdb-model 组件硬编码中文：`build-editable-columns.ts:115-121` 的
  `actionsTitle = '操作'`、`entity-field.utils.ts:185-188` 的「创建时间」；字段展示名是
  schema 元数据上硬编码的 `displayName`。
- **Locale 痕迹全是日期/数字格式化**：Angular demo 注册 `zh-Hans`/`en-US` 两套 locale 数据供
  日期管道用；electron 的 `resolveLocaleId`（`apps/dev-rxdb-electron/src/app/locale.ts:10-11`）
  把浏览器 locale 二选一归一化（注释明说「只注册了这两种，透传原值会让管道运行时抛错」）；
  Angular/React app 入口把 `document.documentElement.lang` 设为浏览器 locale。
- **数据内容翻译：零痕迹**（字段名搜 `titleEn/titleZh/nameEn/contentZh/_en/_zh/locale/langCode`
  无命中）。
- **没有语言偏好实体**——locale 每次从浏览器解析，无用户级覆盖存储。

### 2.3 需求侧

- [vision.md](vision.md) 阶段 6 有「多语言 tokenizer、拼写纠错」——那是**搜索**侧的国际化，
  与本文的数据存储建模正交但衔接（见 5.4）。
- US-702 全文搜索已 Done（三端 `useSearch()` 对称 + FTS5 + CJK bigram）。
- 仓库的排序合同是**字节序**：US-028 明令排序键不得换 `localeCompare`（码点序承诺），
  US-030 声明「字符串比较按字节序」。locale 感知排序永远不是引擎职责。

### 2.4 小结：缺口

没有任何数据 i18n 的实现、故事或计划；引擎的「新实体零迁移建表」「按实体的同步策略」
「Filter 闭包」「行级冲突」四块积木足以支撑第 4 节的方案，但**冲突粒度**与
**同步策略的形状**直接决定方案形态（第 5 节）。

## 3. 外部参考

- RxDB 官方 schema 指南的惯例是把 per-locale 映射放进嵌套对象字段（`type: "object"` +
  `additionalProperties: true`），只索引外层真正要查询的字段：[rx-schema 文档](https://rxdb.info/rx-schema.html)。
  本仓库的等价物是 `PropertyType.keyValue`/`json`，但 `searchable` 白名单与官方索引规则不同，
  不能照搬结论。
- 翻译子表是主流 CMS/ORM 惯例：[localize_translate 的 translatable database systems 指南](https://hex.pm/packages/localize_translate/0.1.0/files/guides/translatable_database_systems.md)
  （主表存语言无关字段 + 翻译表一行一语言，加语言零 schema 变更）；专利先例补了
  「机器复制默认语言的 fallback 行标记为 invalid，与真实翻译区分」。
- fallback 链显式解析在调用点、不藏进 repository：emdash-cms 的
  [i18n menus PR #916](https://github.com/emdash-cms/emdash/pull/916)；其修复记录同样值得引以为戒：
  **唯一键与缓存键必须按 locale 作用域**，否则导入导出 round-trip 会静默跳过/覆盖非默认语言。
- 上述参考都没有覆盖 offline-first 同步冲突——那是本地优先语境的自有难题，也是本文第 5 节
  的决定性考量。

## 4. 方案空间与取舍

先澄清一个容易混淆的点：本节排除的 D（每语言一条**主实体**文档）与推荐的
C-L（每语言一张**翻译**表）是两回事——前者把同一个 Recipe 拆成三条互相独立的记录，
破坏实体身份；后者主实体表不动，只有翻译行按语言分表。

### 4.1 A：内嵌映射（keyValue / json 列）

`title_i18n: { en: '…', zh: '…' }` 存主表一列。

- ✅ 读取零 join，点路径查询/排序可用（keyValue 声明键时）。
- ❌ **加语言 = schema 变更**（keyValue 键预声明）；json 免变更但零校验、不可索引。
- ❌ **同步冲突整文档覆盖**：设备甲写 `title_i18n.zh`、设备乙写 `title_i18n.en`，
  离线各自提交 → pull 时 LWW 整行二选一，一方翻译静默丢失。内嵌方案理论上可写自定义
  `ConflictResolver` 在检测到并发修改时返回 `MERGE`，但引擎不自动合并——`MERGE`/`DEFER`
  只派发 `ConflictPendingEvent` 并整轮回滚（fail-closed），字段级三方合并要应用侧自己实现、
  自己落库重拉，复杂度全推给使用方。
- ❌ keyValue/json 不可 `searchable`（白名单 fail-fast），多语言内容进不了 FTS5。
- ❌ 编辑体验：现成 `key-value-editor` 是通用 KV 编辑器，不是按语言的翻译表单。
- 结论：**只适合 demo 级、只读展示、无并发多语言编辑的场景**。

### 4.2 B：每语言一列（`title_en` / `title_zh`）

- ✅ 列是 `string`，可 searchable、可索引、查询最简单。
- ❌ 语言集必须恒定且小；加语言 = 主表补列 = 上节说的「已有表无通用补列路径」，
  要靠库级 `MigrationType` 手写 + 三适配器验证，成本最高。
- ❌ 同步冲突同样整文档覆盖（与 A 相同的丢失场景）。
- 结论：**仅当语言集固定（≤3 且永不扩）时优于 A**，不适合作为通用答案。

### 4.3 C：单张翻译表 + locale 列

`RecipeTranslation { id, recipeId, fieldName, locale, value, … }`，主表保留语言无关字段。
一行 =（实体 × 字段 × 语言）。

- ✅ **加语言零 schema 变更**（locale 是数据）；新实体走 `#ensureEntityTables` 补建缺失表的
  现成路径，对已发布库的迁移成本最低。
- ✅ **同步冲突隔离到行**：甲写 `(r1, title, zh)`、乙写 `(r1, title, en)` 是两行，
  默认 LWW 即正确，无需自定义 resolver。
- ✅ `value` 是 string，可 searchable。**行 id 由自然键确定性派生**
  （`${recipeId}:${fieldName}:${locale}`，客户端提供 string id，Recipe 先例）：
  两台设备离线创建同一逻辑行得到**同一个 id**，同步时按同一行 LWW 收敛，
  **不会撞唯一约束、不会产生重复行**——比「随机 id + 复合唯一索引」更适合离线写
  （后者在离线并发创建同一逻辑行时会因唯一约束直接失败，这正是本地优先的常态）。
- ✅ **「只同步某个语言」可用 Filter 闭包做到**：`filter: () => ({ field: 'locale',
  operator: 'in', value: activeLocales() })`，闭包运行时求值——语言偏好变了，下一次
  pull 用新 filter；`cleanup-expired` 会把不再满足条件的本地行清掉（切语言即瘦身；
  不想删就累积进 `in` 列表）。**不需要重建任何配置**。
- ❌ fallback 链查询要 `in: [zh-Hans, zh, en]` + 应用层挑一（单表单查询，可接受）。
- ❌ 展示要 join/多条读取；行数放大（实体 × 字段 × 语言）。
- ❗ 删除实体要级联删翻译行——引擎有关系级 `onDelete: OnDeleteAction.CASCADE`
  （DB 层自动级联），但同步侧语义需阶段 0 验证（见第 6 节第 5 条）。
- ❌ FTS 跨语言混排，查询时按 locale 过滤（`scope filter` 现成能力）。

### 4.4 C-L：每语言一张翻译表（候选策略）

`RecipeTranslationsZh { id, recipeId, fieldName, value }` / `RecipeTranslationsEn` /
`RecipeTranslationsFr`，三张表 schema 同形，由插件按一份声明生成。

**粒度口径**：一张翻译表属于**一个实体 × 一门语言**（`Recipe` + `zh-Hans` →
`recipe_translations_zh_hans`），一行 = 一个可翻译字段的一个翻译值（`fieldName` 列
区分 `title`/`tag`）。不做「每字段一张表」，也不做「全库共享一张多态翻译表」
（后者没有外键、类型弱、FTS 混排，都劣于按实体分表）。

- ✅ 继承 C 的全部优点：加语言 = 注册一张新表（`#ensureEntityTables` 自动建，零迁移）、
  行级冲突隔离、value 可 searchable；行 id 确定性派生（`${recipeId}:${fieldName}`），
  **主键即自然键**，离线并发创建同一逻辑行安全收敛。
- ✅ **「只同步某个表」是实体级配置，语义最直白**：设备只需要中文 → zh 表 `Full`（本地
  可写、离线优先），en/fr 表 `SyncDisabled`（永不推送、永不拉取，零流量零行）。
  需要第二语言时再改该表的 sync。同步面零额外机制。
- ✅ **FTS 天然按语言分表检索**：搜中文只查 zh 表的 FTS5，无需 locale 过滤。
- ✅ 冲突隔离再加一层表级边界：不同语言的写入连 changelog 实体都不同。
- ❌ 切语言 = 同步配置变化：实例级覆盖是构造时固化的 `ReadonlyMap`，运行时换语言集合
  要重建同步解析器（插件可以把这个封装成「语言偏好变更 → 重配」的一次性动作；
  `SyncDisabled` 表里的旧数据仍在本地，不会像 Filter 那样被 cleanup 删掉）。
- ❌ fallback 链跨表：要么按链依次查（zh → en → …，命中即停，多数场景一次查询就命中），
  要么应用层并发查两张表后挑一。
- ❌ 元数据数量 ×N（实体注册、devtools 列表、三端实体表格都多 N 份）——由插件生成，
  样板不可见，但调试/观测面变大是真实成本。

### 4.5 关于「单一权威」与主表字段

此前版本推荐的 C' 是「主语言字段留在主表 + 子表补其他语言」，它隐含一个前提叫
**单一权威**：主表 `title` 只有一份值，必须约定「谁能改它」——若两台设备并发改主表
`title` 本身，它们仍落在同一文档上，LWW 整行二选一，一方丢数据。这个概念之所以绕，
是因为它把「默认语言」和「业务字段本体」绑在了一起。

**修订后的推荐消灭了这个概念**：主表只留语言无关字段（id/价格/状态/时间戳），
**所有**可翻译文本一律进翻译表——中文标题、英文标题、法文标题是三条互相独立的行
（或三张表里的三行），谁写哪门语言就动哪一行，不存在「主表字段归谁」的问题。
列表排序/搜索需要默认语言文本时，join 一次默认语言表（引擎点路径 join 现成）；
若实测性能不达标，再考虑在主表加**派生镜像列**（由插件在翻译写入时维护，只读、
不参与冲突域）。阶段 0 不做镜像。

### 4.6 D：每语言一条主实体文档

把同一个 Recipe 按语言拆成多条独立主记录——破坏实体身份、复制同步放大、唯一性/关系
全部重定义。**排除**。与 4.4 的每语言一张**翻译**表不是一回事。

### 4.7 比较表

| 维度 | A 内嵌 | B 每语言一列 | C 单翻译表 | C-L 每语言一张翻译表（候选） |
| - | - | - | - | - |
| 加语言成本 | schema 变更 / 零校验 | 补列 + 手写迁移 | 零（数据） | 新表自动建（代码部署） |
| 同步冲突粒度 | 整文档覆盖 ✗ | 整文档覆盖 ✗ | 行级 ✓ | 行级 + 表级 ✓ |
| 只同步某语言 | 不可 | 不可 | Filter 闭包（运行时切） | 实体 sync 配置（语义直白） |
| 切语言时旧语言数据 | — | — | cleanup 删除/可累积保留 | 本地保留（SyncDisabled 不动） |
| FTS | ✗（白名单外） | ✓ | ✓ + locale 过滤 | ✓ 天然按语言分表 |
| fallback 链 | 应用层 | 应用层 | 单表 `in` 单查询 | 跨表按链查（命中即停） |
| 元数据/观测面 | 1 | 1 | 1 | ×N（插件生成） |
| 对已发布库迁移 | 困难 | 困难 | 新表自动建 ✓ | 新表自动建 ✓ |

## 5. RxDB 场景特有考量

### 5.1 同步冲突粒度（决定性因素）

本地优先的典型使用形态是**多设备离线编辑、各自提交**。数据 i18n 的天然并发模式就是
「甲设备用中文补标题、乙设备用英文补标题」——这在 A/B 内嵌方案里是同一文档的两个 patch，
pull 时 `LWWConflictResolver` 整实体二选一，**另一方的翻译静默丢失**，且引擎的
`MERGE`/`DEFER` 冲突路径是整轮回滚 fail-closed，要求应用侧手工三方合并后重写，内嵌方案
等于把字段级合并的复杂度全部推给每个使用方。翻译表（C 或 C-L）把同一内容拆成不同行，
冲突退化为「不同行各写各的」，默认 LWW 即正确——**这是选择翻译表家族的根本理由**，
也是外部 CMS 参考（内容永远在服务端单写）给不了答案的地方。

### 5.2 加语言的迁移成本

桥接版本 `v0.0.26` 已在 npm——任何 schema 级方案都要为**已发布库的用户**付迁移账单：
内嵌/每语言列需要库级 `MigrationType` 的 `up/down` + SQLite 系 / PGlite / Supabase 三适配器
各自验证（现有补列先例全是系统表专用函数，没有通用路径可复用）。翻译表是**新实体**：
C 加语言零部署，C-L 加语言 = 插件按声明注册一张新表，都走 `RxDB.#ensureEntityTables`
补建缺失表的现成机制（`RxDBAdapterSqliteBase.ts:810` 注释），新库旧库同一条路径。

### 5.3 查询与 fallback 链

- fallback 链（请求 locale → 用户偏好 → 默认语言）**建议显式解析在应用层**，与 emdash 的
  「不藏进 repository」结论一致：SQL 侧拼 `or` + `exists` 能做但复杂，JS 侧 lodash `get`
  的增量匹配语义引擎已对齐，resolve 函数写成纯函数即可单测。
- C：一次 `in` 查询取全链候选行，应用层挑第一个命中的 locale。
- C-L：按链查表、命中即停——绝大多数情况下首选语言表一查就中，性能与 C 相当；
  两语言表并发查只在首选语言缺行时发生。
- 列表页默认语言排序/搜索：C-L 下 join 默认语言表（点路径 join 现成），实测不达标再上
  派生镜像列（见 4.5）。
- 引擎字节序合同不变：locale 感知排序是应用层 `Intl.Collator` 的事（US-028 决策）。

### 5.4 全文搜索衔接

`searchable` 白名单只收 `string/enum/stringArray`——翻译行 `value` 是 string，可进 FTS5。
C-L 的天然优势：**每张语言表自带独立 FTS5 索引，搜中文只查中文表**，不需要 locale 过滤；
C 则查询时按 locale 过滤（`scope filter` 现成能力）。vision 阶段 6 的多语言 tokenizer
与数据 i18n 正交：今天没有多语言**内容**可索引，tokenizer 是空转；数据 i18n 落地后
才有真正的多语言索引需求。两者建议分开排期，但翻译表方案让衔接零摩擦。

### 5.5 语言协商与格式本地化

- 协商链参考 electron 先例但要泛化：`resolveLocaleId` 的二选一是演示用的硬编码；
  通用形态是「请求 locale → 用户偏好（存 RxDB 设置实体，今天没有）→ 默认语言」。
  locale 键用 BCP 47 标签（`zh-Hans`），天然避过 keyValue 键含点号的限制。
- 数字/日期/货币：应用层 `Intl`，已有先例（`toLocaleString('zh-CN', …)`、Angular
  locale 注册）。**不做**：引擎内置 locale 感知排序、字符串比较（字节序合同）。

### 5.6 wire 协议与三框架对称

- 翻译实体自动进 `rxdb_change` changelog 与 HTTP wire 协议，协议文档无需新算子；
  若要在 http-protocol.md 的 Recipe 端到端示例演示多语言，示例会加翻译实体
  （文档改动量小）。
- 三框架对称铁律：插件方案从第一天起就是引擎级能力 → 三端绑定是必选项
  （`rxdb-plugin-i18n-angular/react/vue`，或三端共享的 rxdb-model 编辑器 + 纯函数工具）。
  演示应用 Angular / React / Vue 三端都要有：翻译编辑入口、locale 切换、
  fallback 展示、同步演示（至少一端演示「只同步某语言」）。UI 文案国际化
  （rxdb-model 硬编码中文）是独立问题，不搭车。

## 6. 插件设计草图：`@Translatable`

按「像 `@Entity` 一样配置翻译信息」的要求，声明式入口如下（示意，非定稿 API）：

```ts
@Entity({ ...RECIPE_SCHEMA })
@Translatable({
  fields: ['title', 'tag'],                     // 可翻译字段
  locales: ['zh-Hans', 'en', 'fr'],             // 语言表（BCP 47）
  defaultLocale: 'en',                          // fallback 链终点
  strategy: 'per-locale-table',                 // 'per-locale-table' | 'single-table'（默认值待阶段 0 决策）
  syncLocales: () => ['zh-Hans']                // 本设备要同步的语言（可选，缺省全量）
})
export class Recipe extends EntityBase<string> { ... }
```

插件职责（对齐引擎现有钩子，每项都是现状能力，不需要引擎改动）：

1. **翻译实体生成**：为每个 `@Translatable` 实体按 strategy 生成翻译实体元数据——
   **一个实体 × 一门语言一张表**，表内 `fieldName` 区分可翻译字段：
   `per-locale-table`：`RecipeTranslationsZhHans/En/Fr`（schema 同形：`recipeId`、
   `fieldName`、`value` + `searchable: true`；**行 id = `${recipeId}:${fieldName}`
   确定性派生，主键即自然键**，`fieldName` 按 `fields` 白名单校验）；
   `single-table`：一张 `RecipeTranslation` 加 `locale` 列，行 id =
   `${recipeId}:${fieldName}:${locale}`。生成实体注册进 `config.entities`，
   走 `#ensureEntityTables` 建表。
2. **同步装配**：按 `syncLocales()` 给每张翻译表配 sync——需要的语言 `Full`
   （本地可写 + 离线优先），不需要的 `SyncDisabled`；`single-table` 则配 Filter 闭包
   `{ locale in syncLocales() }`。语言偏好变更时由插件重配（C-L）或依赖闭包自然生效（C）。
3. **读 API**：`resolveTranslation(entity, field, localeChain)` 纯函数（可单测 fallback
   链）；repository 侧 `findLocalized({ locale })` 便捷查询（join/按链查表封装）。
4. **编辑 UI（三端对称）**：rxdb-model 增加翻译编辑组件（按语言的字段编辑器 +
   fallback 指示），三端 entity-table/entity-form 共用同一实现（遵循现有
   `buildEditableColumns` 三端共用的架构）。
5. **删除级联**：翻译实体对主实体的关系声明 `onDelete: OnDeleteAction.CASCADE`——
   DB 层自动级联（SQLite 侧 `create_table_sql.ts:184` 拼 `ON DELETE ${relation.onDelete}`，
   PGlite 同形；多对多中间表已有同款先例 `many-to-many-entity.ts:90,102`）。
   同步侧有两点要在阶段 0 验证：SQLite 默认 `recursive_triggers=OFF`（全仓未开），
   FK 级联删除的子行可能**不进本地 changelog**——远端若建了同样的 FK 约束会自行级联，
   若没有（如 http 适配器背后的自建后端）会留孤儿行。稳妥做法是插件把主实体删除包装成
   事务内「先显式删翻译行、再删主行」（`rxdb.transaction.ts`），删除动作全部进
   changelog、同步语义干净，DB 级 CASCADE 作兜底防线。**同一原因也保护 FTS**：
   搜索插件靠引擎变更事件维护 FTS5 索引（US-702 AC#5 的再查询链），级联删除若
   不进变更流，已删实体的翻译仍能被搜到——显式删除保证 FTS 同步摘除。
6. **搜索**：翻译表 value 列 searchable；C-L 下按语言表检索、C 下按 locale 过滤。
7. 打包与质量门：`packages/rxdb-plugin-i18n` + 三端绑定包；TDD 红绿、
   三端对称检查（`tri-framework-check`）、覆盖率阈值、TSDoc——按仓库铁律执行。
   验收重点：**两台不同 locale 的库并发写翻译、pull 后两行都在**（内嵌方案必挂的用例）、
   切语言后旧语言数据按策略保留/清理、FTS 按语言检索命中。

## 7. 推荐路线

**总体：翻译表方案（表粒度 C-L / C 暂缓定案，阶段 0 实测后决策）+ `@Translatable`
插件 + 三端演示。**

- **阶段 0 — 验证方案（不建插件，先手写一遍）**：recipes-domain 手写试点，**两种表
  粒度都搭**——每语言表（`RecipeTranslationsZhHans/En`，按实体 sync 配置）与单表变体
  （`RecipeTranslation` + locale 列，Filter 闭包）+ 纯函数 resolve（单测钉死 fallback
  语义）+ 三端 demo 各一个翻译编辑入口与 locale 切换。**三端演示是交付门禁**
  （仓库铁律：单端缺失 = 未完成），并且**至少一端演示「只同步某语言」**
  （`SyncDisabled` 表零流量）与「切语言后旧语言数据保留」。验收重点：并发写不同语言
  pull 后两行都在、FTS 按语言表检索、**删除主实体后本地与远端翻译行都消失（级联语义
  端到端，不留孤儿行）**、**两端离线创建同一逻辑翻译行 → pull 后收敛为一行（不撞
  唯一约束、不产生重复行）**。试点同时覆盖：dev-rxdb-http-server 远端注册翻译表并
  支持翻译实体的同步端点；e2e 用双浏览器上下文（两个 locale 两套本地库）验证
  「只同步某语言」与离线并发写；resolve 纯函数屏蔽表粒度差异，三端 UI 与演示文案对
  两种策略完全一致，避免重复开发；另加一条性能 sanity（列表页按默认语言 join 排序、
  翻译行放大的查询成本，超预算再考虑 4.5 的派生镜像列）。同一组验收用例两端跑，
  此阶段结束以实测证据对「每语言表 vs 单表」拍板（决策记录第 1 条）。
- **阶段 1 — `rxdb-plugin-i18n` 插件**：把阶段 0 的手写样板变成 `@Translatable`
  声明式生成（第 6 节），三端绑定对称交付，demo 改用插件。
- **阶段 2 — 可选增强（待 owner，价值另行论证）**：主表派生镜像列（列表排序优化）、
  `searchable` 白名单放宽、keyValue 动态键（`additionalProperties` 化）——每个都牵动
  属性系统 + 查询 + 适配器 + client-generator 五处触点，不建议在阶段 0/1 验证价值前立项。
- 与 US-702/vision 阶段 6 的排期关系：数据 i18n 先行（提供多语言内容），tokenizer 后行
  （消费多语言内容）。

## 8. 不做什么（边界）

- 不做每语言一条主实体文档/把主实体按语言拆分（4.6）。
- 不在引擎内置 locale 感知排序与比较（字节序合同，US-028/US-030 决策）。
- 不加 regex / 大小写不敏感查询算子（SQLC-007 合同）。
- 不把 UI 文案翻译（rxdb-model 硬编码中文）混进数据 i18n——它是独立问题，可另行立项。
- 不做机翻/审校工作流（外部参考的 valid/invalid 标记），除非有真实使用方。

## 9. 决策记录（2026-10-10）

owner 已确认以下决策；**表结构粒度一项暂缓定案，留到实际工作中决策**：

> 本研究的方案已立项为用户故事
> [US-910 数据国际化 / 本地化](stories/future/US-910-data-i18n.md)（Backlog，epic-004）。

1. **表结构粒度（暂缓定案）**：C-L（每语言一张翻译表）与 C（单表 + locale 列）
   二选一。阶段 0 手写试点两种都搭，同一组验收用例两端跑（同步语义、FTS、切语言
   行为、观测面），以实测证据在阶段 0 结束拍板。已固定的不变式：一行 = 一个可翻译
   字段的一个翻译值，**行 id 由 (entityId, fieldName[, locale]) 确定性派生，主键即
   自然键**（离线并发写同一逻辑行安全收敛）；不做每字段一表、不做全库共享多态
   翻译表；插件两种 `strategy` 都生成，决策只改默认值、不改架构。
2. **演示**：Angular / React / Vue 三端都要演示（交付门禁，单端缺失 = 未完成），
   至少一端演示「只同步某语言」与「切语言后旧语言数据保留」。
3. **语言偏好实体**：入 RxDB 设置实体（可同步、多端一致）。协商链两级：
   设备探测（browser locale，现有先例）→ 用户偏好（RxDB 实体）→ 默认语言；
   偏好变更驱动 `syncLocales()` 与同步重配（插件封装）。
4. **翻译行粒度**：`fieldName` 单字段行（冲突隔离更细、可 searchable 更自然）。
5. **删除级联**：删除主实体必须级联删除其全部翻译行。机制 = 关系声明
   `onDelete: OnDeleteAction.CASCADE`（DB 兜底）+ 插件事务内先显式删翻译行再删主行
   （删除动作全部进 changelog、FTS 同步摘除，不依赖 `recursive_triggers`）；阶段 0
   端到端验证本地与远端均无孤儿翻译行、搜索不再命中已删实体。
6. **试点范围**：Recipe 的 `title` / `tag` 先翻译；三端 demo 与协议文档的
   多语言示例（http-protocol.md）在阶段 0 一并演示。

## 10. 方案评审结论（2026-10-10）

对方案做了一轮对抗性评审，结论已就地修订进上文，遗留验证项如下：

- **P0（已修）离线并发创建翻译行的唯一约束冲突**：原「随机 id + (recipeId, fieldName)
  复合唯一索引」在两端离线创建同一逻辑行时会因唯一约束直接失败——这是本地优先的
  常态而非边界。改为**行 id 由自然键确定性派生**（主键即自然键，Recipe 的
  客户端 string id 先例），同 id 行在同步时按同一行 LWW 收敛（4.3 / 4.4 / 第 6 节）。
  pull 侧「INSERT 撞已有行」的冲突路径（`pull-conflict-utils.ts`）列为阶段 0 必验项。
- **P1（已修）级联删除与 FTS 联动**：`recursive_triggers` 全仓未开启，FK 级联删除
  不进引擎变更流，FTS 影子行会残留（搜到已删实体的翻译）。「事务内先显式删翻译行」
  同时保证 changelog 完整与 FTS 摘除（6.5、决策记录 5）。
- **P1（阶段 0 验证）C-L 切语言的同步重配深度**：实例级覆盖是构造时固化的
  `ReadonlyMap`，「偏好变更 → 重配」的实现深度（重连？重建仓储？）未探明，
  是 C-L vs C 对比验收的维度之一；C 的 Filter 闭包运行时求值是已验证的替代路径。
- **P1（阶段 0 范围）演示基础设施**：dev-rxdb-http-server 需注册翻译表并支持翻译实体
  的同步端点；e2e 需双 locale 双浏览器上下文；「远端无孤儿行」的验证依赖远端同款
  FK 或推送 DELETE 的完整顺序（已写进阶段 0 试点清单）。
- **P2（插件生成规则）**：实体名/表名由 locale 派生（`zh-Hans` → `ZhHans`，
  避开连字符），生成规则钉死测试；`fieldName` 按 `fields` 白名单校验，防错别字
  产生永远解析不到的幽灵行。
- **P2（边界声明）**：建实体 + 翻译行同一事务写入；pull 父行先于翻译行到达时读侧
  容忍缺失（fallback 不报错）；未来与权限（US-029）/加密字段的联动不在本期范围。

经核实站得住的结论：同步冲突粒度是决定性论据（引擎只有整实体 LWW + 无字段级合并，
这是源码确认的事实）；「新实体零迁移建表」路径（`#ensureEntityTables`）；
Filter 闭包运行时求值 + `cleanup-expired` 语义；关系级 `onDelete: CASCADE` 的
DDL 支持与多对多中间表先例。

## 参考

- 本仓库：[US-702 全文搜索](stories/future/US-702-full-text-search.md)、
  [US-028 可排序实体](stories/core/US-028-sortable-entity.md)、
  [US-030 声明式存储约束](stories/core/US-030-declarative-storage-constraints.md)、
  [vision.md](vision.md)
- 外部：[RxDB rx-schema 文档](https://rxdb.info/rx-schema.html)（嵌套对象 + additionalProperties 惯例）、
  [localize_translate: translatable database systems](https://hex.pm/packages/localize_translate/0.1.0/files/guides/translatable_database_systems.md)（翻译子表 + fallback 语义）、
  [emdash-cms i18n PR #916](https://github.com/emdash-cms/emdash/pull/916)（locale 作用域唯一键与 fallback 链显式解析）
