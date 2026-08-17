// @vitest-environment node
import { DESKTOP_ADAPTER_NAME, type DesktopHostTransport } from '@aiao/rxdb-adapter-desktop';
import { createElectronFileHost, type ElectronFileHost } from '@aiao/rxdb-adapter-desktop/host';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopStorageFilesystem } from '../desktop.js';
import type { StorageFilesystem, StorageFilesystemContext } from '../filesystem/storage-filesystem.js';
import { isStorageNotFoundError } from '../filesystem/storage-filesystem.js';

const CONTEXT: StorageFilesystemContext = { localAdapterName: DESKTOP_ADAPTER_NAME };

let workspace: string;
let host: ElectronFileHost;
let transport: DesktopHostTransport;
let filesystem: StorageFilesystem;

/** 直连 host 的传输层：把 renderer 侧后端接到真实文件系统上，而不是接到断言 mock 上。 */
const createDirectTransport = (target: ElectronFileHost): DesktopHostTransport => ({
  request: payload => target.handle(payload),
  subscribe: () => () => undefined
});

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
};

const writeFileThrough = async (path: string, content: string): Promise<void> => {
  const writer = await filesystem.openWrite(path);
  await writer.write(new TextEncoder().encode(content));
  await writer.close();
};

/** 捕获同步抛出的错误对象本身；`toThrow` 只能比对消息文本，断言不到 `code`。 */
const captureError = (fn: () => unknown): unknown => {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
};

const collectFrom = async (backend: StorageFilesystem, directoryPath: string): Promise<string[]> => {
  const names: string[] = [];
  for await (const entry of backend.list(directoryPath)) names.push(`${entry.kind}:${entry.name}`);
  return names.sort();
};

const collect = (directoryPath: string): Promise<string[]> => collectFrom(filesystem, directoryPath);

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'rxdb-desktop-fs-'));
  host = createElectronFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
  transport = createDirectTransport(host);
  filesystem = createDesktopStorageFilesystem({ transport })('files', CONTEXT);
});

afterEach(async () => {
  filesystem.dispose();
  host.closeAll();
  await rm(workspace, { recursive: true, force: true });
});

