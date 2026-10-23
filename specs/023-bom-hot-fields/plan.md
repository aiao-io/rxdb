# Implementation Plan: BOM 热字段透明索引

**日期**：2026-10-18。**状态**：实施与集中验收中，实际证据见 [validation.md](validation.md)。

## 已核对的事实与可复用落点

| 当前实现                                                                                                               | 复用方式与边界                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/rxdb/src/entity/property-types.interface.ts:513` 的 `EntityIndexMetadataOptions` 只有列、normalized 与 where | 新字段保持可选；`properties` 与新 `expression` 互斥，旧索引不换名、不改变补建策略。                                                                            |
| `entity/metadata-transition.ts` 的继承 Map 合并、`metadata-validate.ts` 的注册期校验                                   | 生成列按 name 合并；校验源、类型、循环/冲突与方法组合。不要把生成列塞入现有可写属性。                                                                          |
| `entity/constraint-name.ts` 与 `system/constraint-drift.ts`                                                            | 复用规范化哈希、63 UTF-8 字节限制与缺失/多余错误；当前只管 `ck_`/`uq_`/`ex_`，不能把新增对象混进历史 `idx_`。                                                  |
| 两端 `table/create_table_sql.ts`；PG 的 `create_tables_sql.ts`                                                         | 生成列随表创建，表达式/方法索引排在列创建之后；保留 PG 已有“全部表/关系列 → 索引/约束 → 触发器”的执行阶段。                                                    |
| 两端 `table/check-entity-constraints.ts`                                                                               | 扩展只读目录读取：SQLite `table_xinfo`/`sqlite_master`，PG `pg_attribute`/`pg_attrdef`/`pg_index`/`pg_am`/`pg_opclass`。当前只比较名字，D 阶段必须比实际定义。 |
| `RxDB.ts:1100～1127`                                                                                                   | 用户 migrations → 缺表创建 → 漂移检查 → PG 普通索引 reconcile；新对象纳入漂移而从 reconcile 排除。                                                             |
| `rxdb-plugin-bom/src/entities.ts` 的三层 `ext`                                                                         | 实际是 `PropertyType.string`，SQLite TEXT、PG varchar；不能照故事标题假定列已是 jsonb。引擎原生 `PropertyType.json` 才映射 PG jsonb。                          |
| `resolve/ext-attr.ts` 的 `validateExtWrite`、`buildExtFilterSql`、`filterByAttr`                                       | 保留 `attr_def` 校验、缺值/类型语义和旧签名；内部编译器接收已解析的存储计划，把原过滤改写为生成列或 GIN。                                                      |
| 两端 `entity/*sql.ts`、`table/trigger_sql.ts`、`version/execute_switch_actions.ts`                                     | 现有写入/日志多从可写属性集取列，继续排除派生列；重点审计 SQLite 批量 INSERT 写全列与重放列列表。                                                              |

## 最小兼容 API 建议

以下 API 已由核心纯函数与双后端真实 DDL spike 固化；字符串来源另需显式 `jsonText: true`。

```ts
type StorageExpression =
  | { kind: 'jsonScalar'; property: string; key: string; dataType: 'string' | 'number' | 'boolean'; jsonText?: true }
  | { kind: 'jsonDocument'; property: string; jsonText?: true };

interface EntityGeneratedColumnMetadataOptions {
  name: string;
  expression: Extract<StorageExpression, { kind: 'jsonScalar' }>;
}

// EntityMetadataOptions 新增独立的 generatedColumns。
// EntityIndexMetadataOptions 保留现状，新增：
// expression?: StorageExpression;
// method?: 'btree' | 'gin' | 'gist';
// dialects?: readonly ('sqlite' | 'postgres')[];
```

索引仍可用 `properties: ['<生成列名>']` 引用新列；不再另造第二份 hot-field SQL 字符串。`dialects` 是作者明确选择的安装范围，默认所有方言；不在范围内的对象不参与该库预期清单，范围内的不支持能力则显式失败。GIN 的默认 `jsonb_ops` 随定义哈希与目录检查固定，不开放任意 opclass 字符串。

现有实体元数据按类共享，而同一 BOM 类必须能同时用于普通库、热字段库和 PG GIN 库。因此增加一个实例级可选入口 `RxDBOptions.entityStorage: [{ entity, generatedColumns, indexes }]`，仅覆盖新增存储声明、按 name 合并，连接前冻结；解析结果保存在库自己的存储计划里，DDL/漂移/BOM 查询使用同一份。名称已在 T002 固化；禁止在插件 install 时原地改 `getEntityMetadata()` 的 Map。

BOM 提供纯 helper `createBomExtStorage({ hotFields, gin })` 生成这份声明，调用方把返回值放进上述入口；helper 不执行 DDL、不创建 `attr_def`、不修改已有 `rxDBPluginBom` 的安装方式。仅当 T002 证明已有实例级通道可复用时删除这个新入口，避免并存两条声明路径。

## SQL 与类型边界

- `rohs_status` 的 string 生成列：SQLite 提取字面键并保持文本类型，PG 从 `ext::jsonb` 提取相同键；number 保持既有 SQLite JSON 数值 / PG numeric 比较语义，boolean 保持 SQLite 0/1 与 PG boolean。生成定义必须有 JSON 类型守卫，不能把 JSON string `"1"` 当 number、把 JSON number `1` 当 boolean。
- 生成列读到缺键或 JSON null 时为 SQL NULL；已有数据库中的类型坏值在迁移审计中拒绝。通过支持的仓储/批量入口新增非法 `ext` 继续由现有 BOM 校验拒绝，不以生成列取代领域校验。
- 字面键使用字符串转义，不把点解释成嵌套路径；`jsonScalar` 与 `jsonDocument` 的源只允许未加密 JSON 属性或已声明为 JSON 文本的字符串列，普通任意文本不能冒充受支持 JSON 源。JSON 文本标识应随存储声明明确表达并校验，不改变原字符串属性的序列化合同。
- 热 string 等值编译为 `"<生成列>" = <原有类型化值>`；非热且启用 GIN 的 eq 编译为 `(("ext")::jsonb) @> '{"code":<JSON 标量>}'::jsonb`。索引表达式与谓词左侧保持同一棵表达式树；值通过可信 JSON 序列化及 SQL 参数/字面量通道写入，不能把用户输入当 SQL。
- 日期继续使用现有 `julianday` / `timestamptz` 比较；不同 UTC offset 表示同一时点仍相等。日期生成列明确不属于首个 DSL，不能用 PG STABLE 时间解析函数声明 IMMUTABLE。
- PostgreSQL GIN 和 GiST 分开验收：JSON 文档 GIN 证明 `@>` 计划；标量 GiST 复用现有 `btree_gist` 装载，证明有效声明可建且不支持的类型提前失败。不能拿已有 EXCLUDE 的 GiST 当作 method 声明已交付。

## 漂移、升级与重放

1. 新对象使用独立托管名，如生成列 `gc_<name>_<hash>` 与索引 `sx_<table>_<name>_<hash>`，哈希包含 namespace、源/键/类型、表达式、方法和方言范围。具体名前缀在 T002 固化，不改历史对象命名。
2. SQLite 读取生成列 hidden/type 与 CREATE TABLE/INDEX 表达式；PG 读取生成模式、类型、`pg_get_expr`、索引表达式、方法/opclass 和有效性。除了名字，还核对规范化实际定义；无法解析或同名被替换都报漂移，不凭名称宣告正确。
3. 用户迁移中审计存量 → SQLite `ADD COLUMN ... GENERATED ALWAYS AS ... VIRTUAL` / PG `... STORED` → 建索引 → 检查 → 事务提交。已有虚拟列的定义改动需要显式用户迁移；若宿主需要重建，使用版本可用的保守迁移方案，不依赖最新 ALTER 特性。源码初始化不自动重建大表。
4. 公共实体读取、`filterByAttr`、备份/恢复、CRUD 日志、批量 UPSERT、undo/redo、切分支及同步应用都审计派生列边界：值只从原 `ext` 重算。读取结果和日志 envelope 不增加内部列；迁移失败与重放失败不推进相应水位。
5. 相同实体类连接两份不同声明的数据库，查询编译、目录预期和重放互不污染；删除声明但未迁移删除对象时报“多余”。

## 执行与门禁

先静态冻结一份最小声明，再双后端真实 spike；先确认生成列/表达式/GIN/GiST/持久升级和查询计划红，再改生产。SQLite 执行测试至少覆盖 wa-sqlite，共享 DDL 与宿主路径通过已有 suite 扩散验证；PGlite 使用真实持久 store 重开，不能用两次 memory connect 冒充升级。

10000 行选择性查询记录正常规划器的命中证据，并跑未加速/热字段/GIN 的同一结果矩阵。性能预算与验证方法见 spec；迁移建索引耗时单列，不以修改预算消除失败。核心覆盖率四项 ≥90%，两个适配器共享层和 BOM 四项 ≥80%；所有执行由主会话通过 Nx 集中完成。

复杂度理由：实例级存储计划用于防止共享类配置污染；只读派生列用于避免写入/日志/重放破坏；目录定义比对用于抓住“同名伪索引”。除此之外不添加注册引擎、任意 SQL 回调或自动降级层。已验证与待验证证据分列在 validation.md，不以候选实现替代门禁结果。
