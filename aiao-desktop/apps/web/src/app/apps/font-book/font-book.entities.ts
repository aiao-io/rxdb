import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 字体册里装着的一个字体族（本机已安装的字体目录），`position` 决定它在 Family 列表里的次序。
 * 只存字体族本身的信息；字形来自浏览器，不进库。
 */
@Entity({
  name: 'FontFamily',
  tableName: 'font_family',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true, unique: true },
    { name: 'stack', type: PropertyType.string, required: true },
    { name: 'styles', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class FontFamily extends EntityBase {
  /** 字体族名，例如 `Helvetica Neue`。 */
  declare name: string;
  /** 套用到示例文字上的 CSS `font-family` 声明（含回退字体）。 */
  declare stack: string;
  /** 字重说明，例如 `Regular · Bold · Italic`。 */
  declare styles: string;
  /** 在 Family 列表里的次序，从 0 起。 */
  declare position: number;
}

/** 字体册要在桌面库里登记的实体。 */
export const FONT_BOOK_ENTITIES: readonly EntityType[] = [FontFamily];
