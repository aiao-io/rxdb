import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 通讯录里的一位联系人。`position` 是列表里的顺序（初始数据的顺序不是按字母排的），
 * `color` 是头像底色，`address` 显示在联系人卡片的 home 一栏。
 */
@Entity({
  name: 'Contact',
  tableName: 'contact',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'role', type: PropertyType.string, required: true },
    { name: 'color', type: PropertyType.string, required: true },
    { name: 'email', type: PropertyType.string, required: true },
    { name: 'address', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class Contact extends EntityBase {
  declare name: string;
  declare role: string;
  declare color: string;
  declare email: string;
  declare address: string;
  declare position: number;
}

/** 通讯录登记到桌面库的实体。 */
export const CONTACTS_ENTITIES: readonly EntityType[] = [Contact];
