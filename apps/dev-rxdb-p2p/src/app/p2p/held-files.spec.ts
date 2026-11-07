import { WritableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeldFiles, readRange } from './held-files';

const fileSystem = () => {
  const files = new Map<string, File>();
  let nextWriteError: Error | null = null;
  const createWritable = async (name: string) => {
    let draft = new Uint8Array(0);
    let cursor = 0;
    const writeAt = (position: number, bytes: Uint8Array): void => {
      if (nextWriteError) {
        const error = nextWriteError;
        nextWriteError = null;
        throw error;
      }
      const next = new Uint8Array(Math.max(draft.length, position + bytes.length));
      next.set(draft);
      next.set(bytes, position);
      draft = next;
      cursor = position + bytes.length;
    };
    const stream = new WritableStream<Uint8Array>({
      write: bytes => writeAt(cursor, bytes),
      close: () => {
        files.set(name, new File([draft], name));
      }
    });
    return Object.assign(stream, {
      write: async (command: { type: 'write'; position: number; data: Uint8Array }) =>
        writeAt(command.position, command.data)
    });
  };
  const directory = {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError');
      if (!files.has(name)) files.set(name, new File([], name));
      return { getFile: async () => files.get(name)!, createWritable: () => createWritable(name) };
    }),
    removeEntry: vi.fn(async (name: string) => {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError');
    })
  };
  const root = { getDirectoryHandle: vi.fn(async () => directory) };
  return {
    files,
    directory,
    root,
    rootHandle: root as unknown as FileSystemDirectoryHandle,
    failNextWrite: (error: Error): void => {
      nextWriteError = error;
    }
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HeldFiles OPFS lifecycle', () => {
  it('stores and reads exact file bytes using the default browser storage root', async () => {
    const fs = fileSystem();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => fs.rootHandle } });
    const held = new HeldFiles();
    const original = new File([new Uint8Array([1, 2, 3, 4])], 'photo.bin');
    await held.store('hash', original);
    const saved = await held.open('hash');
    expect(new Uint8Array(await saved!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(fs.root.getDirectoryHandle).toHaveBeenCalledWith('p2p-files', { create: true });
  });

  it('commits out-of-order chunks atomically and preserves the old file until commit', async () => {
    const fs = fileSystem();
    fs.files.set('hash', new File(['old!'], 'hash'));
    const held = new HeldFiles(async () => fs.rootHandle);
    const writer = await held.createWriter('hash');
    await writer.write(2, new Uint8Array([3, 4]));
    await writer.write(0, new Uint8Array([1, 2]));
    expect(await (await held.open('hash'))!.text()).toBe('old!');
    await writer.commit();
    expect(new Uint8Array(await (await held.open('hash'))!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('discards an interrupted download without replacing a previously saved copy', async () => {
    const fs = fileSystem();
    fs.files.set('hash', new File(['keep'], 'hash'));
    const held = new HeldFiles(async () => fs.rootHandle);
    const writer = await held.createWriter('hash');
    await writer.write(0, new Uint8Array([9, 9]));
    await writer.discard();
    expect(await (await held.open('hash'))!.text()).toBe('keep');
  });

  it('allows a clean new write after a failed write was discarded', async () => {
    const fs = fileSystem();
    fs.files.set('hash', new File(['keep'], 'hash'));
    const held = new HeldFiles(async () => fs.rootHandle);
    const writer = await held.createWriter('hash');
    fs.failNextWrite(new DOMException('full', 'QuotaExceededError'));
    await expect(writer.write(0, new Uint8Array([1, 2]))).rejects.toThrow('full');
    await writer.discard();
    expect(await (await held.open('hash'))!.text()).toBe('keep');
    await held.store('hash', new File(['good'], 'hash'));
    expect(await (await held.open('hash'))!.text()).toBe('good');
  });

  it('treats absent files as missing and makes repeated removal safe', async () => {
    const fs = fileSystem();
    const held = new HeldFiles(async () => fs.rootHandle);
    expect(await held.open('missing')).toBeNull();
    await held.store('hash', new File(['data'], 'hash'));
    await held.remove('hash');
    await held.remove('hash');
    expect(await held.open('hash')).toBeNull();
  });

  it('surfaces permission and IO errors instead of reporting a missing file', async () => {
    const fs = fileSystem();
    const held = new HeldFiles(async () => fs.rootHandle);
    const denied = new DOMException('denied', 'NotAllowedError');
    fs.directory.getFileHandle.mockRejectedValueOnce(denied);
    await expect(held.open('hash')).rejects.toBe(denied);
    fs.directory.removeEntry.mockRejectedValueOnce(denied);
    await expect(held.remove('hash')).rejects.toBe(denied);
    fs.directory.getFileHandle.mockRejectedValueOnce(new Error('disk disconnected'));
    await expect(held.open('hash')).rejects.toThrow('disk disconnected');
  });

  it('surfaces unavailable storage roots and extracts only the requested byte range', async () => {
    const unavailable = new Error('OPFS is unavailable');
    const held = new HeldFiles(() => Promise.reject(unavailable));
    await expect(held.open('hash')).rejects.toBe(unavailable);
    await expect(readRange(new Blob([new Uint8Array([1, 2, 3, 4])]), 1, 2)).resolves.toEqual(new Uint8Array([2, 3]));
  });
});
