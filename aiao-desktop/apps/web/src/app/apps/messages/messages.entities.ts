import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

// 字段一律用 `declare`：读写由 RxDB 的实体代理接管，写成 `name!: string` 在 `useDefineForClassFields` 下会
// 真的定义一个值为 `undefined` 的自有属性，把代理的取值器盖掉。

/**
 * 信息里的一段会话（一个人或一个群）。列表顺序由 `position` 决定：新建的会话排在最前面，
 * 发消息不会改变顺序。时间文字（`timeLabel`）是写死的显示串，不是时间戳。
 */
@Entity({
  name: 'ChatThread',
  tableName: 'chat_thread',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'color', type: PropertyType.string, required: true },
    { name: 'timeLabel', columnName: 'time_label', type: PropertyType.string, required: true },
    { name: 'isGroup', columnName: 'is_group', type: PropertyType.boolean, default: false },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class ChatThread extends EntityBase {
  /** 对方或群的名字。 */
  declare name: string;
  /** 头像底色。 */
  declare color: string;
  /** 列表右侧的时间文字。 */
  declare timeLabel: string;
  /** 是群聊。 */
  declare isGroup: boolean;
  /** 列表顺序，小的在前；新建会话取当前最小值减一，排在最前面。 */
  declare position: number;
}

/** 会话里的一条消息；`position` 是它在本会话里的次序，从 0 起，新消息取当前最大值加一。 */
@Entity({
  name: 'ChatMessage',
  tableName: 'chat_message',
  namespace: 'desktop',
  properties: [
    { name: 'threadId', columnName: 'thread_id', type: PropertyType.string, required: true },
    { name: 'sender', type: PropertyType.enum, enum: ['me', 'them'], required: true },
    { name: 'text', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'chat_message_thread_position', properties: ['threadId', 'position'], unique: true }]
})
export class ChatMessage extends EntityBase {
  /** 所属会话（{@link ChatThread.id}）。 */
  declare threadId: string;
  /** 谁发的：我，或对方。 */
  declare sender: 'me' | 'them';
  declare text: string;
  declare position: number;
}

/** 信息应用的全部实体，登记进 `DESKTOP_ENTITIES`。 */
export const MESSAGES_ENTITIES: readonly EntityType[] = [ChatThread, ChatMessage];
