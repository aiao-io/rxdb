import {
  DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION,
  DESKTOP_HOST_MAX_QUEUED_LOCKS_PER_NAME,
  type DesktopHostFileResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElectronFileHost, type ElectronFileHost } from '../electron-file-host.js';

const textOf = (value: string): Uint8Array => new TextEncoder().encode(value);

/** 断言应答不是错误，并把它收窄到指定 kind。 */
const expectOk = <TKind extends DesktopHostFileResponse['kind']>(
  response: DesktopHostFileResponse,
  kind: TKind
): Extract<DesktopHostFileResponse, { kind: TKind }> => {
  expect(response).toMatchObject({ kind });
  return response as Extract<DesktopHostFileResponse, { kind: TKind }>;
};

const expectError = (response: DesktopHostFileResponse, code: string): void => {
  expect(response).toMatchObject({ kind: 'error', code });
};

describe('createElectronFileHost', () => {
  let workspace: string;
  let storageRoot: string;
  let host: ElectronFileHost;
  let sessionId: string;

  const openSession = async (): Promise<string> => {
    const response = expectOk(await host.handle({ kind: 'file.open' }), 'file.open');
    return response.result.sessionId;
  };

  const writeThrough = async (path: string, content: string): Promise<DesktopHostFileResponse> => {
    const begin = expectOk(await host.handle({ kind: 'file.writeBegin', sessionId, path }), 'file.writeBegin');
    const { writeId } = begin.result;
    await host.handle({ kind: 'file.writeChunk', sessionId, writeId, chunk: textOf(content) });
    return host.handle({ kind: 'file.writeCommit', sessionId, writeId });
  };

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'rxdb-file-host-'));
    storageRoot = join(workspace, 'rxdb-files');
    host = createElectronFileHost({ resolveStorageRoot: () => storageRoot });
    sessionId = await openSession();
    await host.handle({ kind: 'file.mkdir', sessionId, path: '' });
  });

  afterEach(async () => {
    await host.closeAll();
    await rm(workspace, { recursive: true, force: true });
  });

  it('creates the storage root on demand and reports it as an empty directory', async () => {
    const listing = expectOk(await host.handle({ kind: 'file.list', sessionId, path: '' }), 'file.list');

    expect(listing.result).toEqual([]);
    await expect(readdir(storageRoot)).resolves.toEqual([]);
  });

  it('commits a write through a temporary file and leaves no temporary behind', async () => {
    expectOk(await writeThrough('notes.txt', 'hello'), 'file.writeCommit');

    await expect(readFile(join(storageRoot, 'notes.txt'), 'utf8')).resolves.toBe('hello');
    await expect(readdir(storageRoot)).resolves.toEqual(['notes.txt']);
  });

  it('keeps the previous content when a write is aborted before commit', async () => {
    await writeThrough('notes.txt', 'original');
    const begin = expectOk(
      await host.handle({ kind: 'file.writeBegin', sessionId, path: 'notes.txt' }),
      'file.writeBegin'
    );
    await host.handle({ kind: 'file.writeChunk', sessionId, writeId: begin.result.writeId, chunk: textOf('half') });

    expectOk(
      await host.handle({ kind: 'file.writeAbort', sessionId, writeId: begin.result.writeId }),
      'file.writeAbort'
    );

    await expect(readFile(join(storageRoot, 'notes.txt'), 'utf8')).resolves.toBe('original');
    await expect(readdir(storageRoot)).resolves.toEqual(['notes.txt']);
  });

  it('concatenates chunks in call order', async () => {
    const begin = expectOk(
      await host.handle({ kind: 'file.writeBegin', sessionId, path: 'parts.bin' }),
      'file.writeBegin'
    );
    const { writeId } = begin.result;
    for (const part of ['a', 'b', 'c']) {
      await host.handle({ kind: 'file.writeChunk', sessionId, writeId, chunk: textOf(part) });
    }
    await host.handle({ kind: 'file.writeCommit', sessionId, writeId });

    await expect(readFile(join(storageRoot, 'parts.bin'), 'utf8')).resolves.toBe('abc');
  });

  it('creates missing parent directories for a write', async () => {
    await writeThrough('deep/nested/file.txt', 'x');

    await expect(readFile(join(storageRoot, 'deep/nested/file.txt'), 'utf8')).resolves.toBe('x');
  });

  it('rejects a write token that was already committed', async () => {
    const begin = expectOk(await host.handle({ kind: 'file.writeBegin', sessionId, path: 'a.txt' }), 'file.writeBegin');
    const { writeId } = begin.result;
    await host.handle({ kind: 'file.writeCommit', sessionId, writeId });

    expectError(
      await host.handle({ kind: 'file.writeChunk', sessionId, writeId, chunk: textOf('x') }),
      'write_aborted'
    );
    expectError(await host.handle({ kind: 'file.writeCommit', sessionId, writeId }), 'write_aborted');
  });

  it('reads back content frame by frame and flags the final frame', async () => {
    await writeThrough('a.txt', 'abcdef');

    const first = expectOk(
      await host.handle({ kind: 'file.read', sessionId, path: 'a.txt', offset: 0, length: 4 }),
      'file.read'
    );
    const second = expectOk(
      await host.handle({ kind: 'file.read', sessionId, path: 'a.txt', offset: 4, length: 4 }),
      'file.read'
    );

    expect(new TextDecoder().decode(first.result.chunk)).toBe('abcd');
    expect(first.result.eof).toBe(false);
    expect(new TextDecoder().decode(second.result.chunk)).toBe('ef');
    expect(second.result.eof).toBe(true);
  });

  it('reports a zero length final frame when the offset sits at the end of file', async () => {
    await writeThrough('a.txt', 'ab');

    const frame = expectOk(
      await host.handle({ kind: 'file.read', sessionId, path: 'a.txt', offset: 2, length: 4 }),
      'file.read'
    );

    expect(frame.result.chunk.byteLength).toBe(0);
    expect(frame.result.eof).toBe(true);
  });

  it('stats files and directories, and answers null for a missing target', async () => {
    await writeThrough('docs/a.txt', 'abc');

    const file = expectOk(await host.handle({ kind: 'file.stat', sessionId, path: 'docs/a.txt' }), 'file.stat');
    const directory = expectOk(await host.handle({ kind: 'file.stat', sessionId, path: 'docs' }), 'file.stat');
    const missing = expectOk(await host.handle({ kind: 'file.stat', sessionId, path: 'nope.txt' }), 'file.stat');

    expect(file.result).toMatchObject({ kind: 'file', size: 3 });
    expect(directory.result).toMatchObject({ kind: 'directory' });
    expect(missing.result).toBeNull();
  });

  it('lists direct children with their kind', async () => {
    await writeThrough('docs/a.txt', 'a');
    await writeThrough('b.txt', 'b');

    const listing = expectOk(await host.handle({ kind: 'file.list', sessionId, path: '' }), 'file.list');

    expect([...listing.result].sort((left, right) => left.name.localeCompare(right.name))).toEqual([
      { name: 'b.txt', kind: 'file' },
      { name: 'docs', kind: 'directory' }
    ]);
  });

  it('reports file_not_found when listing or reading a missing target', async () => {
    expectError(await host.handle({ kind: 'file.list', sessionId, path: 'nope' }), 'file_not_found');
    expectError(
      await host.handle({ kind: 'file.read', sessionId, path: 'nope.txt', offset: 0, length: 8 }),
      'file_not_found'
    );
  });

  // 删除是幂等的：服务层的回滚补偿会对可能不存在的目标重复调用，
  // 在这里报错会让补偿路径本身失败，把一次可恢复的写失败升级成不可恢复的。
  it('treats removing a missing file or directory as success', async () => {
    expectOk(await host.handle({ kind: 'file.remove', sessionId, path: 'nope.txt' }), 'file.remove');
    expectOk(await host.handle({ kind: 'file.rmdir', sessionId, path: 'nope' }), 'file.rmdir');
  });

  it('removes a directory together with its contents', async () => {
    await writeThrough('docs/a.txt', 'a');

    expectOk(await host.handle({ kind: 'file.rmdir', sessionId, path: 'docs' }), 'file.rmdir');

    await expect(readdir(storageRoot)).resolves.toEqual([]);
  });

  it('moves a file and creates the target parent directory', async () => {
    await writeThrough('a.txt', 'content');

    expectOk(await host.handle({ kind: 'file.move', sessionId, fromPath: 'a.txt', toPath: 'docs/b.txt' }), 'file.move');

    await expect(readFile(join(storageRoot, 'docs/b.txt'), 'utf8')).resolves.toBe('content');
    await expect(readdir(storageRoot)).resolves.toEqual(['docs']);
  });

  it('reports file_not_found when moving a missing source', async () => {
    expectError(
      await host.handle({ kind: 'file.move', sessionId, fromPath: 'nope.txt', toPath: 'b.txt' }),
      'file_not_found'
    );
  });

  // AC#4：路径是 renderer 唯一能影响物理落盘位置的字段
  it.each([
    ['a parent traversal', '../escape.txt'],
    ['a nested traversal', 'docs/../../escape.txt'],
    ['an absolute path', '/etc/passwd'],
    ['a windows drive letter', 'C:/escape.txt'],
    ['an embedded NUL', 'a\u0000.txt'],
    ['a windows reserved device name', 'NUL']
  ])('refuses to write outside the storage root through %s', async (_label, path) => {
    const response = await host.handle({ kind: 'file.writeBegin', sessionId, path });

    expect(response).toMatchObject({ kind: 'error' });
    await expect(readdir(workspace)).resolves.toEqual(['rxdb-files']);
    await expect(readdir(storageRoot)).resolves.toEqual([]);
  });

  // AC#4 续：逐段校验与 `resolve` 都只看字面量，符号链接是它们看不见的那一跳 ——
  // 根内一个指向根外的链接，字面量上完全合法，读写却全落在根之外。
  // Windows 建符号链接要开发者模式或管理员权限，那里跳过。
  describe.skipIf(process.platform === 'win32')('symlink containment', () => {
    let outside: string;

    beforeEach(async () => {
      outside = join(workspace, 'outside');
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, 'secret.txt'), 'classified');
      await symlink(join(outside, 'secret.txt'), join(storageRoot, 'escape.txt'));
      await symlink(outside, join(storageRoot, 'escape-dir'));
    });

    it('refuses to read a file through a symlink pointing outside the root', async () => {
      const response = await host.handle({ kind: 'file.read', sessionId, path: 'escape.txt', offset: 0, length: 64 });

      expectError(response, 'invalid_file_path');
    });

    it('refuses to write through a symlink pointing outside the root', async () => {
      expectError(await host.handle({ kind: 'file.writeBegin', sessionId, path: 'escape.txt' }), 'invalid_file_path');
      expectError(
        await host.handle({ kind: 'file.writeBegin', sessionId, path: 'escape-dir/planted.txt' }),
        'invalid_file_path'
      );

      // 内容与目录项都不能被碰到：报错但顺手建了个临时文件同样是越界写。
      await expect(readFile(join(outside, 'secret.txt'), 'utf8')).resolves.toBe('classified');
      await expect(readdir(outside)).resolves.toEqual(['secret.txt']);
    });

    it('refuses to move a symlink that resolves outside the root', async () => {
      expectError(
        await host.handle({ kind: 'file.move', sessionId, fromPath: 'escape.txt', toPath: 'moved.txt' }),
        'invalid_file_path'
      );
      expectError(
        await host.handle({ kind: 'file.move', sessionId, fromPath: 'inside.txt', toPath: 'escape-dir/moved.txt' }),
        'invalid_file_path'
      );

      await expect(readdir(outside)).resolves.toEqual(['secret.txt']);
    });

    it('refuses to delete through a symlink pointing outside the root', async () => {
      expectError(await host.handle({ kind: 'file.remove', sessionId, path: 'escape.txt' }), 'invalid_file_path');
      expectError(await host.handle({ kind: 'file.rmdir', sessionId, path: 'escape-dir' }), 'invalid_file_path');

      await expect(readFile(join(outside, 'secret.txt'), 'utf8')).resolves.toBe('classified');
    });

    // 反向的那半同样要钉住：封堵的判据是「解析后落在根外」，不是「路径上有链接」。
    // 把根内链接一并拒掉会误伤合法的存储布局，而这种过度封堵只会在真实用户那里才暴露。
    it('still serves a symlink that resolves back inside the root', async () => {
      expectOk(await writeThrough('docs/note.txt', 'kept'), 'file.writeCommit');
      await symlink(join(storageRoot, 'docs'), join(storageRoot, 'alias'));

      const read = expectOk(
        await host.handle({ kind: 'file.read', sessionId, path: 'alias/note.txt', offset: 0, length: 64 }),
        'file.read'
      );

      expect(new TextDecoder().decode(read.result.chunk)).toBe('kept');
      expectOk(await writeThrough('alias/added.txt', 'new'), 'file.writeCommit');
      await expect(readFile(join(storageRoot, 'docs/added.txt'), 'utf8')).resolves.toBe('new');
    });
  });

  it('never rejects, even when the storage root cannot be resolved', async () => {
    const broken = createElectronFileHost({
      resolveStorageRoot: () => {
        throw new Error('no user data path yet');
      }
    });
    const session = expectOk(await broken.handle({ kind: 'file.open' }), 'file.open');

    const response = await broken.handle({
      kind: 'file.stat',
      sessionId: session.result.sessionId,
      path: 'a.txt'
    });

    expect(response).toMatchObject({ kind: 'error', code: 'host_internal_error' });
  });

  it('rejects requests on a session the host never issued', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';

    expectError(await host.handle({ kind: 'file.stat', sessionId: unknown, path: 'a.txt' }), 'session_closed');
  });

  it('answers a malformed request with a protocol violation instead of rejecting', async () => {
    await expect(host.handle({ kind: 'file.nope' })).resolves.toMatchObject({
      kind: 'error',
      code: 'protocol_violation'
    });
  });

  // AC#5：窗口被销毁时未提交的写入必须连同临时文件一起消失，否则存储根里会积累孤儿
  it('discards pending writes and their temporary files when the session closes', async () => {
    await writeThrough('a.txt', 'original');
    const begin = expectOk(await host.handle({ kind: 'file.writeBegin', sessionId, path: 'a.txt' }), 'file.writeBegin');
    await host.handle({ kind: 'file.writeChunk', sessionId, writeId: begin.result.writeId, chunk: textOf('half') });

    expectOk(await host.handle({ kind: 'file.close', sessionId }), 'file.close');

    await expect(readFile(join(storageRoot, 'a.txt'), 'utf8')).resolves.toBe('original');
    await expect(readdir(storageRoot)).resolves.toEqual(['a.txt']);
    expect(host.openSessionCount).toBe(0);
  });

  // AC#7：锁下沉到 host 后，两个独立会话（两个窗口）在同一路径上必须串行
  it('serializes exclusive lock holders across sessions', async () => {
    const other = await openSession();
    const first = expectOk(
      await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' }),
      'file.lockAcquire'
    );

    let granted = false;
    const pending = host
      .handle({ kind: 'file.lockAcquire', sessionId: other, name: 'files:/a', mode: 'exclusive' })
      .then(response => {
        granted = true;
        return response;
      });
    await Promise.resolve();

    expect(granted).toBe(false);

    await host.handle({ kind: 'file.lockRelease', sessionId, lockId: first.result.lockId });
    expectOk(await pending, 'file.lockAcquire');
    expect(granted).toBe(true);
  });

  it('grants shared locks concurrently but blocks an exclusive waiter behind them', async () => {
    const other = await openSession();
    const first = expectOk(
      await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'shared' }),
      'file.lockAcquire'
    );
    const second = expectOk(
      await host.handle({ kind: 'file.lockAcquire', sessionId: other, name: 'files:/a', mode: 'shared' }),
      'file.lockAcquire'
    );

    let granted = false;
    const pending = host
      .handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' })
      .then(response => {
        granted = true;
        return response;
      });
    await Promise.resolve();
    expect(granted).toBe(false);

    await host.handle({ kind: 'file.lockRelease', sessionId, lockId: first.result.lockId });
    await Promise.resolve();
    expect(granted).toBe(false);

    await host.handle({ kind: 'file.lockRelease', sessionId: other, lockId: second.result.lockId });
    expectOk(await pending, 'file.lockAcquire');
  });

  it('does not block holders of unrelated lock names', async () => {
    await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' });

    expectOk(
      await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/b', mode: 'exclusive' }),
      'file.lockAcquire'
    );
  });

  // 一个崩掉的窗口不释放锁，后续窗口就会永久死等
  it('releases locks held by a session when it closes', async () => {
    const other = await openSession();
    await host.handle({ kind: 'file.lockAcquire', sessionId: other, name: 'files:/a', mode: 'exclusive' });

    await host.handle({ kind: 'file.close', sessionId: other });

    expectOk(
      await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' }),
      'file.lockAcquire'
    );
  });

  it('settles a queued lock request when its own session closes', async () => {
    const other = await openSession();
    await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' });
    const pending = host.handle({ kind: 'file.lockAcquire', sessionId: other, name: 'files:/a', mode: 'exclusive' });

    await host.handle({ kind: 'file.close', sessionId: other });

    expectError(await pending, 'session_closed');
  });

  it('rejects releasing a lock token the host never issued', async () => {
    expectError(
      await host.handle({ kind: 'file.lockRelease', sessionId, lockId: '00000000-0000-4000-8000-000000000000' }),
      'protocol_violation'
    );
  });

  it('closeAll drops every session and releases their resources', async () => {
    await openSession();
    await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' });

    await host.closeAll();

    expect(host.openSessionCount).toBe(0);
    // 会话回收也要把锁名带走，否则「退出前清干净」只清了一半。
    expect(host.trackedLockNameCount).toBe(0);
  });

  it('prunes a lock name once nobody holds or waits on it', async () => {
    // 锁名是逐文件的。长跑的 host 不清理，这张表就按访问过的文件数无界增长。
    const acquired = expectOk(
      await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' }),
      'file.lockAcquire'
    );
    expect(host.trackedLockNameCount).toBe(1);

    await host.handle({ kind: 'file.lockRelease', sessionId, lockId: acquired.result.lockId });

    expect(host.trackedLockNameCount).toBe(0);
  });

  it('caps pending writes per session instead of holding unbounded file handles', async () => {
    // 每个未提交的写入都占着一个打开的 fd；不设上限，一个 renderer 就能把 host 的 fd 耗尽。
    for (let index = 0; index < DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION; index++) {
      expectOk(await host.handle({ kind: 'file.writeBegin', sessionId, path: `bulk/${index}.txt` }), 'file.writeBegin');
    }

    expectError(
      await host.handle({ kind: 'file.writeBegin', sessionId, path: 'bulk/overflow.txt' }),
      'protocol_violation'
    );
  });

  it('holds the pending-write cap against concurrent writeBegin', async () => {
    // 额度检查与占位之间隔着 containedPath / mkdir / open 三个 await，并发的 writeBegin
    // 会在任何一个 set 发生之前集体通过检查 —— 上限被并发窗口整体绕过，正是它要防的那种 DoS。
    const attempts = DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION * 2;
    const responses = await Promise.all(
      Array.from({ length: attempts }, (_unused, index) =>
        host.handle({ kind: 'file.writeBegin', sessionId, path: `race/${index}.txt` })
      )
    );

    const granted = responses.filter(response => response.kind === 'file.writeBegin');
    expect(granted).toHaveLength(DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION);
    for (const rejected of responses.filter(response => response.kind !== 'file.writeBegin')) {
      expectError(rejected, 'protocol_violation');
    }
  });

  it('caps queued lock waiters per name instead of growing the queue without bound', async () => {
    const other = await openSession();
    await host.handle({ kind: 'file.lockAcquire', sessionId, name: 'files:/a', mode: 'exclusive' });
    const queued = Array.from({ length: DESKTOP_HOST_MAX_QUEUED_LOCKS_PER_NAME }, () =>
      host.handle({ kind: 'file.lockAcquire', sessionId: other, name: 'files:/a', mode: 'exclusive' })
    );

    const overflow = await host.handle({
      kind: 'file.lockAcquire',
      sessionId: other,
      name: 'files:/a',
      mode: 'exclusive'
    });

    expectError(overflow, 'protocol_violation');
    await host.handle({ kind: 'file.close', sessionId: other });
    await Promise.all(queued);
  });

  it('maps a structural filesystem failure onto a stable code rather than a generic host error', async () => {
    const target = join(storageRoot, 'blocked');
    await writeFile(target, 'not a directory');

    // 在一个普通文件下面开子路径：内核报 ENOTDIR/EEXIST 一类的结构错误
    const response = await host.handle({ kind: 'file.writeBegin', sessionId, path: 'blocked/child.txt' });

    expect(response).toMatchObject({ kind: 'error' });
    expect(response).not.toMatchObject({ code: 'host_internal_error' });
  });
});
