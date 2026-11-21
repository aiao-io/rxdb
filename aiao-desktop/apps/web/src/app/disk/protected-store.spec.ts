import { describe, expect, it } from 'vitest';

import { DiskPath } from './disk-path';
import { DiskError } from './disk-store';
import { MemoryDiskStore } from './memory-disk-store';
import { ProtectedDiskStore } from './protected-store';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const SAFARI: DiskPath = ['Applications', 'Safari.app'];
const INFO: DiskPath = [...SAFARI, 'Contents', 'Info.plist'];
const PKG_INFO: DiskPath = [...SAFARI, 'Contents', 'PkgInfo'];
const MINE: DiskPath = [...SAFARI, 'Contents', 'Resources', 'mine.txt'];

/** 内存盘上放一个预装包和一个用户文件，包的保护登记可以随时改（模拟应用目录服务更新 owned）。 */
async function setup(initial: [string, string][] = [['Safari.app', 'safari']]) {
  const inner = new MemoryDiskStore();
  await inner.write(INFO, text('<plist/>'));
  await inner.write(PKG_INFO, text('APPL????'));
  await inner.write(MINE, text('user data'));
  await inner.write(['Users', 'prasenjit', 'Desktop', 'note.txt'], text('note'));
  let owned: ReadonlyMap<string, string> = new Map(initial);
  const store = new ProtectedDiskStore(inner, () => owned);
  return { store, inner, own: (next: [string, string][]) => (owned = new Map(next)) };
}

const rejection = async (task: Promise<unknown>): Promise<DiskError> => {
  try {
    await task;
  } catch (error) {
    if (error instanceof DiskError) return error;
    throw error;
  }
  throw new Error('应该被拒绝');
};

describe('ProtectedDiskStore 读与建目录不受影响', () => {
  it('list、kindOf、info、read 原样透传', async () => {
    const { store } = await setup();
    expect(await store.list(['Applications'])).toEqual([{ name: 'Safari.app', kind: 'directory' }]);
    expect(await store.kindOf(SAFARI)).toBe('directory');
    expect(await store.kindOf(['nope'])).toBeNull();
    expect(decode(await store.read(INFO))).toBe('<plist/>');
    expect(await store.info(INFO)).toMatchObject({ size: 8 });
  });

  it('mkdir 不受保护，连预装包下面也可以建目录', async () => {
    const { store, inner } = await setup();
    await store.mkdir([...SAFARI, 'Contents', 'Resources', 'more']);
    await store.mkdir(['Applications', 'My Apps']);
    expect(await inner.kindOf([...SAFARI, 'Contents', 'Resources', 'more'])).toBe('directory');
    expect(await inner.kindOf(['Applications', 'My Apps'])).toBe('directory');
  });
});

