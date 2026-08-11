interface SortableFile {
  name: string;
  type: 'file' | 'folder';
  sortOrder?: string | null;
  extension?: string | null;
  size?: number | null;
}

/**
 * 排序模式枚举
 */
export enum SortMode {
  Manual = 'manual', // 自由排序(使用 sortOrder)
  NameAsc = 'name-asc', // 名称升序
  NameDesc = 'name-desc', // 名称降序
  TypeAsc = 'type-asc', // 类型优先(文件夹 → 文件)
  TypeDesc = 'type-desc', // 类型优先(文件 → 文件夹)
  ExtensionAsc = 'ext-asc', // 扩展名升序
  ExtensionDesc = 'ext-desc', // 扩展名降序
  SizeAsc = 'size-asc', // 大小升序
  SizeDesc = 'size-desc' // 大小降序
}

/**
 * 获取排序比较器函数
 * @param mode 排序模式
 * @returns 比较器函数
 */
export function getSortComparator(mode: SortMode): (a: SortableFile, b: SortableFile) => number {
  switch (mode) {
    case SortMode.Manual:
      // 使用 sortOrder 字段进行排序
      return (a, b) => {
        const aSort = a.sortOrder ?? '';
        const bSort = b.sortOrder ?? '';
        return (
          aSort < bSort ? -1
          : aSort > bSort ? 1
          : 0
        );
      };

    case SortMode.NameAsc:
      // 名称升序,使用中文排序规则
      return (a, b) => a.name.localeCompare(b.name, 'zh-CN');

    case SortMode.NameDesc:
      // 名称降序
      return (a, b) => b.name.localeCompare(a.name, 'zh-CN');

    case SortMode.TypeAsc:
      // 文件夹优先,同类型按名称排序
      return (a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      };

    case SortMode.TypeDesc:
      // 文件优先,同类型按名称排序
      return (a, b) => {
        if (a.type !== b.type) {
          return a.type === 'file' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      };

    case SortMode.ExtensionAsc:
      // 扩展名升序,无扩展名排前面,同扩展名按名称排序
      return (a, b) => {
        const aExt = a.extension ?? '';
        const bExt = b.extension ?? '';
        if (aExt !== bExt) {
          return aExt.localeCompare(bExt, 'zh-CN');
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      };

    case SortMode.ExtensionDesc:
      // 扩展名降序
      return (a, b) => {
        const aExt = a.extension ?? '';
        const bExt = b.extension ?? '';
        if (aExt !== bExt) {
          return bExt.localeCompare(aExt, 'zh-CN');
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      };

    case SortMode.SizeAsc:
      // 大小升序,null 视为 0,同大小按名称排序
      return (a, b) => {
        const aSize = a.size ?? 0;
        const bSize = b.size ?? 0;
        if (aSize !== bSize) {
          return aSize - bSize;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      };

    case SortMode.SizeDesc:
      // 大小降序
      return (a, b) => {
        const aSize = a.size ?? 0;
        const bSize = b.size ?? 0;
        if (aSize !== bSize) {
          return bSize - aSize;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      };

    default:
      // 默认不排序
      return () => 0;
  }
}
