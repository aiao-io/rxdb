# @aiao/rxdb-plugin-bom

BOM（物料清单）领域插件，epic-009 BOM 领域模型首轮切片的落点（US-507 阶段 A / B）。

## 能力

- **实体**：`BomItem`（`item`，主数据）/ `BomItemRevision`（`item_revision`，修订）/
  `BomHeader`（`bom_header`，挂修订、`draft`/`released`）/ `BomLine`（`bom_line`，逻辑行）/
  `BomLineOccurrence`（`bom_line_occurrence`，行发生项）。同一子件可挂多条逻辑行（多重图），
  同一逻辑行的发生项区间排他（半开 `[effectiveFrom, effectiveTo)`）。
- **存储层触发器**（SQLite 家族与 PGlite 各一份，插件经 `adapter:local` 注入自动下发）：
  - 结构归属列创建后不可改（修订→物料、头→修订/类型/组织、行→头、发生项→行）；
  - 已发布修订除 `draft → released` 状态转移外不可改，发布要求 `effective_from` 非空；
  - 已发布头的成员写入全部拒绝（首轮无 ECN，US-515 落地后只追加放行形态）。
- **十进制值合同**（US-511 存储段）：`qty` 以规范十进制串存取（≤ 34 位有效数字、无指数、
  无前导零、无尾随零），入口经 `BomRepository` 规范化，存储层格式触发器拒非规范串。

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
```

后端支持：`wa-sqlite` / `sqlite` / `sqlite-wasm` / `sqliteai` / `sqlite-tauri` / `sqlite-electron` /
`pglite`。其余后端在插件安装期显式报 `BomBackendCapabilityError`，不做静默降级。

## 前置

- SQLite 宿主 ≥ 3.47.0（触发器的 `RAISE` 表达式，US-030 AC#7），不满足在 `connect()` 即失败；
- 实体声明了区间排他等存储约束（US-030 阶段 C），`init()` 会做只读漂移比对。
