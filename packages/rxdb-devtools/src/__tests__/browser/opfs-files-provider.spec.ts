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

/** 根目录下残留的上传临时文件名。 */
async function temporaryNames(provider: ReturnType<typeof setup>['provider']): Promise<string[]> {
  const listed = await provider.invoke('list', { path: '' });
  const entries = (listed as { result: { entries: readonly { name: string }[] } }).result.entries;
  return entries.map(entry => entry.name).filter(name => name.startsWith('.rxdb-devtools-upload-'));
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
    const { provider, root } = setup();
    await provider.invoke('upload', { transferId: 'trf-commit-fail', path: '', name: 'blocked.bin', size: 1 });
    // 目标名在登记**之后**才被一个目录占住：commit 搬运前的二次探测必然拒绝，
    // 而临时文件此时已经写好并关闭了。（登记时就被占的情形见下方「同名冲突」。）
    root.mkdir('blocked.bin');

    const sink = provider.createChunkSink('trf-commit-fail');
    await sink.write(new Uint8Array([7]));
    await expect(sink.commit()).rejects.toThrow();
    await sink.discard();

    expect(await temporaryNames(provider)).toEqual([]);
    // 占住目标名的是别人的条目，commit 失败的收尾不得顺手删掉它。
    expect(root.exists('blocked.bin')).toBe(true);
  });

  /**
   * 写目标半途失败（配额）时，本次新建的目标要撤掉。
   *
   * @remarks
   * `getFileHandle(name, { create: true })` 一返回目标就已经存在；随后写入抛出而不撤的话，
   * 留下的是一个对同源读者可见的空文件——面板按文件名确认上传，会把它报成上传成功。
   */
  it('MUST remove the target it created when writing the target fails', async () => {
    const { provider, root } = setup();
    root.failWritesTo('full.bin');
    await provider.invoke('upload', { transferId: 'trf-quota', path: '', name: 'full.bin', size: 2 });

    const sink = provider.createChunkSink('trf-quota');
    await sink.write(new Uint8Array([1, 2]));
    await expect(sink.commit()).rejects.toThrow();
    await sink.discard();

    expect(root.exists('full.bin')).toBe(false);
    expect(await temporaryNames(provider)).toEqual([]);
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

describe('OPFS files provider — upload name conflicts', () => {
  /**
   * 同名条目已在时，上传在登记期就以 `resource_conflict` 拒绝。
   *
   * @remarks
   * OPFS 根目录与宿主应用共享：照写不误的话，被静默覆盖的可能是应用自己的数据库文件。
   * 与 `create-directory` 同一条规则——占住这个名字的是文件还是目录都算冲突。
   */
  it('MUST refuse an upload onto a taken name and keep the existing entry intact', async () => {
    const { provider, root } = setup(r => {
      r.writeFile('db/main.sqlite', 12);
      r.mkdir('db/wal');
    });

    const onFile = await provider.invoke('upload', {
      transferId: 'trf-file',
      path: 'db',
      name: 'main.sqlite',
      size: 3
    });
    const onDirectory = await provider.invoke('upload', { transferId: 'trf-dir', path: 'db', name: 'wal', size: 3 });

    expect(codeOf(onFile)).toBe('resource_conflict');
    expect(codeOf(onDirectory)).toBe('resource_conflict');
    expect(root.fileSize('db/main.sqlite')).toBe(12);
    expect(root.exists('db/wal')).toBe(true);
    // 被拒的登记不得留下可取的 sink。
    expect(() => provider.createChunkSink('trf-file')).toThrow();
  });

  /**
   * START 不等 RESPONSE：sink 在登记期探出冲突**之前**就已被取走，commit 必须自己再挡一次。
   *
   * @remarks
   * 协议让面板把 `TRANSFER_START` 紧跟在 upload 请求后面发出，connector 同步派发它（见
   * `upload` 里的登记注释）。所以「登记期拒绝」挡不住已经绑好的那个 sink——只靠它的话，
   * 字节照样会在 COMPLETE 时覆盖目标。
   */
  it('MUST NOT overwrite a taken name through a sink bound before the conflict was known', async () => {
    const { provider, root } = setup(r => {
      r.writeFile('taken.bin', 4);
    });

    const answer = provider.invoke('upload', { transferId: 'trf-race', path: '', name: 'taken.bin', size: 2 });
    const sink = provider.createChunkSink('trf-race');
    expect(codeOf(await answer)).toBe('resource_conflict');

    await sink.write(new Uint8Array([1, 2]));
    await expect(sink.commit()).rejects.toThrow();
    await sink.discard();

    expect(root.fileSize('taken.bin')).toBe(4);
    expect(await temporaryNames(provider)).toEqual([]);
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
