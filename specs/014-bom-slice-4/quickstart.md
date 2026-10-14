# Quickstart: epic-009 首轮切片第 4 步（验证记录）

**日期**：2026-10-14 | **分支**：`claude/bom-related-work-77235b`

## 交付物

| 项 | 落点 |
| --- | --- |
| US-507 阶段 C 位号子表 | `BomLineDesignator` 实体（`(occurrenceId, designator)` 唯一、级联删除）、`designator_managed` 列、已发布头协议扩展、发布转移位号计数校验（两后端，错误给位号数与 qty 两数） |
| 七步中间值暴露 | `explodeBom` 需求行 `steps`（P/P'/G/G'/D/phantom 判定来源）+ `penetrations` 穿透记录（US-525 算式面板的展示输入） |
| SC-100 确定性种子 | `packages/rxdb-plugin-bom/src/testing/scooter-dataset.ts`（id 业务键 FNV-1a 派生、时间戳固定基准、批次号常量）+ `scooter-golden.ts`（手写 golden，不由被测 kernel 生成） |
| demo 应用 | `apps/dev-rxdb-bom`（Angular）：展开树 + 七步算式面板（第 5 步「工序损耗未交付」）+ 评估日显式输入 + 直连/表单双路径环演示 + 位号发布校验 + where-used 面板 |
| e2e | `apps/dev-rxdb-bom-e2e`（playwright）：AC#1~#6 六条用例 + 既有库重开用例 |

## 测试与门禁（截至当日）

- `rxdb-plugin-bom`:test — 208/208 通过（16 个 spec）；覆盖率 95.84% 语句 / 88.24% 分支 / 94.11% 函数 / 96.83% 行
- `dev-rxdb-bom`:lint / :test / build — 零警告；`dev-rxdb-bom-e2e`:lint / e2e — 7/7 全绿
- `audit:api-surface` — 83 个入口基线更新（testing 子路径、explosion 新导出）
- `audit:requirements` — 通过（100 条故事）
- affected full（279 任务，含两个新 app）— **279/279 全绿**（本机负载 flaky 轮转：sqlite-wasm backup kill 超时、rxdb-model-vue undo/redo 断言竞态、dev-rxdb-http-server 钩子超时，均单跑全绿、与本改动无关；第四次全量通过，nx 标记 3 个 flaky）

## 排障记录（第 4 步踩过的坑）

1. **PG uuid 输入是 8-4-4-4-12**：`deterministicId` 第二段漏了 `& 0xffff` 掩码（fnv1a32 是 8 位 hex、padStart 不截断），生成 8-8-4-4-12——wa-sqlite 的 TEXT 列不校验、PGlite 的 uuid 列保存即拒；PG 还校验变体位（第四组首字符 8/9/a/b）。
2. **PGlite 0.5.8 的 DEFERRABLE FK CASCADE 不生效**（探针：confdeltype 'c' 但删父行后子行仍在），行级触发器内 DML 同样不触发——位号级联走 `BomRepository.remove` 应用层（两后端一致）。
3. **PG BEFORE DELETE 触发器返回 NEW 会吞掉删除**：守卫函数统一 footer 按 `TG_OP` 返回（DELETE 放行时 `RETURN OLD`）。
4. **`rxdb.bom` 门面从未挂载**：`declare module` 只解决类型，运行时属性要在插件工厂里 `Object.defineProperty(db, 'bom', ...)`（search 插件先例）——前两步的测试都走 adapter 级函数，门面空转直到 demo 第一次调用才暴露。
5. **`updatedAt`/`createdBy` 是引擎强制刷新列**：update patch 传固定值也被覆盖——确定性比对（AC#1）在 dump 层排除这两列，`createdAt` 固定基准照常比对。
6. **多实例实体构造**：`new Entity()` 在多个 RxDB 实例间歧义（「registered with multiple RxDB instances」）——loadHistory/种子经 `entityManager.instantiate` 构造（缺省退化 new）。
7. **wa-sqlite 的 IDBBatchAtomicVFS 把全部 dbName 存在同一个 IndexedDB 库**（实测 `indexedDB.databases()` 只有 `IDBBatchAtomicVFS`）——demo 的 reset 删整个库（dev 环境专用，注释写明）。
8. **端口**：本机 4310 被 QQ 占用（非 HTTP 协议响应），demo 起在 4311（故事 INVEST 清单端口可调，e2e/launch 一致改 4311）。
9. **门禁**：新 app 的 `nx sync`（tsconfig references 推断）、demo build 的 `allowedCommonJsDependencies`、模板 a11y（click 需 keydown + tabindex）、member-ordering 等一批新项目脚手架问题按仓库先例逐一修齐。

## 首轮切片闭环

第 1~4 步全部交付：建 BOM → 按视图解析 → 多级展开 → where-used 反查 → 拒绝成环 → 数量与手算一致——
SC-100 一台电动滑板车的数据集在 demo 里一键走完全域，每个展开量旁边并排七步手算式。
