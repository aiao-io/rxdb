import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

// 字段一律用 `declare`：读写由 RxDB 的实体代理接管，写成 `name!: string` 在 `useDefineForClassFields` 下会
// 真的定义一个值为 `undefined` 的自有属性，把代理的取值器盖掉。

/** 侧栏里的一个邮箱（Inbox、Sent…）。`badge` 是徽标上的固定数字，不随已读变化。 */
@Entity({
  name: 'MailMailbox',
  tableName: 'mail_mailbox',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'icon', type: PropertyType.string, required: true },
    { name: 'badge', type: PropertyType.integer, nullable: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'mail_mailbox_name', properties: ['name'], unique: true }]
})
export class MailMailbox extends EntityBase {
  /** 邮箱名，也是邮件 `mailbox` 字段引用的键。 */
  declare name: string;
  /** 图标名（图标表里的 id）。 */
  declare icon: string;
  /** 侧栏徽标上的数字；`null` 不显示徽标。 */
  declare badge: number | null;
  /** 侧栏里的顺序，小的在前。 */
  declare position: number;
}

/**
 * 一封邮件：收到的放在 Inbox，从写邮件面板发出的放在 Sent。已读与旗标是用户改的状态，其余字段不再变。
 * 时间文字（`timeLabel`）是写死的显示串，不是时间戳：初始邮件的 “Yesterday” 这类文字没有对应的时刻。
 */
@Entity({
  name: 'MailMessage',
  tableName: 'mail_message',
  namespace: 'desktop',
  properties: [
    { name: 'mailbox', type: PropertyType.string, required: true },
    { name: 'sender', type: PropertyType.string, required: true },
    { name: 'recipient', type: PropertyType.string },
    { name: 'subject', type: PropertyType.string },
    { name: 'body', type: PropertyType.string },
    { name: 'timeLabel', columnName: 'time_label', type: PropertyType.string, required: true },
    { name: 'color', type: PropertyType.string, required: true },
    { name: 'unread', type: PropertyType.boolean, default: false },
    { name: 'flagged', type: PropertyType.boolean, default: false },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class MailMessage extends EntityBase {
  /** 所在邮箱的名字（{@link MailMailbox.name}）。 */
  declare mailbox: string;
  /** 发件人。 */
  declare sender: string;
  /** 收件人；写邮件时可以留空。 */
  declare recipient: string;
  declare subject: string;
  /** 正文；列表里只显示前两行（样式截断），阅读区显示全文。 */
  declare body: string;
  /** 列表右侧与阅读区显示的时间文字。 */
  declare timeLabel: string;
  /** 头像底色。 */
  declare color: string;
  declare unread: boolean;
  /** 打了旗：不论在哪个邮箱，都会出现在 Flagged 里。 */
  declare flagged: boolean;
  /** 列表顺序，小的在前；新发出的邮件取当前最小值减一，排在最前面。 */
  declare position: number;
}

/** 邮件应用的全部实体，登记进 `DESKTOP_ENTITIES`。 */
export const MAIL_ENTITIES: readonly EntityType[] = [MailMailbox, MailMessage];
