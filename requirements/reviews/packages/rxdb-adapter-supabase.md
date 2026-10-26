---
package: rxdb-adapter-supabase
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-supabase 增量代码评审

## 结论

🟡 待处理：3 条 P2、1 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 2 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`967aa658 12313`；`9361d916 q`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P2：`update()` 的 `updatedBy` 审计字段仍按物理列名写入，与属性名契约不一致（`7ff0bc8c` 回退引入）

- 证据：`SupabaseRepository.ts:204-208`。`normalize_supabase_update` 已把整个 patch 归一为**属性名**键（与 `create()` 的 `entityData['createdBy']/['updatedBy']`、`executeUpsert` 的 `{...entity, updatedBy: userId}` 一致），唯独 208 行 `patchData[updatedBy.columnName] = userId` 用物理列名。基线 `94df0a04` 上 patch 整体以物理列名键控，这行是对的；回退后变成全文件唯一的例外。
- 影响：`updatedBy` 声明自定义 `columnName`（如 `updated_by`）且 `context.userId` 存在时，update 请求体混入不存在的物理列 → PostgREST 400，带登录用户的每次 update 都失败；默认列名（`columnName === name`）无影响。
- 建议：改为 `patchData['updatedBy'] = userId`，与 create/upsert 对齐；补自定义 `columnName` + userId 的 update 回归。

### P2：批量写路径未做主键列映射，自定义主键支持不完整（`saveMany` / `mutations` / `mergeChanges`）

- 证据：`RxDBAdapterSupabase.ts:729-740`（`executeUpsert` 直接 `{ ...entity, updatedBy: userId }`，无 `create()` 同款 `primaryKeyColumn !== 'id'` 重映射）；`RxDBAdapterSupabase.utils.ts:35-78`（`build_upsert_params` 原样下发实体）；`supabase.merge-changes.ts` 的 p_upserts/p_updates 载荷同样原样下发。服务端 `docker/sql/04-rxdb-utils-functions.sql:39` 的 `rxdb_batch_upsert` 硬编码 `ON CONFLICT (id)`，即使客户端补上映射，RPC 冲突目标也仍是 `id`。
- 影响：主键 `columnName` 自定义时，单实体 CRUD / find / 分页 / 树查询已可用，但 `saveMany`、事务 `mutations` 与同步 `mergeChanges` 仍按 `id` 下发/判冲突 → PostgREST 列不存在错误或冲突目标错误。首轮修复声明「覆盖 CRUD」未含这三条批量路径。
- 建议：二选一——(a) 把主键重映射补进 `executeUpsert`、`build_upsert_params` 与 merge payload，并让 `rxdb_batch_upsert` 接收冲突列参数（或按目标表解析）；(b) 在 README 明确声明「Supabase 适配器仅支持默认 `id` 主键列，`columnName` 只对查询路径生效」。无论哪种，需把批量路径与单实体路径的口径统一。

### P2：树查询的 `parent_column_name()` 与 CRUD 的父列解析口径不一致

- 证据：`SupabaseTreeRepository.ts:389-395` 用 `relationMap.get('parent')?.columnName ?? propertyMap.get('parentId')?.columnName ?? 'parentId'`（物理列名），而 `normalize_supabase_update`（`SupabaseRepository.ts:37-48`）把外键映射回**属性名** `parentId`。
- 影响：`parentId` / parent 关系声明自定义 `columnName`（如 `parent_id`）时，update 写 `parentId`、树查询查 `parent_id`——同一部署下必有一侧打不中列。按「属性名即列名」契约，树查询应查 `parentId`；按 columnName 语义则 CRUD 应写 `parent_id`。当前实现两头各取一半。
- 建议：与 P2（批量路径）一并裁定契约：要么父列统一走 columnName（CRUD 侧跟着改），要么统一走属性名（`parent_column_name()` 固定返回 `'parentId'`）。

### P3：`#findByIdsInChunks` 回填 `id` 时保留物理键且绕过 `transform_row_to_entity`

- 证据：`RxDBAdapterSupabase.ts:1023-1028`，`{ ...row, id: row[primaryKeyColumn] }` 未删除物理键（如 `todo_key`），且不做 Date/boolean 类型还原。首轮修复原本用 `transform_row_to_entity`，`7ff0bc8c` 为兼容性换回裸映射。
- 影响：仅自定义主键列时出现：实体对象带多余枚举属性 `todo_key`；若这些对象再经 `saveMany` 下发，`{...entity}` 会把物理键一并送出。QueryCache `findByIds` 返回值的时间字段保持字符串形态（与基线一致，非回归）。
- 建议：改为 `transform_row_to_entity`（其 `columnNameToPropertyName` 反向映射已能正确还原主键），或至少在自定义主键分支删除物理键。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
