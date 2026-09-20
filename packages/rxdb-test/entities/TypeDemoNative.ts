import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 本地专用类型演示实体：`bigint` 与 `binary`。
 *
 * @remarks
 * SQLite family 与 PGlite 本地 adapter 支持这两种类型的持久化与查询；
 * Supabase remote 不支持（注册期抛 `SupabaseUnsupportedPropertyTypeError`），
 * 因此不能放进 {@link ./TypeDemo.ts}（supabase 测试与远端表都注册它），单独成实体。
 * 本实体只注册在支持它的本地 demo 与适配器测试里。
 */
@Entity({
  name: 'TypeDemoNative',
  tableName: 'type_demo_native',
  properties: [
    {
      displayName: '大整数',
      name: 'bigintValue',
      type: PropertyType.bigint,
      sortable: true,
      nullable: true
    },
    {
      displayName: '字节序列',
      name: 'binaryValue',
      type: PropertyType.binary,
      nullable: true
    }
  ]
})
export class TypeDemoNative extends EntityBase {}
