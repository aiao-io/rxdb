import { Vivari, VivariError } from '@vivari/core';

export type VmEntryKind = 'file' | 'directory';

export interface VmEntry {
  readonly name: string;
  /** 符号链接等其他类型为 `other`，同步时跳过。 */
  readonly kind: VmEntryKind | 'other';
}

export interface VmStat {
  readonly kind: VmEntryKind;
  readonly size: number;
  readonly mtimeMs: number;
}

/** 一次性写进虚拟机的目录树，形状与 Vivari 的 `FileSystemTree` 相同。 */
export interface VmTree {
  readonly [name: string]: { readonly file: { readonly contents: Uint8Array } } | { readonly directory: VmTree };
}

/** 同步引擎需要的虚拟机文件系统操作；浏览器里是 Vivari，单测里是内存假实现。 */
export interface VmFs {
  list(path: string): Promise<VmEntry[]>;
  /** 路径不存在时为 `null`。 */
  stat(path: string): Promise<VmStat | null>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** 递归删除；不存在时什么也不做。 */
  remove(path: string): Promise<void>;
  /** 把整棵树写到 `mountPoint` 下，一次往返。 */
  mount(tree: VmTree, mountPoint: string): Promise<void>;
}

const isMissing = (error: unknown): boolean =>
  error instanceof VivariError && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/** Vivari 的异步 fs 外观（`vivari.fs`）。 */
export function vivariFs(vivari: Vivari): VmFs {
  return {
    list: async path =>
      (await vivari.fs.readdir(path, { withFileTypes: true })).map(entry => ({
        name: entry.name,
        kind:
          entry.isDirectory() ? 'directory'
          : entry.isFile() ? 'file'
          : 'other'
      })),
    stat: async path => {
      try {
        const stats = await vivari.fs.stat(path);
        return { kind: stats.isDirectory() ? 'directory' : 'file', size: stats.size, mtimeMs: stats.mtimeMs };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    read: path => vivari.fs.readFile(path),
    write: (path, data) => vivari.fs.writeFile(path, data),
    mkdir: path => vivari.fs.mkdir(path, { recursive: true }),
    remove: path => vivari.fs.rm(path, { recursive: true, force: true }),
    mount: (tree, mountPoint) => vivari.mount(tree, { mountPoint })
  };
}
