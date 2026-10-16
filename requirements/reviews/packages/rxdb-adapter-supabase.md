# Review：rxdb-adapter-supabase

## 结论

🟡 首轮 1 P1 + 1 P2 已修复并经二次评审复核；二次评审新确认 4 条遗留问题（3 P2 + 1 P3），集中在自定义 `columnName` 配置的批量写路径与审计字段一致性。

## 检查范围

检查了 `package.json` 的 Supabase/tree peer、`project.json` 的 test-env/test/sql-security target、README/RLS 接入说明；走读 `RxDBAdapterSupabase.ts`、`SupabaseRepository.ts`、`SupabaseTreeRepository.ts`、`transform.ts`、`rule_group_builder.ts`、`pagination.ts`、同步/推送/RLS/SQL 安全模块，并核对 `src/__tests__/**`（CRUD、sync、tree、分页、RLS 和回归探针）。

## 已处理（二次评审复核）

### P1：Supabase Repository 硬编码物理主键 `id` — 已修复（主键列映射）

- 修复：`SupabaseRepository.ts` 的 `create/update/remove/find` 统一经 `primary_key_column()`（`propertyMap.get('id')?.columnName ?? 'id'`）映射物理主键列；`rule_group_builder.ts` 的 `resolve_column_name` 与 `RxDBAdapterSupabase.ts` 的 `fetchMetadata` / `executeDelete` / `#findByIdsInChunks` 同步跟进。
- 契约校准：二次评审确认远端表 DDL 契约是**属性名即列名**（`docker/sql/03-business-tables.sql` 开头注释「字段名以实体属性名为准」，README:167「camelCase 列名加引号」）。首轮建议的「全字段 columnName 映射」会破坏该契约，故 `7ff0bc8c` 回退为「仅主键列映射、其余字段保持属性名」是正确方向。首轮 P1 原文把非主键字段也计入修复范围，属于过度外推。
- 回归与验证：`applyRuleGroup.spec.ts` 新增自定义主键映射用例、`transform.spec.ts` 新增物理主键列映射回 `id` 用例；二次评审在 Node 26.7 下运行两份 spec：**67/67 通过**；`typecheck` 通过。

### P2：数值/BigInt parentId 被 `hasChildren` 判定丢弃 — 已修复

- 修复：`SupabaseTreeRepository.collectParents()`（`SupabaseTreeRepository.ts:368-377`）改为 `parentId == null` 判空 + `String(parentId)` 归一，与 `findDescendants`/`findAncestors` 的 `String(node[primaryKeyColumn])` 判据一致；数值/BigInt 父节点不再被误判为叶子。

## 发现（二次评审新确认，尚未处理）

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

## 风险/未覆盖

真实 Supabase RLS/分页/多租户行为仍需 `test-env`（本机 Docker 不可用，未跑 612 例全套）；自定义主键/数值树 ID 的真实 PostgREST 用例未补。

## 建议验证

修复后执行 `pnpm nx run rxdb-adapter-supabase:test-env`、`pnpm nx test rxdb-adapter-supabase`、`pnpm nx run rxdb-adapter-supabase:sql-security-regressions`，并增加自定义主键 × saveMany/mutations/mergeChanges 与自定义 `updatedBy` 列名的真实 PostgREST 用例。
