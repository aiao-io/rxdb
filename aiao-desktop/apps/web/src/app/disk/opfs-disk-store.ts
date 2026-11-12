import { DiskPath, parentOf } from './disk-path';
import { DiskEntry, DiskEntryKind, DiskError, DiskFileInfo, DiskStore, isMissing } from './disk-store';
import { DiskMarker, DiskVolume } from './disk-volume';

declare global {
  interface FileSystemFileHandle {
    /** Chromium 支持在 OPFS 里移动文件（目录句柄没有这个方法）；lib.dom 还没有收录。 */
    move(destination: FileSystemDirectoryHandle, newName: string): Promise<void>;
  }
}

/** OPFS 里产品自己的目录：`disk/` 是 Macintosh HD 的内容，`disk.json` 是复制完成的标记。 */
const PRODUCT_DIR = 'aiao-desktop';
const DISK_DIR = 'disk';
const MARKER_FILE = 'disk.json';
/** 同一来源的多个标签页同时打开时，用 Web Locks 保证只有一个在复制或抹掉。 */
const LOCK_NAME = 'aiao-desktop-disk';

const domError = (error: unknown): string | null => (error instanceof DOMException ? error.name : null);

function translate(error: unknown, path: DiskPath): never {
  const name = domError(error);
  if (name === 'NotFoundError') throw new DiskError('ENOENT', path);
  if (name === 'TypeMismatchError') throw new DiskError('ENOTDIR', path);
  throw error;
}

function leaf(path: DiskPath): string {
  const name = path.at(-1);
  if (name === undefined) throw new DiskError('EACCES', path, 'The volume root cannot be replaced');
  return name;
}

async function names(dir: FileSystemDirectoryHandle): Promise<DiskEntry[]> {
  const entries: DiskEntry[] = [];
  for await (const [name, child] of dir.entries()) entries.push({ name, kind: child.kind });
  return entries;
}

/** 以 OPFS 目录为根的磁盘。主线程只用异步接口：`getFile()` 读，`createWritable()` 写。 */
export class OpfsDiskStore implements DiskStore {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  async list(dir: DiskPath): Promise<DiskEntry[]> {
    return names(await this.directory(dir));
  }

  async kindOf(path: DiskPath): Promise<DiskEntryKind | null> {
    if (!path.length) return 'directory';
    const parent = await this.directory(parentOf(path)).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (!parent) return null;
    return (await names(parent)).find(entry => entry.name === leaf(path))?.kind ?? null;
  }

  async info(file: DiskPath): Promise<DiskFileInfo> {
    const data = await (await this.file(file)).getFile();
    return { size: data.size, modified: data.lastModified };
  }

  async read(file: DiskPath): Promise<Uint8Array> {
    const data = await (await this.file(file)).getFile();
    return new Uint8Array(await data.arrayBuffer());
  }

  async write(file: DiskPath, data: Uint8Array): Promise<void> {
    const dir = await this.directory(parentOf(file), true);
    const handle = await dir.getFileHandle(leaf(file), { create: true }).catch(error => translate(error, file));
    const writable = await handle.createWritable();
    await writable.write(data.slice());
    await writable.close();
  }

  async mkdir(dir: DiskPath): Promise<void> {
    await this.directory(dir, true);
  }

  async remove(path: DiskPath): Promise<void> {
    const parent = await this.directory(parentOf(path)).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    await parent?.removeEntry(leaf(path), { recursive: true }).catch((error: unknown) => {
      if (domError(error) !== 'NotFoundError') throw error;
    });
  }

  async move(from: DiskPath, to: DiskPath): Promise<void> {
    if ((await this.kindOf(to)) !== null) throw new DiskError('EEXIST', to);
    const kind = await this.kindOf(from);
    if (kind === null) throw new DiskError('ENOENT', from);
    if (kind === 'file') {
      const target = await this.directory(parentOf(to), true);
      await (await this.file(from)).move(target, leaf(to));
      return;
    }
    /* 目录不能整体移动：逐层重建，文件逐个移动，修改时间保持不变。 */
    await this.mkdir(to);
    for (const entry of await this.list(from)) await this.move([...from, entry.name], [...to, entry.name]);
    await this.remove(from);
  }

  private async directory(path: DiskPath, create = false): Promise<FileSystemDirectoryHandle> {
    let handle = this.root;
    for (const [depth, name] of path.entries())
      handle = await handle
        .getDirectoryHandle(name, { create })
        .catch(error => translate(error, path.slice(0, depth + 1)));
    return handle;
  }

  private async file(path: DiskPath): Promise<FileSystemFileHandle> {
    const dir = await this.directory(parentOf(path));
    return dir.getFileHandle(leaf(path)).catch(error => translate(error, path));
  }
}

function parseMarker(text: string): DiskMarker {
  const value: unknown = JSON.parse(text);
  const marker = value as Partial<DiskMarker> | null;
  if (typeof marker?.version !== 'number' || typeof marker.seededAt !== 'number')
    throw new Error(`${PRODUCT_DIR}/${MARKER_FILE} is not a disk marker`);
  return { version: marker.version, seededAt: marker.seededAt };
}

/** 打开 OPFS 里的卷。浏览器不支持 OPFS 时直接报错，桌面显示磁盘不可用。 */
export async function openOpfsVolume(): Promise<DiskVolume> {
  const product = await (await navigator.storage.getDirectory()).getDirectoryHandle(PRODUCT_DIR, { create: true });
  const disk = await product.getDirectoryHandle(DISK_DIR, { create: true });
  return {
    store: new OpfsDiskStore(disk),
    readMarker: async () => {
      const handle = await product.getFileHandle(MARKER_FILE).catch((error: unknown) => {
        if (domError(error) === 'NotFoundError') return null;
        throw error;
      });
      return handle ? parseMarker(await (await handle.getFile()).text()) : null;
    },
    writeMarker: async marker => {
      const writable = await (await product.getFileHandle(MARKER_FILE, { create: true })).createWritable();
      await writable.write(JSON.stringify(marker));
      await writable.close();
    },
    clearMarker: async () => {
      await product.removeEntry(MARKER_FILE).catch((error: unknown) => {
        if (domError(error) !== 'NotFoundError') throw error;
      });
    },
    wipe: async () => {
      for (const entry of await names(disk)) await disk.removeEntry(entry.name, { recursive: true });
    },
    exclusive: task => navigator.locks.request(LOCK_NAME, task)
  };
}
