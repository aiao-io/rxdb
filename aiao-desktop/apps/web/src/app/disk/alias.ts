import { ALIAS_SUFFIX, isAliasName } from './disk-kinds';
import { DiskPath, foldName, parentOf } from './disk-path';
import { DiskError, DiskStore } from './disk-store';
import { FsNode, nodeAt, scanDisk } from './disk-tree';

/** 一个别名文件的内容：指向的磁盘路径。 */
export interface AliasRecord {
  readonly target: DiskPath;
}

/** 解析别名文件里的 JSON；不是别名文件（或内容损坏）时为 `null`。 */
export const parseAliasRecord = (bytes: Uint8Array): AliasRecord | null => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as { readonly target?: unknown };
    const target = value?.['target'];
    return Array.isArray(target) && target.length && target.every(part => typeof part === 'string')
      ? { target: target as string[] }
      : null;
  } catch {
    return null;
  }
};

/** 别名文件的字节：`{"target": [路径段…]}`。 */
export const aliasJson = (target: DiskPath): Uint8Array => new TextEncoder().encode(JSON.stringify({ target }));

/** 在条目旁边生成 `<名字> alias`，重名在 ` alias` 后缀后追加序号（`note.txt alias 2`，macOS 语义）；返回别名文件路径。 */
export async function makeAlias(store: DiskStore, path: DiskPath): Promise<DiskPath> {
  const name = path.at(-1);
  if (!name) throw new DiskError('EACCES', path, 'The volume root cannot be aliased.');
  if (!(await store.kindOf(path))) throw new DiskError('ENOENT', path);
  const dir = parentOf(path);
  const taken = new Set((await store.list(dir)).map(entry => foldName(entry.name)));
  const base = `${name}${ALIAS_SUFFIX}`;
  let aliasName = base;
  for (let index = 2; taken.has(foldName(aliasName)); index++) {
    aliasName = `${base} ${index}`;
  }
  const target = [...dir, aliasName];
  await store.write(target, aliasJson(path));
  return target;
}

/** 是不是别名文件：按名字（`<名字> alias`）判断；内容是否有效由 {@link resolveAlias} 再验。 */
export const isAliasNode = (node: FsNode): boolean => node.kind === 'file' && isAliasName(node.name);

/** 解析别名指向的条目：不是别名、别名损坏或目标已不存在时为 `null`。 */
export async function resolveAlias(store: DiskStore, node: FsNode): Promise<FsNode | null> {
  if (!node.path || !isAliasNode(node)) return null;
  let bytes: Uint8Array;
  try {
    bytes = await store.read(node.path);
  } catch {
    return null;
  }
  const record = parseAliasRecord(bytes);
  if (!record) return null;
  return nodeAt(await scanDisk(store, new Date()), record.target);
}
