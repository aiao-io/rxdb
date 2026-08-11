import { PropertyType, TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';

/**
 * FileLarge - 大规模文件/文件夹树结构实体（适用于懒加载场景）
 *
 * 特性：
 * - 数据量 1000+ 节点
 * - 懒加载 + 虚拟滚动
 * - hasChildren 由数据库计算（子查询 COUNT）
 * - 支持按需展开节点
 * - 支持文件和文件夹两种类型
 * - 文件具有扩展名和大小属性
 */
@TreeEntity({
  name: 'FileLarge',
  tableName: 'file_large',
  properties: [
    {
      name: 'name',
      type: PropertyType.string,
      nullable: false
    },
    {
      // RXT-013：与 FileNode 同一约束 —— discriminator 的取值域由 metadata 承载，
      // adapter 据此生成 CHECK，非法值在写入期就被拒绝。
      name: 'type',
      type: PropertyType.enum,
      enum: ['file', 'folder'],
      nullable: false
    },
    {
      name: 'sortOrder',
      columnName: 'sort_order',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'extension',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'size',
      type: PropertyType.number,
      nullable: true
    }
  ],
  features: {
    tree: {
      type: 'adjacency-list',
      hasChildren: true
    }
  },
  indexes: [
    {
      name: 'parent_sort',
      properties: ['parentId', 'sortOrder']
    },
    {
      // RXT-010：与 FileNode 同一条约束 —— 没有 `normalized`，
      // `parentId` / `extension` 上的 NULL 会让整条唯一索引失效。
      name: 'parent_fullname',
      properties: ['parentId', 'name', 'extension'],
      unique: true,
      normalized: true
    }
  ]
})
export class FileLarge extends TreeAdjacencyListEntityBase {
  name!: string;
  type!: 'file' | 'folder';
  sortOrder!: string | null;
  extension!: string | null;
  size!: number | null;

  /**
   * 计算属性: 完整文件名（包含扩展名）
   */
  get fullName(): string {
    return this.type === 'folder' || !this.extension ? this.name : `${this.name}${this.extension}`;
  }

  /**
   * 计算属性: 是否为文件夹
   */
  get isFolder(): boolean {
    return this.type === 'folder';
  }

  /**
   * 计算属性: 文件大小（人类可读格式）
   */
  get sizeFormatted(): string | null {
    if (this.size === null) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.size;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
