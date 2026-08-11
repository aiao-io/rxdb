import { describe, expect, it, vi } from 'vitest';
import { renameOpfsEntry } from '../../@browser/opfs-rename.js';

type MemoryEntry = MemoryDirectory | Blob;

class MemoryDirectory {
  readonly entriesMap = new Map<string, MemoryEntry>();
  readonly removeEntry = vi.fn(async (name: string, options?: FileSystemRemoveOptions) => {
    const entry = this.entriesMap.get(name);
    if (entry instanceof MemoryDirectory && entry.entriesMap.size > 0 && !options?.recursive) {
      throw new DOMException('Directory is not empty', 'InvalidModificationError');
    }
    if (!this.entriesMap.delete(name)) throw new DOMException('Not found', 'NotFoundError');
  });

  async getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> {
    const entry = this.entriesMap.get(name);
    if (entry instanceof MemoryDirectory) throw new DOMException('Wrong kind', 'TypeMismatchError');
    if (entry === undefined && !options?.create) throw new DOMException('Not found', 'NotFoundError');
    if (entry === undefined) this.entriesMap.set(name, new Blob());
    const entriesMap = this.entriesMap;
    return {
      kind: 'file',
      name,
      getFile: async () => new File([entriesMap.get(name) as Blob], name),
      createWritable: async () =>
        ({
          write: async (data: FileSystemWriteChunkType) => {
            if (!(data instanceof Blob)) throw new Error('Test filesystem only accepts Blob writes');
            entriesMap.set(name, data);
          },
          close: async () => undefined
        }) as FileSystemWritableFileStream
    } as FileSystemFileHandle;
  }

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle> {
    const entry = this.entriesMap.get(name);
    if (entry instanceof Blob) throw new DOMException('Wrong kind', 'TypeMismatchError');
    if (entry === undefined && !options?.create) throw new DOMException('Not found', 'NotFoundError');
    const directory = entry ?? new MemoryDirectory();
    this.entriesMap.set(name, directory);
    return directory.asHandle(name);
  }

  asHandle(name = 'root'): FileSystemDirectoryHandle {
    const entriesMap = this.entriesMap;
    const getFileHandle = this.getFileHandle.bind(this);
    return {
      kind: 'directory',
      name,
      getFileHandle: this.getFileHandle.bind(this),
      getDirectoryHandle: this.getDirectoryHandle.bind(this),
      removeEntry: this.removeEntry,
      entries: async function* () {
        for (const [entryName, entry] of entriesMap) {
          yield [
            entryName,
            entry instanceof MemoryDirectory ? entry.asHandle(entryName) : await getFileHandle(entryName)
          ] as [string, FileSystemHandle];
        }
      }
    } as unknown as FileSystemDirectoryHandle;
  }
}

describe('renameOpfsEntry', () => {
  it('rejects file move() without atomic no-replace semantics', async () => {
    const directory = new MemoryDirectory();
    directory.entriesMap.set('before.txt', new Blob(['content']));
    const parent = directory.asHandle();
    const getFileHandle = parent.getFileHandle.bind(parent);
    const move = vi.fn(async (newName: string) => {
      directory.entriesMap.set(newName, directory.entriesMap.get('before.txt') as Blob);
      directory.entriesMap.delete('before.txt');
    });
    parent.getFileHandle = vi.fn(async (name, options) => Object.assign(await getFileHandle(name, options), { move }));

    await expect(renameOpfsEntry(parent, 'before.txt', 'after.txt', 'file')).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Safe OPFS rename requires atomic no-replace move() support'
    });

    expect(move).not.toHaveBeenCalled();
    expect(await (directory.entriesMap.get('before.txt') as Blob).text()).toBe('content');
    expect(directory.entriesMap.has('after.txt')).toBe(false);
  });

  it('rejects directory move() without atomic no-replace semantics', async () => {
    const directory = new MemoryDirectory();
    const source = new MemoryDirectory();
    const nested = new MemoryDirectory();
    nested.entriesMap.set('item.txt', new Blob(['nested']));
    source.entriesMap.set('child', nested);
    directory.entriesMap.set('before', source);
    const parent = directory.asHandle();
    const getDirectoryHandle = parent.getDirectoryHandle.bind(parent);
    const move = vi.fn(async (newName: string) => {
      directory.entriesMap.set(newName, source);
      directory.entriesMap.delete('before');
    });
    parent.getDirectoryHandle = vi.fn(async (name, options) =>
      Object.assign(await getDirectoryHandle(name, options), { move })
    );

    await expect(renameOpfsEntry(parent, 'before', 'after', 'directory')).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Safe OPFS rename requires atomic no-replace move() support'
    });

    expect(move).not.toHaveBeenCalled();
    expect(directory.entriesMap.get('before')).toBe(source);
    expect(directory.entriesMap.has('after')).toBe(false);
  });

  it.each(['', 'before', '../escape', 'nested/name'])(
    'rejects an invalid or unchanged target name: %s',
    async newName => {
      const directory = new MemoryDirectory();
      directory.entriesMap.set('before', new Blob(['source']));

      await expect(renameOpfsEntry(directory.asHandle(), 'before', newName, 'file')).rejects.toThrow();

      expect(directory.entriesMap.has('before')).toBe(true);
      expect(directory.removeEntry).not.toHaveBeenCalled();
    }
  );

  it('rejects an existing target without modifying either entry', async () => {
    const directory = new MemoryDirectory();
    directory.entriesMap.set('before', new Blob(['source']));
    directory.entriesMap.set('after', new Blob(['target']));

    await expect(renameOpfsEntry(directory.asHandle(), 'before', 'after', 'file')).rejects.toThrow(
      'Target entry already exists'
    );

    expect(await (directory.entriesMap.get('before') as Blob).text()).toBe('source');
    expect(await (directory.entriesMap.get('after') as Blob).text()).toBe('target');
    expect(directory.removeEntry).not.toHaveBeenCalled();
  });
});

