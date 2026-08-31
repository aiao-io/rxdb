import { describe, expect, it } from 'vitest';
import { createDevToolsOpfsFilesProvider } from '../../browser/opfs-files-provider.js';
import { createFakeOpfsRoot, type FakeOpfsRoot } from './fake-opfs.js';

function setup(seed?: (root: FakeOpfsRoot) => void) {
  const root = createFakeOpfsRoot();
  seed?.(root);
  const provider = createDevToolsOpfsFilesProvider({
    getRootDirectory: () => Promise.resolve(root.handle),
    maxTransferBytes: 64
  });
  return { root, provider };
}

function codeOf(result: { outcome: string; error?: { code: string } }): string {
  return result.outcome === 'failed' ? (result.error?.code ?? '') : 'ok';
}

describe('OPFS files provider — descriptor', () => {
  it('MUST declare the browser opfs kind with the protocol operation order', () => {
    const { provider } = setup();

    expect(provider.descriptor).toEqual({
      domain: 'files',
      version: 1,
      kind: 'opfs',
      operations: ['list', 'download', 'upload', 'create-directory', 'delete'],
      runtime: 'browser',
      limits: { maxTransferBytes: 64 }
    });
  });
});

describe('OPFS files provider — list', () => {
  it('MUST return the subtree rooted at the requested path', async () => {
    const { provider } = setup(root => {
      root.writeFile('db/main.sqlite', 12);
      root.mkdir('db/empty');
    });

    const result = await provider.invoke('list', { path: 'db' });

    expect(result).toEqual({
      outcome: 'ok',
      result: {
        path: 'db',
        entries: [
          { name: 'empty', kind: 'directory', path: 'db/empty', entries: [] },
          { name: 'main.sqlite', kind: 'file', path: 'db/main.sqlite', size: 12, lastModified: 0 }
        ]
      }
    });
  });

  // 目录本身缺席与「路径写错」是两件事，错误码必须分开。
  it('MUST answer resource_not_found for a missing directory', async () => {
    const { provider } = setup();
    expect(codeOf(await provider.invoke('list', { path: 'nope' }))).toBe('resource_not_found');
  });

  it('MUST answer invalid_path for traversal and for non-string paths', async () => {
    const { provider } = setup();
    expect(codeOf(await provider.invoke('list', { path: '../escape' }))).toBe('invalid_path');
    expect(codeOf(await provider.invoke('list', { path: 7 }))).toBe('invalid_path');
  });
});

describe('OPFS files provider — mutations', () => {
  it('MUST create a directory and reject a colliding name', async () => {
    const { provider, root } = setup();

    expect(codeOf(await provider.invoke('create-directory', { path: 'a/b' }))).toBe('ok');
    expect(root.exists('a/b')).toBe(true);
    expect(codeOf(await provider.invoke('create-directory', { path: 'a/b' }))).toBe('resource_conflict');
  });

  it('MUST delete files and directories recursively', async () => {
    const { provider, root } = setup(r => {
      r.writeFile('a/b/c.bin', 3);
    });

    expect(codeOf(await provider.invoke('delete', { path: 'a/b/c.bin' }))).toBe('ok');
    expect(root.exists('a/b/c.bin')).toBe(false);
    expect(codeOf(await provider.invoke('delete', { path: 'a' }))).toBe('ok');
    expect(root.exists('a')).toBe(false);
    expect(codeOf(await provider.invoke('delete', { path: 'a' }))).toBe('resource_not_found');
  });
});

