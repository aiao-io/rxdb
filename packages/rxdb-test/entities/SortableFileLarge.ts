import { PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * SortableFileLarge —— FileLarge 的可排序版本，供三端 demo 的文件管理器 lazy 页使用（US-031）。
 *
 * @remarks
 * 列、索引与计算属性 1:1 复刻 `FileLarge`，只多两处：`manualOrder: { groupBy: ['parentId'] }` 与非空的 `sortOrder`。
 * 排序域按父节点划分：同一 `parentId` 下的子节点是一条序列，根节点（`parentId` 为 NULL）自成一组；
 * 新建、批量添加与改父节点时不给排序键，由引擎追加到所属组末尾。
 *
 * 与 `FileLarge` 不可互换：后者 `sortOrder` 可空、不声明手动排序，留给适配器测试、远端测试表与桌面宿主使用。
 * 两者同形由 `src/__tests__/sortable-tree-entities.spec.ts` 守住。
 */
@TreeEntity({
  name: 'SortableFileLarge',
  tableName: 'sortable_file_large',
  manualOrder: { groupBy: ['parentId'] },
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
      type: PropertyType.string
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
export class SortableFileLarge extends TreeAdjacencyListEntityBase {
  name!: string;
  type!: 'file' | 'folder';
  sortOrder!: string;
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
