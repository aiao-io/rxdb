import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 无边记画板上的一笔：颜色，加上依次经过的点（相对画布左上角的 CSS 像素）。
 * 只有一块共用的画板，所以按落笔先后（`createdAt`）排就是画出来的先后。
 */
@Entity({
  name: 'FreeformStroke',
  tableName: 'freeform_stroke',
  namespace: 'desktop',
  properties: [
    { name: 'color', type: PropertyType.string, required: true },
    { name: 'points', type: PropertyType.json, required: true }
  ]
})
export class FreeformStroke extends EntityBase {
  /** 笔色，CSS 颜色值。 */
  declare color: string;
  /** 经过的点 `[x, y]`，至少两个。 */
  declare points: readonly (readonly [number, number])[];
}

/** 无边记要在桌面库里登记的实体。 */
export const FREEFORM_ENTITIES: readonly EntityType[] = [FreeformStroke];
