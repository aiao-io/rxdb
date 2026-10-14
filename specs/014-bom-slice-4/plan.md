# Implementation Plan: epic-009 首轮切片第 4 步

**Branch**: `claude/bom-related-work-77235b` | **Created**: 2026-10-14

## 技术上下文（第 1~3 步已就位）

- `@aiao/rxdb-plugin-bom`：实体与双后端触发器（结构列 / 已发布协议 / 十进制 / 判环 / 历史批次 / 阶梯发布）、`resolve/`（解析、装载、展开/反查）、`quantity/`（kernel、公式、换算、七步展开）
- `loadHistory` 装载通道（确定性批次号由调用方给定）；`buildQuantityFixture` 测试装配
- `dev-rxdb-angular` 等既有 demo 的 project.json 接线形态（nx:run-commands + Angular build application executor）

## 设计

### 1. 位号实体与触发器（US-507 阶段 C）

- `entities.ts`：
  - `BomLineOccurrence` 加 `{ name: 'designatorManaged', type: PropertyType.boolean, default: false }`
  - 新实体 `BomLineDesignator`（namespace `bom`、表 `bom_line_designator`）：属性 `designator`（string）；关系 MANY_TO_ONE → `BomLineOccurrence`（`mappedProperty: 'designators'`，onDelete `CASCADE`）；索引 `(occurrenceId, designator)` unique；`BOM_ENTITIES` 加第 7 个实体
- `backend/bom-trigger-ddl.ts`：
  - 结构列不可改：`occurrenceId` 进 `STRUCTURAL_COLUMNS`（BomLineDesignator 行）
  - 已发布头协议：新守卫（两后端）——位号的 i/u/d 经 `designator → occurrence → line → header` 判 released 即拒（消息 `rxdb:bom_write_protocol:bom_line_designator:…`）
  - 发布转移校验（`bom_header` 发布触发器的守卫函数追加，两后端）：managed 发生项 `qty` 无小数点（整数）且位号数 ≠ `CAST(qty AS INTEGER)` → 拒绝，消息含 `位号数:qty` 两数（`rxdb:bom_publish_validation:bom_header:…`）

### 2. 七步中间值暴露（explosion.ts 扩展）

- `ExplosionStepTrace`：`{ label, value, uom, source }` 列表？——改为结构体：
  ```ts
  interface ExplosionSteps {
    planned: { value: string; uom: string };            // P（头基准单位）
    assemblyScrapped: { value: string; uom: string };   // P'
    gross: { value: string; uom: string };              // G（行 UoM；定量/公式/阶梯标注）
    componentScrapped: { value: string; uom: string };  // G'（含固定损耗）
    converted: { value: string; uom: string };          // D（子件库存单位）
    phantom: { value: boolean; source: 'override' | 'revision' | null; revisionId: string | null };
    childPlanned?: { value: string; uom: string };      // 穿透后作为子头 P（仅 phantom）
  }
  ```
- `RequirementLine` 加 `steps: ExplosionSteps`；`manifest` 已有 conversions 等。
- `explodeBom` 需求行断言（quantity tests）不受影响（只加字段）。

### 3. 确定性种子（`src/testing/scooter-dataset.ts`）

