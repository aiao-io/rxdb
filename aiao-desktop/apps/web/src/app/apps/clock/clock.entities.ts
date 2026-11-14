import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 世界时钟里的一座城市，`position` 决定表盘的排列次序。
 * `offsetHours` 沿用原来的约定：与本机的时差（小时，可带小数），而不是时区名。
 */
@Entity({
  name: 'WorldClock',
  tableName: 'world_clock',
  namespace: 'desktop',
  properties: [
    { name: 'city', type: PropertyType.string, required: true },
    { name: 'offsetHours', columnName: 'offset_hours', type: PropertyType.number, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class WorldClock extends EntityBase {
  /** 城市名，例如 `Tokyo`。 */
  declare city: string;
  /** 与本机的时差（小时）。 */
  declare offsetHours: number;
  /** 在世界时钟里的次序，从 0 起。 */
  declare position: number;
}

/** 时钟应用要在桌面库里登记的实体。 */
export const CLOCK_ENTITIES: readonly EntityType[] = [WorldClock];