describe('ProtectedDiskStore 写', () => {
  it('覆盖受保护的文件被拒绝：抛 EACCES，文件内容不变', async () => {
    const { store, inner } = await setup();
    const error = await rejection(store.write(INFO, text('tampered')));
    expect(error).toMatchObject({
      code: 'EACCES',
      path: INFO,
      message: 'The item “Info.plist” can’t be changed because it’s part of a preinstalled application.'
    });
    expect(decode(await inner.read(INFO))).toBe('<plist/>');
  });

  it('replace 与 write 走同一条保护：受保护的文件不能覆盖，用户文件可以，不存在的文件抛 ENOENT', async () => {
    const { store, inner } = await setup();
    const error = await rejection(store.replace(INFO, text('tampered')));
    expect(error).toMatchObject({ code: 'EACCES', path: INFO });
    expect(decode(await inner.read(INFO))).toBe('<plist/>');

    await store.replace(MINE, text('edited'));
    expect(decode(await inner.read(MINE))).toBe('edited');
    await expect(store.replace([...SAFARI, 'Contents', 'ghost.txt'], text('x'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('用户放进包里的文件、以及别处的文件都可以写', async () => {
    const { store, inner } = await setup();
    await store.write(MINE, text('edited'));
    await store.write(['Users', 'prasenjit', 'Documents', 'new.txt'], text('new'));
    expect(decode(await inner.read(MINE))).toBe('edited');
    expect(decode(await inner.read(['Users', 'prasenjit', 'Documents', 'new.txt']))).toBe('new');
  });
});

describe('ProtectedDiskStore 删除', () => {
  it('删除预装包、系统写入的子项都被拒绝，包完好无损', async () => {
    const { store, inner } = await setup();
    for (const path of [SAFARI, INFO, PKG_INFO, [...SAFARI, 'Contents']]) {
      const error = await rejection(store.remove(path));
      expect(error.code).toBe('EACCES');
      expect(error.path).toEqual(path);
    }
    expect(await inner.kindOf(INFO)).toBe('file');
    expect(await inner.kindOf(PKG_INFO)).toBe('file');
  });

  it('递归删除 /Applications 或更高的祖先同样被拒绝，说明它包含预装应用', async () => {
    const { store, inner } = await setup();
    const error = await rejection(store.remove(['Applications']));
    expect(error.message).toBe(
      'The item “Applications” can’t be removed because it contains preinstalled applications.'
    );
    await rejection(store.remove([]));
    expect(await inner.kindOf(SAFARI)).toBe('directory');
  });

  it('用户放进包里的文件可以删；不受保护的同名条目也可以删', async () => {
    const { store, inner } = await setup();
    await inner.write(['Applications', 'Mail.app'], text('a plain file with a bundle-like name'));
    await store.remove(MINE);
    await store.remove(['Applications', 'Mail.app']);
    expect(await inner.kindOf(MINE)).toBeNull();
    expect(await inner.kindOf(['Applications', 'Mail.app'])).toBeNull();
  });
});

describe('ProtectedDiskStore 移动与改名', () => {
  it('移动、改名预装包或其系统子项被拒绝，报的是源路径', async () => {
    const { store, inner } = await setup();
    const error = await rejection(store.move(SAFARI, ['Applications', 'Safari Renamed.app']));
    expect(error).toMatchObject({
      code: 'EACCES',
      path: SAFARI,
      message: 'The item “Safari.app” can’t be moved because it’s part of a preinstalled application.'
    });
    await rejection(store.move(INFO, [...SAFARI, 'Contents', 'Info.old']));
    expect(await inner.kindOf(SAFARI)).toBe('directory');
    expect(await inner.kindOf([...SAFARI, 'Contents', 'Info.old'])).toBeNull();
  });

  it('移动 /Applications 或卷根被拒绝', async () => {
    const { store } = await setup();
    await rejection(store.move(['Applications'], ['Users', 'prasenjit', 'Applications']));
    await rejection(store.move([], ['Elsewhere']));
  });

  it('把别的东西移到受保护路径上（覆盖）、或移到包含预装包的祖先上被拒绝', async () => {
    const { store, inner } = await setup();
    const note: DiskPath = ['Users', 'prasenjit', 'Desktop', 'note.txt'];
    const error = await rejection(store.move(note, INFO));
    expect(error.message).toBe('“Info.plist” can’t be replaced because it’s part of a preinstalled application.');
    await rejection(store.move(note, ['Applications']));
    expect(decode(await inner.read(INFO))).toBe('<plist/>');
    expect(await inner.kindOf(note)).toBe('file');
  });

  it('用户的文件可以移动，包括在包内改名、或移出包', async () => {
    const { store, inner } = await setup();
    await store.move(MINE, [...SAFARI, 'Contents', 'Resources', 'renamed.txt']);
    await store.move(
      [...SAFARI, 'Contents', 'Resources', 'renamed.txt'],
      ['Users', 'prasenjit', 'Desktop', 'rescued.txt']
    );
    expect(decode(await inner.read(['Users', 'prasenjit', 'Desktop', 'rescued.txt']))).toBe('user data');
  });
});

describe('ProtectedDiskStore 保护判断每次取最新', () => {
  it('预装包登记之前什么都放行，登记之后立刻生效；包被退役后又放行', async () => {
    const { store, inner, own } = await setup([]);
    await store.write(INFO, text('before registration'));
    expect(decode(await inner.read(INFO))).toBe('before registration');

    own([['Safari.app', 'safari']]);
    await rejection(store.write(INFO, text('after registration')));
    await rejection(store.remove(SAFARI));
    expect(decode(await inner.read(INFO))).toBe('before registration');

    own([]);
    await store.remove(SAFARI);
    expect(await inner.kindOf(SAFARI)).toBeNull();
  });
});
