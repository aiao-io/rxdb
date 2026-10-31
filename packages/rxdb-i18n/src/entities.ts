import { Entity, PropertyType, SyncType, type EntityType } from '@aiao/rxdb';
import type { MessageSource } from './catalog.js';

/** 当前设备的语言状态；不参与跨设备同步。 */
@Entity({
  namespace: 'i18n',
  name: 'I18nSettings',
  tableName: 'settings',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'deviceLocale', type: PropertyType.string },
    { name: 'devicePreferredLocale', type: PropertyType.string, nullable: true },
    { name: 'defaultLocale', type: PropertyType.string },
    { name: 'updatedAt', type: PropertyType.date }
  ]
})
export class I18nSettings {
  /** 固定为 singleton。 */
  id!: string;
  /** 宿主探测语言。 */
  deviceLocale!: string;
  /** 用户在本设备显式选择的语言。 */
  devicePreferredLocale!: string | null;
  /** 应用默认语言。 */
  defaultLocale!: string;
  /** 单调递增的本地修订时间，供响应式查询识别偏好变更。 */
  updatedAt!: Date;
}

/** 本地持久覆盖行，永不被远端目录清理。 */
@Entity({
  namespace: 'i18n',
  name: 'MessageEntry',
  tableName: 'messages',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'locale', type: PropertyType.string },
    { name: 'namespace', type: PropertyType.string },
    { name: 'key', type: PropertyType.string },
    { name: 'value', type: PropertyType.string },
    { name: 'source', type: PropertyType.enum, enum: ['bundle', 'db', 'remote'] },
    { name: 'updatedAt', type: PropertyType.date }
  ],
  indexes: [{ name: 'i18n_message_tuple', properties: ['locale', 'namespace', 'key'], unique: true }]
})
export class MessageEntry {
  /** locale、namespace、key 的确定性 JSON 编码。 */
  id!: string;
  /** 规范化语言。 */
  locale!: string;
  /** 命名空间。 */
  namespace!: string;
  /** 文案键。 */
  key!: string;
  /** ICU 源文案。 */
  value!: string;
  /** 本地覆盖的来源标记。 */
  source!: MessageSource;
  /** 最近更新时间。 */
  updatedAt!: Date;
}

/** 远端目录缓存，和 MessageEntry 分表以隔离 QueryCache orphan 清理。 */
@Entity({
  namespace: 'i18n',
  name: 'RemoteMessageEntry',
  tableName: 'remote_messages',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'locale', type: PropertyType.string },
    { name: 'namespace', type: PropertyType.string },
    { name: 'key', type: PropertyType.string },
    { name: 'value', type: PropertyType.string },
    { name: 'source', type: PropertyType.enum, enum: ['bundle', 'db', 'remote'] },
    { name: 'updatedAt', type: PropertyType.date }
  ],
  indexes: [{ name: 'i18n_remote_message_tuple', properties: ['locale', 'namespace', 'key'], unique: true }]
})
export class RemoteMessageEntry implements MessageEntry {
  /** locale、namespace、key 的确定性 JSON 编码。 */
  id!: string;
  /** 规范化语言。 */
  locale!: string;
  /** 命名空间。 */
  namespace!: string;
  /** 文案键。 */
  key!: string;
  /** ICU 源文案。 */
  value!: string;
  /** 远端缓存的来源标记。 */
  source!: MessageSource;
  /** 最近更新时间。 */
  updatedAt!: Date;
}

/** 缺失 key 的本地诊断行。 */
@Entity({
  namespace: 'i18n',
  name: 'MissingMessageEntry',
  tableName: 'missing_messages',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'locale', type: PropertyType.string },
    { name: 'namespace', type: PropertyType.string },
    { name: 'key', type: PropertyType.string },
    { name: 'updatedAt', type: PropertyType.date }
  ]
})
export class MissingMessageEntry {
  /** 语言、命名空间、key 的编码。 */
  id!: string;
  /** 缺失时语言。 */
  locale!: string;
  /** 命名空间。 */
  namespace!: string;
  /** 缺失键。 */
  key!: string;
  /** 首次观察时间。 */
  updatedAt!: Date;
}

/** 在 RxDB.init() 前把返回的实体加入 config.entities。 */
export const i18nEntities = (): EntityType[] => [I18nSettings, MessageEntry, RemoteMessageEntry, MissingMessageEntry];
