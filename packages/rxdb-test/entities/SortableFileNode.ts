import { PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * SortableFileNode —— FileNode 的可排序版本，供三端 demo 的文件管理器 simple 页与 virtual 页使用（US-031）。
 *
 * @remarks
 * 列、索引与计算属性 1:1 复刻 `FileNode`，只多两处：`manualOrder: { groupBy: ['parentId'] }` 与非空的 `sortOrder`。
 * 排序域按父节点划分：同一 `parentId` 下的子节点是一条序列，根节点（`parentId` 为 NULL）自成一组；
 * 新建、批量添加与改父节点时不给排序键，由引擎追加到所属组末尾。
 *
 * 与 `FileNode` 不可互换：后者 `sortOrder` 可空、不声明手动排序，留给适配器测试、远端测试表与桌面宿主使用。
 * 两者同形由 `src/__tests__/sortable-tree-entities.spec.ts` 守住。
 */
@TreeEntity({
  name: 'SortableFileNode',
  tableName: 'sortable_file_node',
  manualOrder: { groupBy: ['parentId'] },
  properties: [
    {
      name: 'name',
      type: PropertyType.string,
      nullable: false
    },
    {
      // RXT-013：discriminator 的联合类型必须由 metadata 承载，不能只写在 class 上。
      // 只声明 `PropertyType.string` 时，生成的声明和数据库都接受任意字符串，
      // `isFolder` / `fullName` 会在脏数据上静默走错分支。
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
      hasChildren: false
    }
  },
  indexes: [
    {
      name: 'parent_sort',
      properties: ['parentId', 'sortOrder']
    },
    {
      // RXT-010：`normalized` 不可省。SQL 规定每个 NULL 互不相等，普通 UNIQUE 对
      // 根节点（`parentId IS NULL`）和文件夹（`extension IS NULL`）**一行都拦不住**——
      // 这条索引此前形同虚设，重复根文件、重复子文件夹、并发双写全都能落库。
      // `normalized` 让每列以 `lower(COALESCE(CAST(列 AS TEXT), ''))` 参与比较：
      // NULL 折成 '' 后元组重新可比，`lower()` 又与 `FilePathValidatorService`
      // 的 `fullName.toLowerCase()` 同级重名判定同口径。
      // - folder/report.docx ✓
      // - folder/report.pdf  ✓ (不同 extension)
      // - folder/report.docx ✗ (重复)
      // - folder/Report.DOCX ✗ (大小写变体，UI 已拦，数据库也必须拦)
      name: 'parent_fullname',
      properties: ['parentId', 'name', 'extension'],
      unique: true,
      normalized: true
    }
  ]
})
export class SortableFileNode extends TreeAdjacencyListEntityBase {
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
