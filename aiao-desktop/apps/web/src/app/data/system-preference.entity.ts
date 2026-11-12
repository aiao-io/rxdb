import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 系统级的一条键值：系统设置（外观、壁纸、Dock…）、桌面图标位置、最近使用，以及各数据域的种子标记。
 * 值是 JSON，读写由 {@link Preferences} 统一做类型收窄。
 */
@Entity({
  name: 'SystemPreference',
  tableName: 'system_preference',
  namespace: 'desktop',
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'value', type: PropertyType.json, nullable: true }
  ],
  indexes: [{ name: 'preference_key', properties: ['key'], unique: true }]
})
export class SystemPreference extends EntityBase {
  /* 一律用 declare：字段读写由 RxDB 的实体代理接管，写成 `x!: T` 会在类字段语义下盖掉代理。 */
  declare key: string;
  declare value: unknown;
}
