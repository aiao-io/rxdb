import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

import { CALL_KINDS, CallKind } from './facetime-log';

/**
 * FaceTime 通话记录里的一条，新的在前（按 `startedAt` 倒序）。
 * 时间存成真实时刻，界面上的 `Today 3:40 PM`、`Yesterday` 之类文字由它按当下算出来。
 */
@Entity({
  name: 'FaceTimeCall',
  tableName: 'facetime_call',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'kind', type: PropertyType.enum, enum: CALL_KINDS, required: true },
    { name: 'duration', type: PropertyType.integer, required: true, default: 0 },
    { name: 'startedAt', columnName: 'started_at', type: PropertyType.date, required: true }
  ]
})
export class FaceTimeCall extends EntityBase {
  /** 对方的名字。 */
  declare name: string;
  /** 通话方向：打出、接入或未接。 */
  declare kind: CallKind;
  /** 通话时长（秒）；未接为 0。 */
  declare duration: number;
  /** 通话开始的时刻。 */
  declare startedAt: Date;
}

/** FaceTime 要在桌面库里登记的实体。 */
export const FACETIME_ENTITIES: readonly EntityType[] = [FaceTimeCall];
