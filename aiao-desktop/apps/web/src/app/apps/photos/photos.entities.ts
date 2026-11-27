import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

// 字段一律用 `declare`：读写由 RxDB 的实体代理接管，写成 `name!: string` 在 `useDefineForClassFields` 下会
// 真的定义一个值为 `undefined` 的自有属性，把代理的取值器盖掉。

/** 照片 App 侧栏里的一个相簿。导入的照片第一次进来时才建出「Imported」。 */
@Entity({
  name: 'PhotoAlbum',
  tableName: 'photo_album',
  namespace: 'desktop',
  properties: [{ name: 'name', type: PropertyType.string, required: true }],
  indexes: [{ name: 'photo_album_name', properties: ['name'], unique: true }]
})
export class PhotoAlbum extends EntityBase {
  /** 相簿名，也是照片 `album` 字段引用的键；侧栏按它排序。 */
  declare name: string;
}

/**
 * 图库里的一张照片。库里只存元数据与外网图片的地址（`thumb`），图片本身不进库；
 * 收藏与删除是用户改的状态，导入的照片是用户加的。
 */
@Entity({
  name: 'PhotoAsset',
  tableName: 'photo_asset',
  namespace: 'desktop',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'place', type: PropertyType.string },
    { name: 'credit', type: PropertyType.string, required: true },
    { name: 'album', type: PropertyType.string, required: true },
    { name: 'date', columnName: 'photo_date', type: PropertyType.string, required: true },
    { name: 'thumb', type: PropertyType.string, required: true },
    { name: 'favourite', type: PropertyType.boolean, default: false },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class PhotoAsset extends EntityBase {
  declare title: string;
  /** 拍摄地点；没有就是空串。 */
  declare place: string;
  /** 摄影师署名。 */
  declare credit: string;
  /** 所在相簿的名字（{@link PhotoAlbum.name}）。 */
  declare album: string;
  /** `YYYY-MM-DD`；按日历日存串而不是时间戳，避免时区把日期推到前一天。 */
  declare date: string;
  /** 维基共享资源上的缩略图地址，任意宽度都能由它换算。 */
  declare thumb: string;
  declare favourite: boolean;
  /** 图库顺序，小的在前；导入的照片取当前最小值减一，排在最前面。 */
  declare position: number;
}

/** 照片应用的全部实体，登记进 `DESKTOP_ENTITIES`。 */
export const PHOTOS_ENTITIES: readonly EntityType[] = [PhotoAlbum, PhotoAsset];
