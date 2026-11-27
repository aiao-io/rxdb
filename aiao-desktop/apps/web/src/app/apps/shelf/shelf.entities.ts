import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

import { SHELF_APPS, ShelfAppId } from './shelf-data';

/**
 * 媒体书架里的一行（分区）：播客、电视、图书、App Store 四个应用共用，`app` 区分是哪个应用，
 * `position` 决定这一行在页面里的次序。封面宽高比随分区存，一个应用的各行相同。
 */
@Entity({
  name: 'ShelfSection',
  tableName: 'shelf_section',
  namespace: 'desktop',
  properties: [
    { name: 'app', type: PropertyType.enum, enum: SHELF_APPS, required: true },
    { name: 'heading', type: PropertyType.string, required: true },
    { name: 'note', type: PropertyType.string },
    { name: 'ratio', type: PropertyType.number, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class ShelfSection extends EntityBase {
  /** 属于哪个书架应用。 */
  declare app: ShelfAppId;
  /** 这一行的标题，例如 `Up Next`。 */
  declare heading: string;
  /** 副标题；没有时是空串。页面顶部显示第一行的副标题。 */
  declare note: string;
  /** 封面的宽高比（宽 / 高）。 */
  declare ratio: number;
  /** 在应用里的次序，从 0 起。 */
  declare position: number;
}

/**
 * 书架分区里的一件内容（一档节目、一部剧、一本书或一个 App），`position` 是它在分区里的次序。
 * `sectionId` 指向所属的 `ShelfSection`；`app` 冗余存一份，方便一次取出整个应用的内容。
 */
@Entity({
  name: 'ShelfItem',
  tableName: 'shelf_item',
  namespace: 'desktop',
  properties: [
    { name: 'app', type: PropertyType.enum, enum: SHELF_APPS, required: true },
    { name: 'sectionId', columnName: 'section_id', type: PropertyType.string, required: true },
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'detail', type: PropertyType.string },
    { name: 'cover', type: PropertyType.integer, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class ShelfItem extends EntityBase {
  /** 属于哪个书架应用。 */
  declare app: ShelfAppId;
  /** 所属分区（`ShelfSection`）的 id。 */
  declare sectionId: string;
  /** 名称。 */
  declare title: string;
  /** 说明（集数、作者、类别……）；没有时是空串。 */
  declare detail: string;
  /** 封面用的照片序号。 */
  declare cover: number;
  /** 在分区里的次序，从 0 起。 */
  declare position: number;
}

/** 媒体书架要在桌面库里登记的实体。 */
export const SHELF_ENTITIES: readonly EntityType[] = [ShelfSection, ShelfItem];
