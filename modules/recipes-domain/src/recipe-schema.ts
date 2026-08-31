import { PropertyType, uuid } from '@aiao/rxdb';
import type { EntityMetadataOptions } from '@aiao/rxdb';

/**
 * Recipe 实体 schema 的单一来源。
 *
 * @remarks
 * `name` / `tableName` 与四个业务字段名逐字取自 `website/docs/adapters/http-protocol.md`
 * 的端到端示例（`Recipe` → `recipes`）。前端 {@link Recipe} 与后端 {@link ServerRecipe}
 * 都用这一份 schema 装饰，字段名漂移由 `recipe-schema.spec.ts` 的一致性测试在 CI 里变红，
 * 而不是在协议文档里被遗忘。
 *
 * `id` 刻意覆写为 {@link PropertyType.string}，而不是沿用 `EntityBase` 的
 * {@link PropertyType.uuid}：wire 协议把 `id` 定义成普通 string（http-protocol.md「通用约定」），
 * 而 pglite 会把 `uuid` 建成严格的 PostgreSQL `uuid` 列，拒绝 `client-supplied` / `dup` 这类
 * 非 UUID 字符串——`create` 采纳客户端 id、`by-ids` 的非 UUID id 都会在引擎里炸成 22P02。
 * 覆写后 `id` 仍是主键 + 唯一 + 只读 + `uuid()` 默认值，行为与基类一致，只是放宽了列类型
 * （与 wire 对齐）。
 */
export const RECIPE_SCHEMA = {
  name: 'Recipe',
  tableName: 'recipes',
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true,
      unique: true,
      readonly: true,
      default: () => uuid()
    },
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'status', type: PropertyType.string },
    { name: 'price', type: PropertyType.number },
    { name: 'tag', type: PropertyType.string, nullable: true }
  ]
} satisfies EntityMetadataOptions;
