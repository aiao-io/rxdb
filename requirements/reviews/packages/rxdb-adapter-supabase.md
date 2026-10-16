# Review：rxdb-adapter-supabase

## 结论

🔴 发现 1 个 P1、1 个 P2，均涉及已支持的实体 ID 类型/元数据在远端仓库中被丢失。

## 检查范围

检查了 `package.json` 的 Supabase/tree peer、`project.json` 的 test-env/test/sql-security target、README/RLS 接入说明；走读 `RxDBAdapterSupabase.ts`、`SupabaseRepository.ts`、`SupabaseTreeRepository.ts`、`transform.ts`、`rule_group_builder.ts`、`pagination.ts`、同步/推送/RLS/SQL 安全模块，并核对 `src/__tests__/**`（CRUD、sync、tree、分页、RLS 和回归探针）。

## 发现

### P1：Supabase Repository 硬编码物理主键 `id`

- 证据：`SupabaseRepository.ts:168-176` 的 `create()` 直接把实体对象 spread 后发送；`203-207` 的 `update()` 使用 `.eq('id', entity.id)`；`223-225` 的 `remove()` 使用 `.eq('id', ...)` 和 `.select('id')`。`SupabaseRepository.ts:95-99` 分页稳定排序也固定 `.order('id')`。此外 `transform.ts:53-60` 用返回行的物理列名直接查 `propertyMap` 并写回实体，没有使用已有的 `columnNameToPropertyName` 反向映射。
- 影响：RxDB 元数据允许属性（包括主键 `id`）通过 `columnName` 映射到其他物理列（sqlite-core 的 `get_primary_key_column()` 已按 metadata 解析），但 Supabase 路径既不把 create 的属性名映射为物理列，也不按映射列更新/删除/排序，读回时还把物理列名当 JS 属性名。配置 `id`→`entity_id` 或 `firstName`→`first_name` 时，create 会提交错误列，update/remove/find 可能找不到行或返回带错误字段名的对象，超过一页的 find 还会按不存在的 `id` 排序。
- 建议：集中使用 metadata 的属性↔物理列双向映射；create/update/remove/select/order 全部使用物理列，`transform_row_to_entity` 通过 `columnNameToPropertyName` 映射回 JS 属性。补充自定义属性/主键列的真实 Supabase CRUD、分页与转换测试。

### P2：数值/BigInt parentId 被 `hasChildren` 判定丢弃

- 证据：`SupabaseTreeRepository.ts:256-262` 明确按 `String(currentId)` 处理 `RxDBEntityId`，并注释承认 PostgREST 的 `parentId` 可能是 number 或 string；但 `collectParents()` 在 `360-367` 只接受 `typeof parentId === 'string'`，然后用字符串集合匹配。
- 影响：实体 ID 合同包含 `string | number | bigint`。当数据库返回数值 parentId 时，`findParentsWithChildren()` 不会把父节点加入集合，树查询返回的 `hasChildren` 对非叶节点为 false；UI 展开按钮、增量树逻辑会错误地把有子节点的节点当叶子。当前 Supabase 测试只覆盖字符串 UUID，未覆盖数值 parentId/hasChildren。
- 建议：以统一的实体 ID canonical 化函数（至少 `String(parentId)`，并保留 bigint 不丢精度）写入/比较集合；补 numeric、bigint parentId 与 `hasChildren` 回归。

## 风险/未覆盖

未发现其他可定位问题。自定义主键列和数值 parentId 在 `src/__tests__` 中没有覆盖；真实 Supabase RLS/分页/多租户行为仍需 test-env。当前工作树 Nx daemon 返回 EPERM，Node 22 也低于仓库要求 Node >=26，未执行完整门禁。

## 建议验证

修复后执行 `pnpm nx run rxdb-adapter-supabase:test-env`、`pnpm nx test rxdb-adapter-supabase`、`pnpm nx run rxdb-adapter-supabase:sql-security-regressions`，并增加自定义主键/数值树 ID 的真实 PostgREST 用例。
