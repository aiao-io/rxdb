export interface FileNode {
  id: string;
  parentId?: string | null;
  sortOrder?: string | null;
  type: 'file' | 'folder' | string;
  hasChildren?: boolean | null;
}

export interface FileEntity extends FileNode {
  name: string;
  extension?: string | null;
  size?: number | null;
}

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
 *
 * @remarks
 * 节点不带 `sortOrder`：整批进一次 `saveMany`，引擎按批内顺序把各 `parentId` 组追加到末尾。
 */
export function generateBatchFiles<T extends FileEntity>(total: number, createEntity: () => T): T[] {
  const maxDepth = 7;
  const files: T[] = [];
  const depths = new Map<string, number>();
  depths.set('root', 0);

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

    const extension = type === 'file' ? FILE_EXTENSIONS[Math.floor(Math.random() * FILE_EXTENSIONS.length)] : undefined;
    const size = type === 'file' ? Math.floor(Math.random() * 100000) + 100 : undefined;
    const name = type === 'file' ? `Batch-${i}.${extension}` : `Folder-${i}`;

    const file = createEntity();
    file.name = name;
    file.type = type;
    file.extension = extension;
    file.size = size;
    file.hasChildren = false;

    createdFilesMap.set(file.id, file);

    if (parentId !== 'root') {
      const parent = createdFilesMap.get(parentId);
      if (parent) {
        file.parentId = parent.id;
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
  }

  return files;
}