describe('OPFS files provider — upload binding', () => {
  it('MUST bind a chunk sink to the transferId the upload request declared', async () => {
    const { provider, root } = setup();

    const accepted = await provider.invoke('upload', { transferId: 'trf-1', path: 'up', name: 'x.bin', size: 5 });
    expect(accepted).toEqual({ outcome: 'ok', result: { path: 'up/x.bin', transferId: 'trf-1' } });

    const sink = provider.createChunkSink('trf-1');
    await sink.write(new Uint8Array([1, 2, 3]));
    await sink.write(new Uint8Array([4, 5]));
    // commit 之前目标文件不得出现：半写文件不能被别的读者看见。
    expect(root.exists('up/x.bin')).toBe(false);
    await sink.commit();
    expect(root.fileSize('up/x.bin')).toBe(5);
  });

  it('MUST discard without committing and MUST be idempotent', async () => {
    const { provider, root } = setup();
    await provider.invoke('upload', { transferId: 'trf-2', path: '', name: 'y.bin', size: 2 });

    const sink = provider.createChunkSink('trf-2');
    await sink.write(new Uint8Array([9]));
    await sink.discard();
    await sink.discard();

    expect(root.exists('y.bin')).toBe(false);
  });

  /**
   * commit 半途死掉之后的 discard 必须真的清理，不能因为「已经 settled」就跳过。
   *
   * @remarks
   * `commit()` 在做临时文件 → 目标文件的搬运**之前**就把状态标成已结算，所以搬运这一步
   * 抛出时，端点的收口调用 discard，而 discard 看到「已结算且没有活着的 writable」就直接
   * 返回——临时文件永久留在 OPFS 里。每失败一次泄一个，全都是用户看不懂的隐藏文件，
   * 而且占着浏览器存储配额。
   */
  it('MUST clean up the temporary file when commit fails part-way', async () => {
    const { provider } = setup(r => {
      // 目标名被一个目录占着：搬运时的 `getFileHandle(name)` 必然抛 TypeMismatchError，
      // 而临时文件此时已经写好并关闭了。
      r.mkdir('blocked.bin');
    });
    await provider.invoke('upload', { transferId: 'trf-commit-fail', path: '', name: 'blocked.bin', size: 1 });

    const sink = provider.createChunkSink('trf-commit-fail');
    await sink.write(new Uint8Array([7]));
    await expect(sink.commit()).rejects.toThrow();
    await sink.discard();

    const listed = await provider.invoke('list', { path: '' });
    const names = (listed as { result: { entries: readonly { name: string }[] } }).result.entries.map(
      entry => entry.name
    );
    expect(names.filter(name => name.startsWith('.rxdb-devtools-upload-'))).toEqual([]);
  });

  // transferId 是 sink 与 upload 请求之间唯一的绑定；对不上必须炸，不能开一个无主 sink。
  it('MUST throw for a chunk sink whose transferId was never registered', () => {
    const { provider } = setup();
    expect(() => provider.createChunkSink('trf-unknown')).toThrow(/trf-unknown/u);
  });

  it('MUST reject an upload larger than the declared transfer limit', async () => {
    const { provider } = setup();
    const result = await provider.invoke('upload', { transferId: 't', path: '', name: 'z', size: 65 });
    expect(codeOf(result)).toBe('transfer_size_exceeded');
    expect(() => provider.createChunkSink('t')).toThrow();
  });

  it('MUST reject a second upload reusing a live transferId', async () => {
    const { provider } = setup();
    await provider.invoke('upload', { transferId: 'dup', path: '', name: 'a', size: 1 });
    expect(codeOf(await provider.invoke('upload', { transferId: 'dup', path: '', name: 'b', size: 1 }))).toBe(
      'resource_conflict'
    );
  });
});

describe('OPFS files provider — download', () => {
  it('MUST report file metadata and save through the page', async () => {
    const saved: { name: string; size: number }[] = [];
    const root = createFakeOpfsRoot();
    root.writeFile('db/main.sqlite', 12);
    const provider = createDevToolsOpfsFilesProvider({
      getRootDirectory: () => Promise.resolve(root.handle),
      maxTransferBytes: 64,
      saveToDisk: (file, name) => {
        saved.push({ name, size: file.size });
        return Promise.resolve();
      }
    });

    const result = await provider.invoke('download', { path: 'db/main.sqlite' });

    expect(result).toEqual({
      outcome: 'ok',
      result: { path: 'db/main.sqlite', name: 'main.sqlite', size: 12 }
    });
    expect(saved).toEqual([{ name: 'main.sqlite', size: 12 }]);
  });

  it('MUST answer resource_not_found for a missing file', async () => {
    const { provider } = setup();
    expect(codeOf(await provider.invoke('download', { path: 'gone.bin' }))).toBe('resource_not_found');
  });
});

describe('OPFS files provider — unknown operations', () => {
  // 授权层保证只会传已声明的操作名；真的漏进来一个未知名字是接线错误，不是用户输入。
  it('MUST answer provider_unsupported for an operation outside the catalogue', async () => {
    const { provider } = setup();
    expect(codeOf(await provider.invoke('rename', {}))).toBe('provider_unsupported');
  });
});
