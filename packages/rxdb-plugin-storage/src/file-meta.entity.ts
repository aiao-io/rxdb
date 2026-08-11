/**
 * @fileoverview 存储文件元数据实体
 * 定义文件存储的元数据结构，包括文件名、MIME类型、大小、路径等
 *
 * @module rxdb-plugin-storage/file-meta-entity
 */

import { Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';

/** OPFS 文件对应的持久化 metadata 实体。 */
@Entity({
  namespace: 'storage',
  name: 'StorageFileMeta',
  tableName: 'storage_file_meta',
  log: false,
  sync: {
    type: SyncType.None
  },
  properties: [
    {
      name: 'name',
      type: PropertyType.string,
      required: true
    },
    {
      name: 'mimeType',
      columnName: 'mime_type',
      type: PropertyType.string,
      required: true
    },
    {
      name: 'size',
      type: PropertyType.number,
      required: true
    },
    {
      name: 'opfsPath',
      columnName: 'opfs_path',
      type: PropertyType.string,
      required: true
    },
    {
      name: 'contentVersion',
      columnName: 'content_version',
      type: PropertyType.integer,
      required: true,
      default: 1
    }
  ],
  indexes: [
    {
      name: 'opfs_path',
      properties: ['opfsPath'],
      unique: true
    }
  ]
})
export class StorageFileMeta extends EntityBase {
  /** 用户可见文件名。 */
  name!: string;
  /** 文件内容的 MIME 类型。 */
  mimeType!: string;
  /** 文件大小，单位为字节。 */
  size!: number;
  /** 相对于插件 OPFS 根目录的唯一路径。 */
  opfsPath!: string;
  /** 同一路径内容每次成功覆盖后递增的版本号。 */
  contentVersion!: number;
}
