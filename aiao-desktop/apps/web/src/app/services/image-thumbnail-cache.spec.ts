import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { TabSync } from '../data/tab-sync';
import { configureServices } from '../testing/angular';
import { fakeLocks } from '../testing/fake-tab-sync';
import { ImageThumbnailCache } from './image-thumbnail-cache';

const { opfs, encode } = vi.hoisted(() => ({ opfs: vi.fn(), encode: vi.fn() }));
vi.mock('@aiao/rxdb-plugin-storage', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-storage')>()),
  createOpfsStorageFilesystem: opfs
}));
vi.mock('../shared/image-thumbnail', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared/image-thumbnail')>()),
  generateImageThumbnail: encode
}));

const ROOT = 'aiao-desktop-files-abcdef123456';
const DIR = 'Library/Caches/Thumbnails';
const entry = (id: string): string => `${DIR}/v1-${id}.png`;
const png = new Blob(['preview pixels'], { type: 'image/png' });
const original = new Blob(['original pixels'], { type: 'image/png' });
const src = 'data:image/png;base64,cHJldmlldyBwaXhlbHM=';

function setup() {
  const files = new Map<string, Blob>();
  const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined);
  const abort = vi.fn<(error: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const filesystem = {
    readBlob: vi.fn(async (path: string) => {
      const blob = files.get(path);
      if (!blob) throw new DOMException('Missing thumbnail', 'NotFoundError');
      return blob;
    }),
    openWrite: vi.fn(async (path: string) => {
      let staged: Blob;
      return {
        write: async (blob: Blob) => {
          await write(blob);
          staged = blob;
        },
        close: async () => void files.set(path, staged),
        abort
      };
    }),
    removeFile: vi.fn(async (path: string) => void files.delete(path)),
    removeDirectory: vi.fn(async (path: string) => {
      for (const name of files.keys()) if (`/${name}`.startsWith(`/${path}/`)) files.delete(name);
    })
  };
  const storage = { read: vi.fn<(id: string) => Promise<Blob>>().mockResolvedValue(original) };
  const guard = { location: { filesRoot: ROOT }, write: <T>(task: () => Promise<T>) => task() };
  const data = {
    ready: Promise.resolve({ storage }),
    locationGuard: guard,
    tabs: new TabSync({ locks: fakeLocks() })
  };
  opfs.mockReturnValue(filesystem);
  const connect = () => {
    configureServices([ImageThumbnailCache, { provide: DesktopData, useValue: data }]);
    return TestBed.inject(ImageThumbnailCache);
  };
  return { cache: connect(), connect, storage, filesystem, files, write, abort };
}

beforeEach(() => {
  opfs.mockReset();
  encode.mockReset().mockResolvedValue(png);
});

describe('图片缩略图缓存', () => {
  it('第一次显示时才读取原图，同一文件的并发请求共用一次生成，刷新后直接使用 OPFS', async () => {
    const { cache, connect, files, storage, filesystem } = setup();
    expect(opfs).not.toHaveBeenCalled();
    const requests = [cache.get('photo'), cache.get('photo'), connect().get('photo')];
    expect(await Promise.all(requests)).toEqual([src, src, src]);
    expect(opfs).toHaveBeenCalledWith(ROOT, { localAdapterName: 'sqlite-wasm' });
    expect(storage.read).toHaveBeenCalledExactlyOnceWith('photo');
    expect(encode).toHaveBeenCalledExactlyOnceWith(original);
    expect(files.get(entry('photo'))).toBe(png);
    expect(filesystem.openWrite).toHaveBeenCalledExactlyOnceWith(entry('photo'));

    expect(await connect().get('photo')).toBe(src);
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('新内容 ID 使用新缩略图，原文件释放时删除对应缓存', async () => {
    const { cache, files, storage } = setup();
    await cache.get('before');
    await cache.get('after');
    expect(storage.read.mock.calls).toEqual([['before'], ['after']]);
    await cache.remove('before');
    expect([...files.keys()]).toEqual([entry('after')]);
    await cache.clear();
    expect(files.size).toBe(0);
  });

  it('另一个标签页释放原文件时，等正在生成的旧缩略图落盘后清理', async () => {
    const { cache, connect, files } = setup();
    const started = Promise.withResolvers<void>();
    const encoded = Promise.withResolvers<Blob>();
    encode.mockImplementationOnce(() => {
      started.resolve();
      return encoded.promise;
    });
    const loading = cache.get('photo');
    await started.promise;
    const deleting = connect().remove('photo');
    encoded.resolve(png);
    await Promise.all([loading, deleting]);
    expect(files.has(entry('photo'))).toBe(false);
  });

  it('中断留下的空缓存文件会被替换，原图打不开时只显示通用图标', async () => {
    const { cache, files, filesystem } = setup();
    files.set(entry('empty'), new Blob());
    expect(await cache.get('empty')).toBe(src);
    expect(files.get(entry('empty'))).toBe(png);

    encode.mockRejectedValueOnce(new Error('invalid image'));
    expect(await cache.get('invalid')).toBeNull();
    expect(filesystem.openWrite).toHaveBeenCalledTimes(1);
    expect(await cache.get('invalid')).toBe(src);
  });

  it('缓存写入失败时放弃写入，当次仍能显示生成好的缩略图', async () => {
    const { cache, files, write, abort } = setup();
    const full = new Error('quota');
    write.mockRejectedValueOnce(full);
    expect(await cache.get('photo')).toBe(src);
    expect(abort).toHaveBeenCalledExactlyOnceWith(full);
    expect(files.size).toBe(0);
    expect(await cache.get('photo')).toBe(src);
    expect(files.get(entry('photo'))).toBe(png);
  });
});
