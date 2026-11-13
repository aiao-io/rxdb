import type { DiskPath } from '../disk/disk-path';
import { DiskError, DiskFileInfo, DiskStore, isMissing } from '../disk/disk-store';
import type { FileSystem } from './file-system';

/** 文件的版本（ADESK-US-206 `filesystem`）：打开或保存时的修改时间（毫秒）与大小（字节）。 */
export interface FileStamp {
  /** 修改时间，毫秒时间戳。 */
  readonly modified: number;
  /** 大小，字节。 */
  readonly size: number;
}

const VERSION = /^(\d{1,16}):(\d{1,12})$/;

/** 交给应用的版本串：`<修改时间毫秒>:<字节数>`。对应用是不透明的，保存时原样交回。 */
export const versionOf = (stamp: FileStamp): string => `${stamp.modified}:${stamp.size}`;

/** 读回应用交来的版本串；不是 {@link versionOf} 写出的形态时为 `null`。 */
export function parseVersion(version: string): FileStamp | null {
  const match = VERSION.exec(version);
  return match ? { modified: Number(match[1]), size: Number(match[2]) } : null;
}

/** 读一个文件快照的结果。 */
export type FileSnapshot =
  | { readonly kind: 'ok'; readonly stamp: FileStamp; readonly bytes: Uint8Array }
  | { readonly kind: 'missing' }
  | { readonly kind: 'too-large'; readonly size: number };

/** 写回一个已存在的文件的结果：已被改动与已被删除或改名都不写盘。 */
export type FileReplaced =
  | { readonly kind: 'ok'; readonly stamp: FileStamp }
  | { readonly kind: 'missing' }
  | { readonly kind: 'changed' };

/** 另存的结果：目标位置已经有别的东西（没确认覆盖的文件、同名文件夹），或目标文件夹已经不在了，都不写盘。 */
export type FileCreated =
  | { readonly kind: 'ok'; readonly stamp: FileStamp }
  | { readonly kind: 'exists' }
  | { readonly kind: 'missing-folder' };

/**
 * 应用上下文能用的磁盘操作：只有这三个窄操作，没有仓储、没有 OPFS 句柄、不能列目录，路径只来自用户在面板里的选择。
 * 每个操作都在磁盘的跨标签页锁里一次做完（先对一遍库再读、比对、写），所以「先比对版本再写」不会被别的标签页插进来。
 */
export interface AppContextFiles {
  /** 读一个文件的内容快照与版本；比 `maxBytes` 大的文件不读。 */
  snapshot(path: DiskPath, maxBytes: number): Promise<FileSnapshot>;
  /**
   * 把内容写回一个**已存在**的文件（保存已打开的文件）：先比对 `expected`（省略就不比对），
   * 文件已被删除、改名或被同名文件夹顶替就不写、也不在原路径新建。
   */
  replace(path: DiskPath, bytes: Uint8Array, expected: FileStamp | undefined): Promise<FileReplaced>;
  /**
   * 另存到用户选定的位置：目标已有文件而 `overwrite` 不是 true（用户没有确认覆盖）就不写；目标文件夹不在了不补建。
   */
  create(path: DiskPath, bytes: Uint8Array, overwrite: boolean): Promise<FileCreated>;
}

const stampOf = (info: DiskFileInfo): FileStamp => ({ modified: info.modified, size: info.size });

/** 文件不在了：被删除、改名，或同名位置现在是个文件夹。 */
const isGone = (error: unknown): boolean => isMissing(error) || (error instanceof DiskError && error.code === 'EISDIR');

async function infoOrNull(store: DiskStore, path: DiskPath): Promise<DiskFileInfo | null> {
  try {
    return await store.info(path);
  } catch (error) {
    if (isGone(error)) return null;
    throw error;
  }
}

/**
 * 用桌面的磁盘服务实现 {@link AppContextFiles}。只拿磁盘服务的独占执行入口与改动通知，
 * 写盘走保存已有文件的 `replace`（目标不在就失败，不悄悄新建）与显式创建的 `write`。
 */
export function appFilesOver(disk: Pick<FileSystem, 'run' | 'changes'>): AppContextFiles {
  return {
    snapshot: (path, maxBytes) =>
      disk.run<FileSnapshot>(async store => {
        const info = await infoOrNull(store, path);
        if (!info) return { kind: 'missing' };
        if (info.size > maxBytes) return { kind: 'too-large', size: info.size };
        return { kind: 'ok', stamp: stampOf(info), bytes: await store.read(path) };
      }),
    replace: async (path, bytes, expected) => {
      const outcome = await disk.run<FileReplaced>(async store => {
        const info = await infoOrNull(store, path);
        if (!info) return { kind: 'missing' };
        if (expected && (info.modified !== expected.modified || info.size !== expected.size))
          return { kind: 'changed' };
        await store.replace(path, bytes);
        return { kind: 'ok', stamp: stampOf(await store.info(path)) };
      });
      if (outcome.kind === 'ok') disk.changes.next([path]);
      return outcome;
    },
    create: async (path, bytes, overwrite) => {
      const outcome = await disk.run<FileCreated>(async store => {
        if ((await store.kindOf(path.slice(0, -1))) !== 'directory') return { kind: 'missing-folder' };
        const kind = await store.kindOf(path);
        if (kind === 'directory' || (kind === 'file' && !overwrite)) return { kind: 'exists' };
        if (kind === 'file') await store.replace(path, bytes);
        else await store.write(path, bytes);
        return { kind: 'ok', stamp: stampOf(await store.info(path)) };
      });
      if (outcome.kind === 'ok') disk.changes.next([path]);
      return outcome;
    }
  };
}
