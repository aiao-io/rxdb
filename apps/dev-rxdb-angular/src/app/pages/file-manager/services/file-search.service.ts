import { Injectable } from '@angular/core';

interface SearchableFile {
  id: string;
  name: string;
  extension?: string | null;
  parentId?: string | null;
}

/**
 * FileSearchService
 * 提供文件/文件夹搜索和过滤功能
 */
@Injectable({
  providedIn: 'root'
})
export class FileSearchService {
  /**
   * 过滤树节点，返回匹配的文件/文件夹ID集合
   * @param files 所有文件数据
   * @param keyword 搜索关键词
   * @returns 匹配的文件ID集合
   */
  filterTreeNodes<T extends SearchableFile>(files: readonly T[], keyword: string): Set<string> {
    const trimmedKeyword = keyword.trim().toLowerCase();
    if (!trimmedKeyword) return new Set();

    const matchedIds = new Set<string>();

    files.forEach(file => {
      // 搜索完整文件名（含扩展名）
      const fullName = file.extension ? `${file.name}${file.extension}` : file.name;
      if (fullName.toLowerCase().includes(trimmedKeyword)) {
        matchedIds.add(file.id);
      }
    });

    return matchedIds;
  }

  /**
   * 展开所有匹配项的祖先节点
   * @param files 所有文件数据
   * @param matchedIds 匹配的文件ID集合
   * @returns 需要展开的文件夹ID集合（包括所有祖先节点）
   */
  expandMatchedAncestors<T extends SearchableFile>(files: readonly T[], matchedIds: Set<string>): Set<string> {
    const toExpand = new Set<string>();
    const fileById = new Map<string, T>(files.map(file => [file.id, file]));

    matchedIds.forEach(fileId => {
      const visited = new Set<string>();
      let current = fileById.get(fileId);

      while (current?.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        toExpand.add(current.parentId);
        current = fileById.get(current.parentId);
      }
    });

    return toExpand;
  }

  /**
   * 检查文件/文件夹或其任意子孙节点是否匹配搜索
   * @param fileId 文件/文件夹ID
   * @param files 所有文件数据
   * @param matchedIds 匹配的文件ID集合
   * @returns 是否应该显示该文件/文件夹
   */
  shouldShowFile<T extends SearchableFile>(fileId: string, files: readonly T[], matchedIds: Set<string>): boolean {
    if (matchedIds.has(fileId)) return true;

    const childrenByParentId = new Map<string, T[]>();
    for (const file of files) {
      if (!file.parentId) continue;
      const children = childrenByParentId.get(file.parentId) ?? [];
      children.push(file);
      childrenByParentId.set(file.parentId, children);
    }

    const visited = new Set<string>();
    const hasMatchedDescendant = (id: string): boolean => {
      if (visited.has(id)) return false;
      visited.add(id);
      const children = childrenByParentId.get(id) ?? [];
      return children.some(child => matchedIds.has(child.id) || hasMatchedDescendant(child.id));
    };

    return hasMatchedDescendant(fileId);
  }
}
