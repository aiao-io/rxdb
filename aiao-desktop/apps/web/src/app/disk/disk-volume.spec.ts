import { describe, expect, it, vi } from 'vitest';

import { SEED_VERSION, eraseVolume, openVolume } from './disk-volume';
import { MemoryDiskStore, memoryVolume } from './memory-disk-store';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const seedNote = async (store: MemoryDiskStore): Promise<void> => {
  await store.write(['Users', 'note.txt'], text('seed'));
};

describe('openVolume', () => {
  it('首次打开时复制内置内容，最后写完成标记', async () => {
    const store = new MemoryDiskStore();
    const volume = memoryVolume(store);
    const marker = await openVolume(
      volume,
      () => seedNote(store),
      () => 42
    );
    expect(marker).toEqual({ version: SEED_VERSION, seededAt: 42 });
    expect(await volume.readMarker()).toEqual(marker);
    expect(new TextDecoder().decode(await store.read(['Users', 'note.txt']))).toBe('seed');
  });

  it('已有完成标记时保留磁盘上的改动，不再复制', async () => {
    const store = new MemoryDiskStore();
    const volume = memoryVolume(store);
    await openVolume(
      volume,
      () => seedNote(store),
      () => 1
    );
    await store.write(['Users', 'note.txt'], text('edited'));
    const seed = vi.fn(() => seedNote(store));
    await openVolume(volume, seed, () => 2);
    expect(seed).not.toHaveBeenCalled();
    expect(new TextDecoder().decode(await store.read(['Users', 'note.txt']))).toBe('edited');
  });

  it('上次复制中途被打断（没有完成标记）时，先清空残留再重新复制', async () => {
    const store = new MemoryDiskStore();
    const volume = memoryVolume(store);
    await store.write(['Users', 'partial.txt'], text('half'));
    await expect(
      openVolume(
        volume,
        () => {
          throw new Error('quota exceeded');
        },
        () => 1
      )
    ).rejects.toThrow('quota exceeded');
    expect(await volume.readMarker()).toBeNull();
    await openVolume(
      volume,
      () => seedNote(store),
      () => 2
    );
    expect(await store.kindOf(['Users', 'partial.txt'])).toBeNull();
    expect(await store.kindOf(['Users', 'note.txt'])).toBe('file');
  });

  it('同一卷上的打开与抹掉串行执行', async () => {
    const store = new MemoryDiskStore();
    const volume = memoryVolume(store);
    const order: string[] = [];
    const slowSeed = async (): Promise<void> => {
      order.push('seed:start');
      await new Promise(resolve => setTimeout(resolve, 5));
      await seedNote(store);
      order.push('seed:end');
    };
    await Promise.all([openVolume(volume, slowSeed, () => 1), openVolume(volume, slowSeed, () => 2)]);
    expect(order).toEqual(['seed:start', 'seed:end']);
  });
});

describe('eraseVolume', () => {
  it('抹掉全部内容后恢复内置内容并刷新完成标记', async () => {
    const store = new MemoryDiskStore();
    const volume = memoryVolume(store);
    await openVolume(
      volume,
      () => seedNote(store),
      () => 1
    );
    await store.write(['Users', 'mine.txt'], text('mine'));
    const marker = await eraseVolume(
      volume,
      () => seedNote(store),
      () => 7
    );
    expect(marker).toEqual({ version: SEED_VERSION, seededAt: 7 });
    expect(await store.kindOf(['Users', 'mine.txt'])).toBeNull();
    expect(await store.kindOf(['Users', 'note.txt'])).toBe('file');
  });
});
