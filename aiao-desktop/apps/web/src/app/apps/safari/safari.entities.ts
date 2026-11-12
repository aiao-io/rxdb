import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * Safari 的收藏夹条目：起始页、收藏栏、侧栏与「书签」菜单共用，`position` 决定先后。
 * 只存用户的书签本身；网页内容不进库。
 */
@Entity({
  name: 'SafariBookmark',
  tableName: 'safari_bookmark',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'color', type: PropertyType.string, required: true },
    { name: 'url', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class SafariBookmark extends EntityBase {
  /** 显示名，例如 `Wikipedia`。 */
  declare name: string;
  /** 没有站点图标时用的色块，CSS 颜色值。 */
  declare color: string;
  /** 地址，不带协议，例如 `news.ycombinator.com`。 */
  declare url: string;
  /** 在收藏夹里的次序，从 0 起。 */
  declare position: number;
}

/** 阅读列表里的一篇，`position` 决定先后。 */
@Entity({
  name: 'SafariReadingItem',
  tableName: 'safari_reading_item',
  namespace: 'desktop',
  properties: [
    { name: 'url', type: PropertyType.string, required: true },
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class SafariReadingItem extends EntityBase {
  /** 地址，不带协议。 */
  declare url: string;
  /** 显示名。 */
  declare title: string;
  /** 在阅读列表里的次序，从 0 起。 */
  declare position: number;
}

/**
 * 浏览历史里的一个地址：同一个地址只留一行，再次访问只更新 `visitedAt`；
 * 库里最多留最近的 24 行，喂给「历史记录」菜单和起始页。
 */
@Entity({
  name: 'SafariHistoryEntry',
  tableName: 'safari_history_entry',
  namespace: 'desktop',
  properties: [
    { name: 'url', type: PropertyType.string, required: true, unique: true },
    { name: 'visitedAt', columnName: 'visited_at', type: PropertyType.date, required: true }
  ]
})
export class SafariHistoryEntry extends EntityBase {
  /** 访问过的地址，和地址栏里的写法一致。 */
  declare url: string;
  /** 最近一次访问的时刻。 */
  declare visitedAt: Date;
}

/** Safari 要在桌面库里登记的实体。 */
export const SAFARI_ENTITIES: readonly EntityType[] = [SafariBookmark, SafariReadingItem, SafariHistoryEntry];