describe('renameOpfsEntry 并发安全', () => {
  it('原生 move() 会覆盖检查后出现的目标时必须 fail-closed', async () => {
    const root = new MemoryDirectory();
    root.entriesMap.set('db.sqlite', new Blob(['source']));
    const parent = root.asHandle();
    const getFileHandle = parent.getFileHandle.bind(parent);
    const move = vi.fn(async (newName: string) => {
      root.entriesMap.set(newName, root.entriesMap.get('db.sqlite') as Blob);
      root.entriesMap.delete('db.sqlite');
    });
    parent.getFileHandle = vi.fn(async (name, options) => {
      const handle = await getFileHandle(name, options);
      if (name !== 'db.sqlite') return handle;
      root.entriesMap.set('renamed.sqlite', new Blob(['COMPETING']));
      return Object.assign(handle, { move });
    });

    await expect(renameOpfsEntry(parent, 'db.sqlite', 'renamed.sqlite', 'file')).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Safe OPFS rename requires atomic no-replace move() support'
    });

    expect(move).not.toHaveBeenCalled();
    expect(await (root.entriesMap.get('db.sqlite') as Blob).text()).toBe('source');
    expect(await (root.entriesMap.get('renamed.sqlite') as Blob).text()).toBe('COMPETING');
  });

  it('没有原生 move() 时不得进入最终校验到删源的竞争窗口', async () => {
    const root = new MemoryDirectory();
    root.entriesMap.set('db.sqlite', new Blob(['source']));
    const parent = root.asHandle();
    const removeEntry = parent.removeEntry.bind(parent);
    let sourceRemovalReached = false;
    parent.removeEntry = vi.fn(async (name, options) => {
      if (name === 'db.sqlite') {
        sourceRemovalReached = true;
        root.entriesMap.set(name, new Blob(['LATEST']));
      }
      await removeEntry(name, options);
    });

    await expect(renameOpfsEntry(parent, 'db.sqlite', 'renamed.sqlite', 'file')).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Safe OPFS rename requires atomic no-replace move() support'
    });

    expect(sourceRemovalReached).toBe(false);
    expect(await (root.entriesMap.get('db.sqlite') as Blob).text()).toBe('source');
    expect(root.entriesMap.has('renamed.sqlite')).toBe(false);
  });

  it('没有原生 move() 时不得进入目标检查到创建的竞争窗口', async () => {
    const root = new MemoryDirectory();
    root.entriesMap.set('db.sqlite', new Blob(['source']));
    const parent = root.asHandle();
    const getFileHandle = parent.getFileHandle.bind(parent);
    let targetCreationReached = false;
    parent.getFileHandle = vi.fn(async (name, options) => {
      if (name === 'renamed.sqlite' && options?.create) {
        targetCreationReached = true;
        root.entriesMap.set(name, new Blob(['COMPETING']));
      }
      return getFileHandle(name, options);
    });

    await expect(renameOpfsEntry(parent, 'db.sqlite', 'renamed.sqlite', 'file')).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Safe OPFS rename requires atomic no-replace move() support'
    });

    expect(targetCreationReached).toBe(false);
    expect(await (root.entriesMap.get('db.sqlite') as Blob).text()).toBe('source');
    expect(root.entriesMap.has('renamed.sqlite')).toBe(false);
  });

  it('目录句柄没有原生 move() 时必须拒绝 fallback', async () => {
    const root = new MemoryDirectory();
    const source = new MemoryDirectory();
    source.entriesMap.set('item.txt', new Blob(['source']));
    root.entriesMap.set('before', source);

    await expect(renameOpfsEntry(root.asHandle(), 'before', 'after', 'directory')).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'Safe OPFS rename requires atomic no-replace move() support'
    });

    expect(root.entriesMap.get('before')).toBe(source);
    expect(root.entriesMap.has('after')).toBe(false);
  });
});
