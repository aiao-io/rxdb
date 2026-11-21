import { Vivari, VivariError } from '@vivari/core';
import { describe, expect, it, vi } from 'vitest';

import { vivariFs } from './vm-fs';

const entry = (name: string, kind: 'file' | 'directory' | 'symlink') => ({
  name,
  isDirectory: () => kind === 'directory',
  isFile: () => kind === 'file'
});

const stats = (kind: 'file' | 'directory', size: number, mtimeMs: number) => ({
  isDirectory: () => kind === 'directory',
  size,
  mtimeMs
});

/** Vivari 里 `fs` 与 `mount` 的替身：只实现适配层会调用的方法。 */
function fakeVivari() {
  return {
    fs: {
      readdir: vi.fn(async () => [entry('a.txt', 'file'), entry('src', 'directory'), entry('link', 'symlink')]),
      stat: vi.fn<(path: string) => Promise<ReturnType<typeof stats>>>(async () => stats('file', 12, 34)),
      readFile: vi.fn<(path: string) => Promise<Uint8Array>>(async () => new Uint8Array([1, 2])),
      writeFile: vi.fn<(path: string, data: Uint8Array) => Promise<void>>(async () => undefined),
      mkdir: vi.fn<(path: string, options: object) => Promise<void>>(async () => undefined),
      rm: vi.fn<(path: string, options: object) => Promise<void>>(async () => undefined)
    },
    mount: vi.fn<(tree: object, options: object) => Promise<void>>(async () => undefined)
  };
}

function setup() {
  const vivari = fakeVivari();
  return { vivari, vmFs: vivariFs(vivari as unknown as Vivari) };
}

describe('vivariFs', () => {
  it('list 带类型列出目录：文件、目录，符号链接等记为 other', async () => {
    const { vivari, vmFs } = setup();
    expect(await vmFs.list('/Users')).toEqual([
      { name: 'a.txt', kind: 'file' },
      { name: 'src', kind: 'directory' },
      { name: 'link', kind: 'other' }
    ]);
    expect(vivari.fs.readdir).toHaveBeenCalledExactlyOnceWith('/Users', { withFileTypes: true });
  });

  it('stat 返回类型、大小与修改时间', async () => {
    const { vivari, vmFs } = setup();
    expect(await vmFs.stat('/Users/a.txt')).toEqual({ kind: 'file', size: 12, mtimeMs: 34 });
    vivari.fs.stat.mockResolvedValueOnce(stats('directory', 0, 5));
    expect(await vmFs.stat('/Users')).toEqual({ kind: 'directory', size: 0, mtimeMs: 5 });
  });

  it('stat 对不存在的路径（ENOENT、ENOTDIR）返回 null，其他错误照常抛出', async () => {
    const { vivari, vmFs } = setup();
    vivari.fs.stat.mockRejectedValueOnce(new VivariError('ENOENT', 'missing'));
    expect(await vmFs.stat('/nope')).toBeNull();
    vivari.fs.stat.mockRejectedValueOnce(new VivariError('ENOTDIR', 'not a dir'));
    expect(await vmFs.stat('/a.txt/b')).toBeNull();

    const denied = new VivariError('EIO', 'denied');
    vivari.fs.stat.mockRejectedValueOnce(denied);
    await expect(vmFs.stat('/root')).rejects.toBe(denied);
    const plain = new Error('boom');
    vivari.fs.stat.mockRejectedValueOnce(plain);
    await expect(vmFs.stat('/x')).rejects.toBe(plain);
  });

  it('read、write 直通 Vivari 的文件读写', async () => {
    const { vivari, vmFs } = setup();
    expect(await vmFs.read('/a')).toEqual(new Uint8Array([1, 2]));
    await vmFs.write('/b', new Uint8Array([9]));
    expect(vivari.fs.readFile).toHaveBeenCalledExactlyOnceWith('/a');
    expect(vivari.fs.writeFile).toHaveBeenCalledExactlyOnceWith('/b', new Uint8Array([9]));
  });

  it('mkdir 递归创建，remove 递归强制删除', async () => {
    const { vivari, vmFs } = setup();
    await vmFs.mkdir('/a/b/c');
    await vmFs.remove('/a');
    expect(vivari.fs.mkdir).toHaveBeenCalledExactlyOnceWith('/a/b/c', { recursive: true });
    expect(vivari.fs.rm).toHaveBeenCalledExactlyOnceWith('/a', { recursive: true, force: true });
  });

  it('mount 把整棵树一次写到挂载点下', async () => {
    const { vivari, vmFs } = setup();
    const tree = { Users: { directory: {} } };
    await vmFs.mount(tree, '/');
    expect(vivari.mount).toHaveBeenCalledExactlyOnceWith(tree, { mountPoint: '/' });
  });
});