describe('createDesktopStorageFilesystem', () => {
  describe('启用前校验', () => {
    it('本地适配器不是桌面适配器时拒绝启用（AC#9）', () => {
      // 静默接受会让 metadata 落在浏览器存储、文件落在原生目录 —— 正是 US-504 要消灭的两个备份域。
      const error = captureError(() =>
        createDesktopStorageFilesystem({ transport })('files', { localAdapterName: 'wa-sqlite' })
      );

      expect(error).toMatchObject({ code: 'adapter_mismatch' });
    });

    it('未配置本地适配器时同样拒绝启用', () => {
      const error = captureError(() =>
        createDesktopStorageFilesystem({ transport })('files', { localAdapterName: undefined })
      );

      expect(error).toMatchObject({ code: 'adapter_mismatch' });
    });
  });

  describe('目录与文件', () => {
    it('ensureRoot 在存储根下建出根目录', async () => {
      await filesystem.ensureRoot();
      await expect(readdir(join(workspace, 'rxdb-files'))).resolves.toEqual(['files']);
    });

    it('写入的内容以原生文件落在存储根下', async () => {
      await filesystem.ensureRoot();
      await writeFileThrough('docs/note.txt', 'hello');

      await expect(readFile(join(workspace, 'rxdb-files', 'files', 'docs', 'note.txt'), 'utf8')).resolves.toBe('hello');
    });

    it('读回的字节与写入一致', async () => {
      await filesystem.ensureRoot();
      await writeFileThrough('a.txt', 'hello');

      await expect((await filesystem.readBlob('a.txt')).text()).resolves.toBe('hello');
      expect(new TextDecoder().decode(await readAll(await filesystem.openRead('a.txt')))).toBe('hello');
    });

    it('分帧写入超过单帧上限的内容', async () => {
      await filesystem.ensureRoot();
      const payload = new Uint8Array(9 * 1024 * 1024);
      payload.fill(7);

      const writer = await filesystem.openWrite('big.bin');
      await writer.write(payload);
      await writer.close();

      const stored = await readFile(join(workspace, 'rxdb-files', 'files', 'big.bin'));
      expect(stored.byteLength).toBe(payload.byteLength);
      expect(stored.every(byte => byte === 7)).toBe(true);
    });

    it('分帧读取超过单帧上限的内容', async () => {
      await filesystem.ensureRoot();
      const payload = new Uint8Array(9 * 1024 * 1024);
      payload.fill(3);
      const writer = await filesystem.openWrite('big.bin');
      await writer.write(payload);
      await writer.close();

      const readBack = await readAll(await filesystem.openRead('big.bin'));
      expect(readBack.byteLength).toBe(payload.byteLength);
      expect(readBack.every(byte => byte === 3)).toBe(true);
    });

    it('接受 Blob 分片', async () => {
      await filesystem.ensureRoot();
      const writer = await filesystem.openWrite('blob.txt');
      await writer.write(new Blob(['abc']));
      await writer.write(new Blob(['def']));
      await writer.close();

      await expect((await filesystem.readBlob('blob.txt')).text()).resolves.toBe('abcdef');
    });

    it('abort 后目标保持写入前的内容', async () => {
      await filesystem.ensureRoot();
      await writeFileThrough('a.txt', 'old');

      const writer = await filesystem.openWrite('a.txt');
      await writer.write(new TextEncoder().encode('new'));
      await writer.abort(new Error('boom'));

      await expect((await filesystem.readBlob('a.txt')).text()).resolves.toBe('old');
    });

    it('abort 不抛出，即使 host 已经不认这个写入令牌', async () => {
      await filesystem.ensureRoot();
      const writer = await filesystem.openWrite('a.txt');
      await writer.close();

      // abort 只在错误处理路径上被调用，二次抛错会盖住真正的失败原因。
      await expect(writer.abort(new Error('boom'))).resolves.toBeUndefined();
    });

    it('list 返回条目与类型', async () => {
      await filesystem.ensureRoot();
      await filesystem.ensureDirectory('/docs/nested');
      await writeFileThrough('docs/a.txt', 'a');

      await expect(collect('/docs')).resolves.toEqual(['directory:nested', 'file:a.txt']);
    });

    it('exists 系列如实反映存在性', async () => {
      await filesystem.ensureRoot();
      await filesystem.ensureDirectory('/docs');
      await writeFileThrough('docs/a.txt', 'a');

      await expect(filesystem.directoryExists('/docs')).resolves.toBe(true);
      await expect(filesystem.directoryExists('/missing')).resolves.toBe(false);
      await expect(filesystem.fileExists('docs/a.txt')).resolves.toBe(true);
      await expect(filesystem.fileExists('docs/missing.txt')).resolves.toBe(false);
      // 目录不是文件：类型不符必须报「不存在」，否则上层会把目录当文件去读。
      await expect(filesystem.fileExists('docs')).resolves.toBe(false);
    });

    it('删除不存在的目标静默成功', async () => {
      await filesystem.ensureRoot();
      await expect(filesystem.removeFile('missing.txt')).resolves.toBeUndefined();
      await expect(filesystem.removeDirectory('/missing')).resolves.toBeUndefined();
    });

    it('removeDirectory 递归删除', async () => {
      await filesystem.ensureRoot();
      await writeFileThrough('docs/nested/a.txt', 'a');

      await filesystem.removeDirectory('/docs');

      await expect(filesystem.directoryExists('/docs')).resolves.toBe(false);
    });

    it('移动文件与目录', async () => {
      await filesystem.ensureRoot();
      await writeFileThrough('docs/a.txt', 'a');

      await expect(filesystem.supportsFileMove('docs/a.txt')).resolves.toBe(true);
      await filesystem.moveFile('docs/a.txt', 'archive/b.txt');
      await expect((await filesystem.readBlob('archive/b.txt')).text()).resolves.toBe('a');

      await expect(filesystem.supportsDirectoryMove('/archive')).resolves.toBe(true);
      await filesystem.moveDirectory('/archive', '/backup');
      await expect((await filesystem.readBlob('backup/b.txt')).text()).resolves.toBe('a');
    });
  });

  describe('错误语义', () => {
    it('读不存在的文件抛 NotFoundError（服务层的补偿分支依赖它）', async () => {
      await filesystem.ensureRoot();

      await expect(filesystem.readBlob('missing.txt')).rejects.toSatisfy(isStorageNotFoundError);
      await expect(filesystem.openRead('missing.txt')).rejects.toSatisfy(isStorageNotFoundError);
      await expect(filesystem.supportsFileMove('missing.txt')).rejects.toSatisfy(isStorageNotFoundError);
      await expect(filesystem.supportsDirectoryMove('/missing')).rejects.toSatisfy(isStorageNotFoundError);
    });

    it('host 报权限失败时抛带稳定 code 的后端错误，不降级', async () => {
      const failing: DesktopHostTransport = {
        request: async () => ({ kind: 'error', code: 'permission_denied', message: 'denied' }),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: failing })('files', CONTEXT);

      await expect(backend.ensureRoot()).rejects.toMatchObject({ code: 'permission_denied' });
    });

    it('host 报磁盘满时透出 disk_full 与原始描述', async () => {
      const failing: DesktopHostTransport = {
        request: async () => ({ kind: 'error', code: 'disk_full', message: 'ENOSPC on volume' }),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: failing })('files', CONTEXT);

      await expect(backend.ensureRoot()).rejects.toMatchObject({
        code: 'disk_full',
        detail: expect.objectContaining({ code: 'disk_full', message: 'ENOSPC on volume' })
      });
    });

    it('应答形状不合协议时抛后端错误，而不是把半个应答当成功', async () => {
      const broken: DesktopHostTransport = {
        request: async () => ({ kind: 'file.stat' }),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: broken })('files', CONTEXT);

      await expect(backend.fileExists('a.txt')).rejects.toMatchObject({ code: 'backend_internal_error' });
    });

    it('目录条目缺少名称时抛后端错误，而不是把 undefined 当成文件名', async () => {
      const broken: DesktopHostTransport = {
        request: async payload =>
          payload.kind === 'file.list' ? { kind: 'file.list', result: [{ kind: 'file' }] } : host.handle(payload),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: broken })('files', CONTEXT);

      await expect(collectFrom(backend, '/')).rejects.toMatchObject({ code: 'backend_internal_error' });
      backend.dispose();
    });

    it('host 反复返回空的非结束帧时以后端错误收场，而不是原地空转', async () => {
      // 读循环靠「非 eof 帧必然推进」终止；不校验这条不变量，坏 host 会让调用方永久挂起。
      const stalled: DesktopHostTransport = {
        request: async payload =>
          payload.kind === 'file.read' ?
            { kind: 'file.read', result: { chunk: new Uint8Array(0), eof: false } }
          : host.handle(payload),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: stalled })('files', CONTEXT);
      await backend.ensureRoot();

      await expect(backend.readBlob('a.txt')).rejects.toMatchObject({ code: 'backend_internal_error' });
      await expect(backend.openRead('a.txt')).rejects.toMatchObject({ code: 'backend_internal_error' });
      backend.dispose();
    });

    it('host 协议版本不一致时拒绝连接，不静默降级', async () => {
      const mismatched: DesktopHostTransport = {
        request: async () => ({ kind: 'file.open', result: { sessionId: crypto.randomUUID(), protocolVersion: 99 } }),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: mismatched })('files', CONTEXT);

      await expect(backend.ensureRoot()).rejects.toMatchObject({ code: 'backend_unavailable' });
    });
  });

  describe('物理名编码', () => {
    it('把原生文件系统不接受的字符编码后落盘，并原样解码回来', async () => {
      await filesystem.ensureRoot();
      const logicalName = 'a:b?c*d.txt';

      await writeFileThrough(logicalName, 'x');

      const physical = await readdir(join(workspace, 'rxdb-files', 'files'));
      expect(physical).toEqual(['a%3Ab%3Fc%2Ad.txt']);
      await expect(collect('/')).resolves.toEqual([`file:${logicalName}`]);
      await expect((await filesystem.readBlob(logicalName)).text()).resolves.toBe('x');
    });

    it('Windows 保留名同样可用', async () => {
      await filesystem.ensureRoot();

      await writeFileThrough('CON.txt', 'x');

      await expect(readdir(join(workspace, 'rxdb-files', 'files'))).resolves.toEqual(['%43ON.txt']);
      await expect(collect('/')).resolves.toEqual(['file:CON.txt']);
    });

    it('编码后超长的名字以稳定错误码拒绝，不做哈希截断', async () => {
      await filesystem.ensureRoot();

      // 截断不可逆，会打断 listEntries / copyDirectory 的「物理名回推逻辑名」。
      await expect(filesystem.openWrite(`${'%'.repeat(128)}.txt`)).rejects.toMatchObject({ code: 'name_too_long' });
    });
  });

  describe('跨上下文锁（AC#7）', () => {
    it('提供 host 仲裁的锁实现', () => {
      expect(filesystem.lockBackend).toBeDefined();
    });

    it('同名独占锁在两个后端实例之间串行执行', async () => {
      const other = createDesktopStorageFilesystem({ transport })('files', CONTEXT);
      const order: string[] = [];
      const first = filesystem.lockBackend?.request('same', async () => {
        order.push('first:enter');
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push('first:exit');
      });
      const second = other.lockBackend?.request('same', async () => {
        order.push('second:enter');
      });

      await Promise.all([first, second]);
      other.dispose();

      expect(order).toEqual(['first:enter', 'first:exit', 'second:enter']);
    });

    it('共享锁之间不互斥', async () => {
      const other = createDesktopStorageFilesystem({ transport })('files', CONTEXT);
      let concurrent = 0;
      let peak = 0;
      const enter = async (): Promise<void> => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrent -= 1;
      };

      await Promise.all([
        filesystem.lockBackend?.request('gate', { mode: 'shared' }, enter),
        other.lockBackend?.request('gate', { mode: 'shared' }, enter)
      ]);
      other.dispose();

      expect(peak).toBe(2);
    });

    it('临界区抛错也会释放锁', async () => {
      await expect(filesystem.lockBackend?.request('same', () => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom'
      );

      await expect(filesystem.lockBackend?.request('same', async () => 'ok')).resolves.toBe('ok');
    });

    it('释放锁失败不会盖住临界区的原始错误', async () => {
      // 调用方要修的是临界区里那个错误；把它换成 lockRelease 的失败等于把线索抹掉。
      const flaky: DesktopHostTransport = {
        request: async payload =>
          payload.kind === 'file.lockRelease' ?
            { kind: 'error', code: 'host_internal_error', message: 'release failed' }
          : host.handle(payload),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: flaky })('files', CONTEXT);

      await expect(backend.lockBackend?.request('same', () => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom'
      );
      backend.dispose();
    });

    it('临界区成功而释放锁失败时仍然报错，不假装一切正常', async () => {
      // 释放失败意味着锁还挂在 host 上，后续临界区会永久阻塞——这条必须让调用方看见。
      const flaky: DesktopHostTransport = {
        request: async payload =>
          payload.kind === 'file.lockRelease' ?
            { kind: 'error', code: 'host_internal_error', message: 'release failed' }
          : host.handle(payload),
        subscribe: () => () => undefined
      };
      const backend = createDesktopStorageFilesystem({ transport: flaky })('files', CONTEXT);

      await expect(backend.lockBackend?.request('same', async () => 'ok')).rejects.toMatchObject({
        code: 'backend_internal_error'
      });
      backend.dispose();
    });

    it('拒绝不支持的锁选项，而不是静默忽略', async () => {
      // 忽略 ifAvailable 会把「拿不到就立刻返回」变成无限期等待，调用方看不出差别。
      await expect(
        filesystem.lockBackend?.request('same', { ifAvailable: true }, async () => 'ok')
      ).rejects.toMatchObject({ code: 'backend_unavailable' });
    });
  });

  describe('生命周期', () => {
    it('dispose 关闭 host 会话', async () => {
      await filesystem.ensureRoot();
      expect(host.openSessionCount).toBe(1);

      filesystem.dispose();
      await vi.waitFor(() => expect(host.openSessionCount).toBe(0));
    });

    it('dispose 后再次使用会重新开会话', async () => {
      await filesystem.ensureRoot();
      filesystem.dispose();

      await expect(filesystem.ensureRoot()).resolves.toBeUndefined();
    });

    it('并发的首次调用只开一个会话', async () => {
      await Promise.all([filesystem.ensureRoot(), filesystem.ensureRoot(), filesystem.ensureRoot()]);

      expect(host.openSessionCount).toBe(1);
    });
  });
});
