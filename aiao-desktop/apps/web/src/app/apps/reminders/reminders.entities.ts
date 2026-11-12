import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 提醒事项里的一条提醒。`due` 是原样显示的时间说明（不是可计算的日期），
 * `tint` 是完成后圆圈的颜色，`position` 是列表顺序（新建的排到最前）。
 */
@Entity({
  name: 'Reminder',
  tableName: 'reminder',
  namespace: 'desktop',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'due', type: PropertyType.string, required: true },
    { name: 'done', type: PropertyType.boolean, default: false },
    { name: 'tint', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class Reminder extends EntityBase {
  declare title: string;
  declare due: string;
  declare done: boolean;
  declare tint: string;
  declare position: number;
}

/** 提醒事项登记到桌面库的实体。 */
export const REMINDERS_ENTITIES: readonly EntityType[] = [Reminder];
