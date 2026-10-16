# Quickstart: epic-009 首轮切片第 1 步（验证记录）

**日期**：2026-10-13 | **分支**：`claude/bom-related-work-77235b`

## 交付物

| 项                  | 落点                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-030 阶段 A/B/C   | `packages/rxdb/src/entity/`（类型 / 合并 / 校验 / 编译）、`system/sql-literal.ts`、`system/constraint-violations.ts`、`RxDBError.ts`（三个新错误类）、`RxDB.ts`（漂移检查调用点）、两适配器的建表 DDL / 排他触发器 / 漂移实现 / 写路径归一 |
| SQLite ≥ 3.47 门槛  | `RxDBAdapterSqliteBase.connect()`（每实例一次、点名实际版本与门槛）                                                                                                                                                                        |
| Tauri rusqlite 0.33 | `packages/rxdb-adapter-tauri/rust/Cargo.toml` + 两份 Cargo.lock（SQLite 3.48.0），代码零改动                                                                                                                                               |
| US-507 阶段 A/B     | `packages/rxdb-plugin-bom`（新包）：五个实体、BomRepository、双后端触发器 DDL、十进制值合同                                                                                                                                                |
| qty 存储段          | `decimal.utils.ts`（入口规范化）+ 双后端格式触发器（US-511 AC#22 ①/②、AC#23）                                                                                                                                                              |

## 测试与门禁（截至当日）

- `rxdb-plugin-bom`:test — 22/22 通过（wa-sqlite + pglite 双后端）；覆盖率 96.9% 语句 / 88.7% 分支（≥ 80%）
- `rxdb`:test — 全量通过（含 3 个新 spec；内联快照随 `checks` 字段新增更新）
- `rxdb-adapter-sqlite-core`:test — 全量通过（含版本门槛单测；既有 mock 版本 3.0.0 → 3.53.1）
- `rxdb-adapter-wa-sqlite`:test — 876 通过（含 `constraintSuite`：CHECK / 条件唯一 / 区间排他 / AC#14 重放 / 漂移）
- `rxdb-adapter-pglite`:test — 全量通过（含 `constraints.spec.ts`）
- `rxdb-adapter-tauri:cargo-check / cargo-clippy / cargo-test` — 全绿（rusqlite 0.33，零代码改动）
- `audit:api-surface:update` — rxdb 新导出 + 新包基线已登记

## 排障记录（第 1 步踩过的坑）

1. **wa-sqlite GLOB 语义**：`X*` 是「X 一次 + 通配」，不是正则的「零次或多次」——十进制格式触发器改用 `[^0-9.]` 反类 + `substr`/`instr`/`replace` 逐字节谓词。
2. **PGlite 0.5.8 扩展协议**：裸 `CREATE TRIGGER` 任何形态都解析失败（`at or near ";"` / `at end of input`）；`EXECUTE FUNCTION` 的目标带引号（`"bom"."fn"`）同样失败——触发器包进 `DO $$` 块、函数目标裸写（插件名在安全标识符集内），与 notify 触发器先例同形态。
3. **PG 关系列在建表后才有**：EXCLUDE 引用 `lineId` 等关系列时不能内联进 CREATE TABLE，改为延后的 `ALTER TABLE ADD CONSTRAINT`（`isDeferredStatement` 阶段）。
4. **plpgsql 不补行前缀**：守卫函数里裸列名要写 `NEW.`/`OLD.`，DELETE 触发器按 `TG_OP` 选行。
5. **仓储注册时机**：`inject: ['adapter:local']` 把 install 推到连接后，而实体校验在连接前——BomRepository 门面注册放插件构造函数；适配器侧 `BomRepository` → 默认仓储（tree 先例）。
6. **测试装配**：实体装饰器在 RxDB 实例间是全局单例注册，同一后端的多条用例共享一个 adapter；直连 SQL 的表名两端不同（`bom$表` vs `bom"."表`）。
7. **快照**：`transitionMetadata` 新字段（`checks`/`exclusions`）进既有内联快照，`-u` 一次性更新。
8. **btree_gist 不能恒注入**：vite 打包把 tarball 内联成 data: URL，PGlite nodefs 读不了（Node 端启动即崩）——按实体是否声明 exclusions 在适配器构造函数注入。

## 下一步（第 2 步）

US-508（视图解析）+ US-509（判环，不依赖可达性表的 AC）+ US-510 阶段 A。