- 导出 `SCOOTER_DATASET`（纯数据描述：items / revisions / headers / lines / occurrences / designators，全部显式 id/时间戳/日期）+ `loadScooterDataset(adapter)`（经 `loadHistory`，批次号常量 `'scooter-seed-a'`；位号经实体直写——loadHistory 首轮不载位号，位号在装载后按确定性 id 补写，或扩展 loadHistory？**位号是子表，装载走实体 API 直写**（draft 头在 loadHistory 里已被发布……位号写不进去了！已发布头成员写入被拒。所以位号必须进 loadHistory 通道：扩展 `HistoryOccurrenceInput` 加 `designators?: string[]`，装载时随发生项 draft 写入）
- 确定性 ID：`uuid` 由业务键派生——用固定确定性函数（如 `uuidv5` 风格：`crypto.randomUUID` 不行；用 `uuid` 包的 v5？看仓库有没有现成 `uuid` 工具（`@aiao/rxdb` 导出 `uuid()` 是随机的）。**确定性派生**：`fnv1a(seed)` 转 uuid 形状（插件本地实现，`check-sql.ts` 已有 fnv1a32——种子侧写一个 `deterministicId(seed: string): string`：两段 fnv1a32 哈希拼成 8-4-4-4-12 形状，版本位固定）
- `createdAt`/`updatedAt`：固定基准 `2026-01-01T00:00:00.000Z`
- 数据集设计（AC 形状全覆盖）：
  - `SC-100` 整机（5 层）：整机 → 车架 / PCBA / 线束 WH-01 / 电池组 / M3 螺钉（多处直连）
  - 电池组 → 电芯 ×10 + BMS
  - PCBA → 主控 MCU + 10kΩ 电阻（**三条逻辑行、三组位号** R1-R2 / R3-R5 / R6，qty 2/3/1）→ 需求行各不同
  - WH-01 线束：D 版 `default_phantom = true`、头 `base_uom: 'm'`、`base_qty: '1'`；导线（1.2 m/台）/ 端子 ×2 / 热缩管 ×1；**导线行 uom 'm'，WH-01 库存单位 'm'**
  - M3 螺钉：整机直连（qty 8）与线束端子行（经 phantom，qty 2）→ where-used 两条路径
  - 损耗：整机装配损耗 0（additive）；PCBA 组件损耗：MCU 2%（yield）→ 算式面板有 G' 值
  - 定量行：电池组 → BMS `is_fixed_qty = true` qty 1
- 评估日默认 `2026-09-22`；修订 effectiveFrom 2026-01-01；生效窗口全部 `[2026-01-01, null)`

### 4. 手写 golden（`src/testing/scooter-golden.ts`）

- 结构：`SCOOTER_GOLDEN = { context: { bomType, orgId, asOfDate: '2026-09-22' }, plannedQty: { value: '1', uom: 'pcs' }, rootItemKey: 'SC-100', requirements: [{ pathKey: string[]（发生项业务键）, itemKey, qty, uom, steps: {…手写中间值} }] }`
- 对账测试（`src/__tests__/bom-scooter.spec.ts`，双后端）：`loadScooterDataset` → `explodeBom` → 与 golden 逐位比较（需求行数与每条路径的 qty/uom/steps）；AC#1 的 vitest 面：两遍装载后各表逐行 dump 相同（rawQuery 全表按主键排序 dump 字符串比对）

### 5. demo（`apps/dev-rxdb-bom`）

- 参照 `dev-rxdb-angular` 接线：project.json（serve 4310 / build / lint / spec-typecheck / test）+ `reset` / `seed` target（`nx:run-commands` 跑脚本：删除 IndexedDB + 跑装载）
- 页面：展开树（`explodeBom` 结果按路径树形渲染、选中行联动面板）、算式面板（七步 rows + 字段来源标注）、评估日输入（date input）、直连写入面板（构造一条指回 SC-100 的边直连 INSERT，显示存储层错误）
- 位号编辑面（AC#2/#3）：PCBA 电阻三行可见可编辑位号清单；39/100 发布拒绝的错误直接展示
- 种子经 `loadScooterDataset`；服务封装 `rxdb.bom.explodeBom`

### 6. e2e（`apps/dev-rxdb-bom-e2e`）

- 参照 `dev-rxdb-angular-e2e` 接线（playwright）；AC#1~#6 各一条用例 + 既有库重开用例
- AC#1：`reset seed` 两遍后全表 dump 相同（在 e2e 里经 app 的 seed 状态或 vitest 面承担——e2e 承担「两遍 seed 页面相同」的可见面，逐字节在 vitest）

### 7. 门禁与回写

api-baseline 更新、覆盖率、affected full（含两个新 app）、故事回写（US-507 阶段 C 勾选 + US-525 阶段 A 勾选与关闭记录、epic/roadmap/status-overview 第 4 步记录）、specs/014 quickstart。
