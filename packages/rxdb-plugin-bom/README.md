# @aiao/rxdb-plugin-bom

BOM（物料清单）领域插件，提供修订、生效域、数量展开、成本卷算、变更与 ERP/MRP 集成。

## 能力

- **实体**：`BomItem`（`item`，主数据）/ `BomItemRevision`（`item_revision`，修订）/
  `BomHeader`（`bom_header`，挂修订、`draft`/`released`）/ `BomLine`（`bom_line`，逻辑行）/
  `BomLineOccurrence`（`bom_line_occurrence`，行发生项）。同一子件可挂多条逻辑行（多重图），
  同一逻辑行按日期 × 序列 × 批次的有效域交集排他，日期区间为半开 `[effectiveFrom, effectiveTo)`。
- **存储层触发器**（SQLite 家族与 PGlite 各一份，插件经 `adapter:local` 注入自动下发）：
  - 结构归属列创建后不可改（修订→物料、头→修订/类型/组织、行→头、发生项→行）；
  - 已发布修订除 `draft → released` 状态转移外不可改，发布要求 `effective_from` 非空；
  - 已发布头成员经 ECN 协议修改，发布、改期与取消均检查运行投影。
- **十进制值合同**（US-511 存储段）：`qty` 以规范十进制串存取（≤ 34 位有效数字、无指数、
  无前导零、无尾随零），入口经 `BomRepository` 规范化，存储层格式触发器拒非规范串。
- **解析与计算**：`resolve` / `expandBom` / `whereUsed` / `explodeBom` 共用显式解析上下文；
  配置条件、序列与批次均进入 manifest。缺配置、配置冲突明确报错；多序列候选标记未解析。
- **配置与扩展属性**：特征、选项、布尔条件与依赖约束；三层 `ext` 按 `attr_def` 校验，
  属性查询按声明类型比较，缺字段与 null 等价。
- **导出与导入**：`exportBom` 在一个快照中读取展开结果与涉及的主数据，拒绝截断与未解析结构；
  `importBomDraft` 接受带 `kind` / `source_ref` 的记录数组，或导出的完整载荷。
  导入逐行报告诊断，任何失败整批回滚；成功头保持草稿，调用方显式发布。
- **实例追溯**：`BomInstanceNode` 保存一次安装的实际修订、序列/批次、父实例、来源与装拆区间。
  `expandInstance` / `whereUsedInstance` 查询实际事实与完整祖先路径；不随主数据改版重新解析。
  序列化物料必填序列号，同一序列号的安装区间不得重叠；换父/重装先截止旧区间再新增记录。
  来源发生项被引用后禁止删除，ECN 撤回/取消同样受保护。

## 使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { BOM_ENTITIES, rxDBPluginBom } from '@aiao/rxdb-plugin-bom';

const rxdb = new RxDB({
  dbName: 'bom-app',
  entities: [...BOM_ENTITIES],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
rxdb.use(rxDBPluginBom);
await rxdb.connect('wa-sqlite');

const context = {
  bomType: 'ebom' as const,
  orgId: 'factory-a',
  asOfDate: new Date('2026-10-16T00:00:00.000Z'),
  unit: 137,
  configSelection: { color: ['red'] }
};
const payload = await rxdb.bom.exportBom(context, { parentItemId: rootItemId });
const imported = await rxdb.bom.importBomDraft(records);

const actual = await rxdb.bom.expandInstance(rootInstanceId, {
  asOfDate: new Date('2026-10-17T00:00:00.000Z')
});
const trace = await rxdb.bom.whereUsedInstance({ lotCode: 'PACK-LOT-A' });
```

实例查询省略 `asOfDate` 时返回历史；指定时点按半开装拆区间筛选，根可无来源，子节点必须有来源。
实例与主数据分表，查询模块随实例 API 调用加载；`maxDepth` / `maxNodes` 触顶会显式标记 `truncated`。

后端支持：`wa-sqlite` / `sqlite` / `sqlite-wasm` / `sqliteai` / `sqlite-tauri` / `sqlite-electron` /
`pglite`。其余后端在插件安装期显式报 `BomBackendCapabilityError`，不做静默降级。

## 前置

- SQLite 宿主 ≥ 3.47.0（触发器的 `RAISE` 表达式，US-030 AC#7），不满足在 `connect()` 即失败；
- 实体声明了区间排他等存储约束（US-030 阶段 C），`init()` 会做只读漂移比对。
