import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

// 字段一律用 `declare`：读写由 RxDB 的实体代理接管，写成 `name!: string` 在 `useDefineForClassFields` 下会
// 真的定义一个值为 `undefined` 的自有属性，把代理的取值器盖掉。

/**
 * 一条语音备忘录的元数据。应用还没有录音功能，也就没有音频内容，所以只存标题、时间和时长；
 * 波形与播放进度是界面上现算的运行时状态，不进库。
 */
@Entity({
  name: 'VoiceMemo',
  tableName: 'voice_memo',
  namespace: 'desktop',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'recordedLabel', columnName: 'recorded_label', type: PropertyType.string, required: true },
    { name: 'duration', type: PropertyType.integer, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class VoiceMemo extends EntityBase {
  declare title: string;
  /** 列表里显示的录制时间文字（“Today 4:02 PM”、“Yesterday”），是写死的显示串而不是时间戳。 */
  declare recordedLabel: string;
  /** 时长，秒。 */
  declare duration: number;
  /** 列表顺序，小的在前。 */
  declare position: number;
}

/** 语音备忘录应用的全部实体，登记进 `DESKTOP_ENTITIES`。 */
export const VOICE_MEMOS_ENTITIES: readonly EntityType[] = [VoiceMemo];
