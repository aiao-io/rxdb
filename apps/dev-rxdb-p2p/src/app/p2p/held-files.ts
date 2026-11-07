/**
 * 本机持有的文件：字节存在 OPFS 的 `p2p-files/<contentHash>`，刷新页面后仍能供块。
 *
 * @remarks
 * 「持有」以本机设备的清单记录为准：OPFS 里有文件、没有记录（下载到一半关了页面）的不算持有，
 * 下一次下载会覆盖它。写入用 `createWritable()`：关闭之前写的是交换文件，目标文件不变，
 * 取消或失败时 `abort()` 丢弃，不会留下半个文件。
 */

const DIRECTORY = 'p2p-files';

/** 写入中的一个文件。 */
export interface HeldFileWriter {
  /** 在指定位置写一块。 */
  write(position: number, bytes: Uint8Array): Promise<void>;
  /** 写完：内容一次性替换到目标文件。 */
  commit(): Promise<void>;
  /** 放弃：丢掉写了一半的内容。 */
  discard(): Promise<void>;
}

const isNotFound = (error: unknown): boolean => error instanceof DOMException && error.name === 'NotFoundError';

/** 读文件的一个字节区间。 */
export const readRange = async (file: Blob, offset: number, size: number): Promise<Uint8Array> =>
  new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());

/** 本机持有的文件。 */
export class HeldFiles {
  readonly #directory: Promise<FileSystemDirectoryHandle>;

  constructor(root: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory()) {
    this.#directory = root().then(directory => directory.getDirectoryHandle(DIRECTORY, { create: true }));
  }

  /** 打开一个文件；不存在时为 null。 */
  async open(contentHash: string): Promise<File | null> {
    const directory = await this.#directory;
    try {
      return await (await directory.getFileHandle(contentHash)).getFile();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** 把一个本地文件存成某内容的副本（共享本地文件时）。 */
  async store(contentHash: string, blob: Blob): Promise<void> {
    const handle = await (await this.#directory).getFileHandle(contentHash, { create: true });
    await blob.stream().pipeTo(await handle.createWritable());
  }

  /** 开始写一个下载中的文件。 */
  async createWriter(contentHash: string): Promise<HeldFileWriter> {
    const handle = await (await this.#directory).getFileHandle(contentHash, { create: true });
    const writable = await handle.createWritable();
    return {
      write: (position, bytes) => writable.write({ type: 'write', position, data: bytes as Uint8Array<ArrayBuffer> }),
      commit: () => writable.close(),
      discard: () => writable.abort()
    };
  }

  /** 删除一个文件；本来就没有也算成功。 */
  async remove(contentHash: string): Promise<void> {
    const directory = await this.#directory;
    try {
      await directory.removeEntry(contentHash);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}
