import { FileNode } from '@aiao/rxdb-test/entities';

const SORT_MODE_STORAGE_KEY = 'file-manager-sort-mode';

/**
 * 从 localStorage 恢复用户上次选择的排序模式。
 *
 * SSR / 无 localStorage 环境返回 `fallback`；存的值不在 `validValues` 内（来自旧版本或被
 * 手动篡改）同样返回 `fallback`，不抛错。这不是 fallback 兜底——首次访问就是没有历史值。
 */
export function loadStoredSortMode<T extends string>(validValues: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const saved = window.localStorage?.getItem(SORT_MODE_STORAGE_KEY);
  return saved && (validValues as readonly string[]).includes(saved) ? (saved as T) : fallback;
}

/** 把排序模式写入 localStorage，跨刷新保留用户选择。 */
export function persistSortMode(mode: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage?.setItem(SORT_MODE_STORAGE_KEY, mode);
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
 * 排序模式显示标签
 */
export const SORT_MODE_LABELS: Record<SortMode, string> = {
  [SortMode.Manual]: '自由排序',
  [SortMode.NameAsc]: '名称 A→Z',
  [SortMode.NameDesc]: '名称 Z→A',
  [SortMode.TypeAsc]: '类型(文件夹优先)',
  [SortMode.TypeDesc]: '类型(文件优先)',
  [SortMode.ExtensionAsc]: '扩展名 A→Z',
  [SortMode.ExtensionDesc]: '扩展名 Z→A',
  [SortMode.SizeAsc]: '大小(小→大)',
  [SortMode.SizeDesc]: '大小(大→小)'
};

/**
 * 获取排序比较器函数
 * @param mode 排序模式
 * @returns 比较器函数
 */
export function getSortComparator(mode: SortMode): (a: FileNode, b: FileNode) => number {
  switch (mode) {
    case SortMode.Manual:
      return (a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
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
