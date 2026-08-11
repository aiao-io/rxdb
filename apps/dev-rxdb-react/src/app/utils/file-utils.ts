import { generateKeyBetween } from '@aiao/utils';

export interface FileNode {
  id: string;
  parentId?: string | null;
  sortOrder?: string | null;
  type: string;
  hasChildren?: boolean | null;
}

export interface FileEntity extends FileNode {
  name: string;
  extension?: string | null;
  size?: number | null;
}

type FileEntitySeed = {
  name: string;
  type: 'file' | 'folder';
  sortOrder: string | null;
  extension?: string | null;
  size?: number | null;
  hasChildren?: boolean;
};

const FILE_EXTENSIONS = [
  'txt',
  'md',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'css',
  'scss',
  'html',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'pdf',
  'zip',
  'tar',
  'mp3',
  'mp4',
  'mov'
];

/**
 * 批量生成文件/文件夹数据（带随机层级）
 */
export function generateBatchFiles<T extends FileEntity>(total: number, EntityClass: unknown, existingRoots: T[]): T[] {
  const maxDepth = 7;
  const files: T[] = [];
  const depths = new Map<string, number>();
  depths.set('root', 0);

  const newChildrenMap = new Map<string, T[]>();
  const parentIds: string[] = ['root'];
  const createdFilesMap = new Map<string, T>();
  const folderIds: string[] = [];

  for (let i = 0; i < total; i++) {
    let parentId = parentIds[Math.floor(Math.random() * parentIds.length)];
    let depth = depths.get(parentId) ?? 0;

    if (depth >= maxDepth) {
      parentId = 'root';
      depth = 0;
    }

    // 30% 概率是文件夹，70% 是文件
    const isFolder = Math.random() > 0.7;
    const type = isFolder ? 'folder' : 'file';

    const extension = type === 'file' ? FILE_EXTENSIONS[Math.floor(Math.random() * FILE_EXTENSIONS.length)] : null;
    const size = type === 'file' ? Math.floor(Math.random() * 100000) + 100 : null;
    const name = type === 'file' ? `Batch-${i}` : `Folder-${i}`;

    const FileCtor = EntityClass as unknown as new (data: FileEntitySeed) => T;
    const file = new FileCtor({
      name,
      type,
      sortOrder: null,
      extension,
      size,
      hasChildren: false
    });

    createdFilesMap.set(file.id, file);

    if (parentId !== 'root') {
      const parent = createdFilesMap.get(parentId);
      if (parent) {
        (file as { parent$?: { set: (parent: T | null) => void } }).parent$?.set(parent);
        // Update parent's hasChildren
        if (parent.hasChildren === false) {
          parent.hasChildren = true;
        }
      }
    }

    files.push(file);
    if (file.id) {
      depths.set(file.id, depth + 1);
      if (isFolder) {
        parentIds.push(file.id);
        folderIds.push(file.id);
      }
    }

    const key = parentId;
    if (!newChildrenMap.has(key)) {
      newChildrenMap.set(key, []);
    }
    newChildrenMap.get(key)!.push(file);
  }

  // Calculate SortOrder
  const lastRootSort = existingRoots[existingRoots.length - 1]?.sortOrder ?? null;

  for (const [parentId, children] of newChildrenMap.entries()) {
    let lastSort: string | null = parentId === 'root' ? lastRootSort : null;

    for (const child of children) {
      const newSort = generateKeyBetween(lastSort, null);
      child.sortOrder = newSort;
      lastSort = newSort;
    }
  }

  return files;
}
