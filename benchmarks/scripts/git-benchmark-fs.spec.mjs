import { describe, expect, it, vi } from 'vitest';
import { createEmscriptenFs, createOpfsFs } from './git-benchmark-fs.mjs';

function createRoot() {
  const root = { kind: 'directory', children: new Map() };
  const handles = (node, name = '') => ({
    kind: node.kind,
    name,
    async getDirectoryHandle(key, { create = false } = {}) {
      let child = node.children.get(key);
      if (!child && create) {
        child = { kind: 'directory', children: new Map() };
        node.children.set(key, child);
      }
      if (!child) throw new DOMException('missing', 'NotFoundError');
      if (child.kind !== 'directory') throw new DOMException('file', 'TypeMismatchError');
      return handles(child, key);
    },
    async getFileHandle(key, { create = false } = {}) {
      let child = node.children.get(key);
      if (!child && create) {
        child = { kind: 'file', data: new Uint8Array(), mtime: 1_700_000_000_000 };
        node.children.set(key, child);
      }
      if (!child) throw new DOMException('missing', 'NotFoundError');
      if (child.kind !== 'file') throw new DOMException('directory', 'TypeMismatchError');
      return handles(child, key);
    },
    async getFile() {
      return new File([node.data], name, { lastModified: node.mtime });
    },
    async createWritable() {
      let pending;
      return {
        async write(data) {
          pending = new Uint8Array(data);
        },
        async close() {
          node.data = pending;
          node.mtime += 1_000;
        }
      };
    },
    async removeEntry(key) {
      const child = node.children.get(key);
      if (!child) throw new DOMException('missing', 'NotFoundError');
      if (child.kind === 'directory' && child.children.size) {
        throw new DOMException('not empty', 'InvalidModificationError');
      }
      node.children.delete(key);
    },
    async *entries() {
      for (const [key, child] of node.children) yield [key, handles(child, key)];
    }
  });
  return handles(root);
}

