import { FOLDER_KIND, fileKind } from '../disk/disk-kinds';
import { DESKTOP, DiskPath } from '../disk/disk-path';
import { FsNode } from '../disk/disk-tree';

/** 构造文件节点；路径缺省为桌面上的同名文件。 */
export function fileNode(name: string, path: DiskPath | null = [...DESKTOP, name]): FsNode {
  const { kind, icon } = fileKind(name);
  return { name, path, kind: 'file', icon, k: kind, hidden: name.startsWith('.') };
}

/** 构造文件夹节点；路径缺省为桌面上的同名文件夹。 */
export function folderNode(
  name: string,
  children: readonly FsNode[] = [],
  path: DiskPath | null = [...DESKTOP, name]
): FsNode {
  return {
    name,
    path,
    kind: 'folder',
    icon: FOLDER_KIND.icon,
    k: FOLDER_KIND.kind,
    hidden: name.startsWith('.'),
    children
  };
}
