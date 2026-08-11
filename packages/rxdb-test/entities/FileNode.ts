import { PropertyType, TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';

/**
 * FileNode - 文件/文件夹树结构实体
 *
 * 特性：
 * - 支持文件和文件夹两种类型
 * - 文件夹可包含子节点，文件不可包含
 * - 文件具有扩展名和大小属性
 * - 使用邻接表模型实现树结构
 * - hasChildren = false（适用于 < 1000 节点场景）
 */
@TreeEntity({
  name: 'FileNode',
  tableName: 'file_node',
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
export class FileNode extends TreeAdjacencyListEntityBase {
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