describe('OPFS Git benchmark filesystem', () => {
  it('round-trips UTF-8 and bytes, and reports actual file metadata', async () => {
    const root = createRoot();
    const { promises: fs } = await createOpfsFs(root);
    await fs.mkdir('/repo');
    await fs.writeFile('/repo/你好.txt', '你好');
    expect(await fs.readFile('/repo/你好.txt', 'utf8')).toBe('你好');
    expect(await fs.readFile('/repo/你好.txt')).toEqual(new TextEncoder().encode('你好'));
    const expected = await (await (await root.getDirectoryHandle('repo')).getFileHandle('你好.txt')).getFile();
    const stat = await fs.stat('/repo/你好.txt');
    expect(stat).toMatchObject({
      mode: 0o100644,
      size: expected.size,
      mtimeMs: expected.lastModified,
      ctimeMs: expected.lastModified,
      ino: 0,
      uid: 0,
      gid: 0
    });
    expect(stat.mtime.getTime()).toBe(expected.lastModified);
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect((await fs.stat('/repo')).mode).toBe(0o40755);
  });

  it('observes equal-length rewrites without cached file data or fake stat timestamps', async () => {
    const { promises: fs } = await createOpfsFs(createRoot());
    await fs.writeFile('/a', new Uint8Array([1, 2]));
    const before = await fs.stat('/a');
    expect((await fs.stat('/a')).mtimeMs).toBe(before.mtimeMs);
    await fs.writeFile('/a', new Uint8Array([3, 4]));
    expect((await fs.stat('/a')).mtimeMs).toBe(before.mtimeMs + 1_000);
    expect(await fs.readFile('/a')).toEqual(new Uint8Array([3, 4]));
  });

  it('rejects traversal outside the root before accessing OPFS', async () => {
    const root = createRoot();
    root.getDirectoryHandle = vi.fn(root.getDirectoryHandle);
    const { promises: fs } = await createOpfsFs(root);
    await expect(fs.writeFile('/../outside', 'x')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.stat('/repo/../../outside')).rejects.toMatchObject({ code: 'EACCES' });
    expect(root.getDirectoryHandle).not.toHaveBeenCalled();
  });

  it('uses nonrecursive mkdir and Node directory/error semantics', async () => {
    const { promises: fs } = await createOpfsFs(createRoot());
    await expect(fs.mkdir('/missing/child')).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.mkdir('/repo');
    await expect(fs.mkdir('/repo')).rejects.toMatchObject({ code: 'EEXIST' });
    await fs.writeFile('/repo/a', 'x');
    await expect(fs.mkdir('/repo/a')).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.writeFile('/repo/a/child', 'x')).rejects.toMatchObject({ code: 'ENOTDIR' });
    await expect(fs.readFile('/repo')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(fs.unlink('/repo')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(fs.rmdir('/repo')).rejects.toMatchObject({ code: 'ENOTEMPTY' });
    expect(await fs.readdir('/repo')).toEqual(['a']);
    await fs.unlink('/repo/a');
    await fs.rmdir('/repo');
    await expect(fs.stat('/repo')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects unsupported symlinks and chmod explicitly', async () => {
    const { promises: fs } = await createOpfsFs(createRoot());
    await expect(fs.symlink('/a', '/b')).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(fs.readlink('/a')).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(fs.chmod('/a', 0o755)).rejects.toMatchObject({ code: 'ENOTSUP' });
  });

  it('preserves byte-view boundaries and surfaces write quota failures', async () => {
    const root = createRoot();
    const { promises: fs } = await createOpfsFs(root);
    await fs.writeFile('/a', Buffer.from([0, 1, 2, 3]).subarray(1, 3));
    expect(await fs.readFile('/a')).toEqual(new Uint8Array([1, 2]));
    root.getFileHandle = vi.fn(async () => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await expect(fs.writeFile('/b', 'x')).rejects.toMatchObject({ code: 'ENOSPC' });
  });
});

describe('Emscripten Git benchmark filesystem', () => {
  it.each([1, 1_700_000_000])(
    'converts WasmFS POSIX seconds %i to milliseconds without guessing units',
    async seconds => {
      const { promises: fs } = createEmscriptenFs({
        stat: () => ({ mode: 0o100644, size: 2, mtime: seconds, ctime: seconds - 1 })
      });
      const stat = await fs.stat('/a');
      expect(stat.mtimeMs).toBe(seconds * 1_000);
      expect(stat.ctimeMs).toBe((seconds - 1) * 1_000);
      expect(stat.mtime.getTime()).toBe(seconds * 1_000);
      expect(stat.ctime.getTime()).toBe((seconds - 1) * 1_000);
    }
  );

  it('prefers explicit millisecond fields, including zero', async () => {
    const { promises: fs } = createEmscriptenFs({
      stat: () => ({ mode: 0o100644, size: 2, mtime: 17, ctime: 18, mtimeMs: 0, ctimeMs: 500 })
    });
    expect(await fs.stat('/a')).toMatchObject({ mtimeMs: 0, ctimeMs: 500 });
  });

  it('normalizes Date stat fields and directory listings', async () => {
    const FS = {
      stat: vi.fn(() => ({ mode: 0o100644, size: 2, mtime: new Date(1_234), ctime: new Date(1_000), ino: 9 })),
      lstat: vi.fn(() => ({ mode: 0o40755, size: 0, mtime: new Date(1_234), ctime: new Date(1_000) })),
      readdir: vi.fn(() => ['.', '..', 'a']),
      isFile: mode => (mode & 0o170000) === 0o100000,
      isDir: mode => (mode & 0o170000) === 0o040000,
      isLink: mode => (mode & 0o170000) === 0o120000
    };
    const { promises: fs } = createEmscriptenFs(FS);
    expect(await fs.readdir('/repo')).toEqual(['a']);
    const stat = await fs.stat('/repo/a');
    expect(stat).toMatchObject({ mode: 0o100644, mtimeMs: 1_234, ctimeMs: 1_000, ino: 9 });
    expect(stat.isFile()).toBe(true);
    expect((await fs.lstat('/repo')).isDirectory()).toBe(true);
  });

  it.each([
    [44, 'ENOENT'],
    [20, 'EEXIST'],
    [54, 'ENOTDIR'],
    [31, 'EISDIR'],
    [55, 'ENOTEMPTY']
  ])('translates errno %i to %s', async (errno, code) => {
    const { promises: fs } = createEmscriptenFs({
      stat() {
        throw Object.assign(new Error('errno'), { errno });
      }
    });
    await expect(fs.stat('/missing')).rejects.toMatchObject({ code, path: '/missing', syscall: 'stat' });
  });

  it('encodes bytes and translates UTF-8 without changing the underlying file API', async () => {
    const readFile = vi.fn(() => new TextEncoder().encode('你好'));
    const writeFile = vi.fn();
    const { promises: fs } = createEmscriptenFs({ readFile, writeFile });
    expect(await fs.readFile('/a', { encoding: 'utf8' })).toBe('你好');
    await fs.writeFile('/a', '你好');
    expect(writeFile).toHaveBeenCalledWith('/a', new TextEncoder().encode('你好'), {});
    await expect(fs.readFile('/../a')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.symlink('/a', '/b')).rejects.toMatchObject({ code: 'ENOTSUP' });
  });
});
