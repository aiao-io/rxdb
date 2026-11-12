import { PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * Macintosh HD 上的一个文件或文件夹。目录树（邻接表的 `parentId`）与元数据都在 SQLite 里；
 * 文件体由 storage 插件放在 OPFS，`contentId` 指向它的元数据行（空文件没有文件体）。
 */
@TreeEntity({
  name: 'DesktopFile',
  tableName: 'desktop_file',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'type', type: PropertyType.enum, enum: ['file', 'folder'], required: true },
    { name: 'size', type: PropertyType.integer, required: true, default: 0 },
    { name: 'mimeType', columnName: 'mime_type', type: PropertyType.string, nullable: true },
    { name: 'contentId', columnName: 'content_id', type: PropertyType.string, nullable: true },
    { name: 'modifiedAt', columnName: 'modified_at', type: PropertyType.date, required: true }
  ],
  features: { tree: { type: 'adjacency-list', hasChildren: false } },
  indexes: [
    {
      name: 'desktop_file_parent_name',
      properties: ['parentId', 'name'],
      unique: true,
      normalized: true
    }
  ]
})
export class DesktopFile extends TreeAdjacencyListEntityBase {
  name!: string;
  type!: 'file' | 'folder';
  size!: number;
  mimeType!: string | null;
  contentId!: string | null;
  modifiedAt!: Date;
}
