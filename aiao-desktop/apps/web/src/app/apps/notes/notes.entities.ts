import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 备忘录里的一条笔记。`body` 是可编辑区里的 HTML，`title` 保存时从正文的首个标题取出；
 * `folder` 是文件夹名（Notes 或 Recently Deleted）；`date` 是列表里显示和排序的日期，新建时取当前时间，
 * 之后编辑正文不改它。
 */
@Entity({
  name: 'Note',
  tableName: 'note',
  namespace: 'desktop',
  properties: [
    { name: 'folder', type: PropertyType.string, required: true },
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'body', type: PropertyType.string, required: true },
    { name: 'date', type: PropertyType.date, required: true },
    { name: 'pinned', type: PropertyType.boolean, default: false }
  ]
})
export class Note extends EntityBase {
  declare folder: string;
  declare title: string;
  declare body: string;
  declare date: Date;
  declare pinned: boolean;
}

/** 用户创建的 Notes 文件夹目录；系统文件夹仍是虚拟项，不写入这张表。 */
@Entity({
  name: 'NoteFolder',
  tableName: 'note_folder',
  namespace: 'desktop',
  properties: [{ name: 'name', type: PropertyType.string, required: true }],
  indexes: [{ name: 'note_folder_name', properties: ['name'], unique: true }]
})
export class NoteFolder extends EntityBase {
  declare name: string;
}

/** 备忘录登记到桌面库的实体。 */
export const NOTES_ENTITIES: readonly EntityType[] = [Note, NoteFolder];
