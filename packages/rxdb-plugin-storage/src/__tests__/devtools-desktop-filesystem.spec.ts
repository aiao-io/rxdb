// @vitest-environment node
import { type DesktopHostTransport } from '@aiao/rxdb-adapter-electron';
import { createElectronFileHost, type ElectronFileHost } from '@aiao/rxdb-adapter-electron/host';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDevToolsDesktopFilesystem, type DevToolsDesktopFilesystem } from '../devtools-desktop-filesystem.js';

let workspace: string;
let host: ElectronFileHost;
let filesystem: DevToolsDesktopFilesystem;

/** 直连 host 的传输层：把 renderer 侧文件系统接到真实文件 host 上，而不是断言 mock 上。 */
const createDirectTransport = (target: ElectronFileHost): DesktopHostTransport => ({
  request: payload => target.handle(payload),
  subscribe: () => () => undefined
});

const bytes = (content: string): Uint8Array => new TextEncoder().encode(content);

async function write(segments: readonly string[], content: string): Promise<void> {
  const sink = await filesystem.openWrite(segments);
  await sink.write(bytes(content));
  await sink.commit();
}

/** 逐块读完一个字节源，断言「读出的字节与源一致」。 */
async function drain(source: { totalBytes: number; read(offset: number, length: number): Promise<Uint8Array> }) {
  const out = new Uint8Array(source.totalBytes);
  let offset = 0;
  while (offset < source.totalBytes) {
    const chunk = await source.read(offset, Math.min(64, source.totalBytes - offset));
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'rxdb-devtools-fs-'));
  host = createElectronFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
  filesystem = createDevToolsDesktopFilesystem({ rootDir: 'files', transport: createDirectTransport(host) });
});

afterEach(async () => {
  filesystem.dispose();
  await rm(workspace, { recursive: true, force: true });
});

describe('createDevToolsDesktopFilesystem — 列表与元信息', () => {
  it('列出插件专用根（空段序列）', async () => {
    await write(['top.txt'], 'top');

    const entries = await filesystem.list([]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'top.txt', kind: 'file', size: 3 });
  });

  it('只列一层，不返回子树', async () => {
    await write(['db', 'main.sqlite'], 'main');
    await write(['db', 'backups', 'a.sqlite'], 'a');

    const names = (await filesystem.list(['db'])).map(entry => `${entry.kind}:${entry.name}`);

    expect(names).toEqual(['directory:backups', 'file:main.sqlite']);
  });

  it('stat 返回大小与类型；目标不存在时为 undefined', async () => {
    await write(['a.bin'], 'hello world');

    await expect(filesystem.stat(['a.bin'])).resolves.toMatchObject({ kind: 'file', size: 11 });
    await expect(filesystem.stat(['missing'])).resolves.toBeUndefined();
  });
});

describe('createDevToolsDesktopFilesystem — 写与读', () => {
  it('commit 落盘字节与写入一致', async () => {
    await write(['db', 'in.bin'], 'hello');

    await expect(filesystem.stat(['db', 'in.bin'])).resolves.toMatchObject({ kind: 'file', size: 5 });
    const source = await filesystem.openRead(['db', 'in.bin']);
    expect(source.totalBytes).toBe(5);
    expect(await drain(source)).toEqual(bytes('hello'));
    await source.close();
  });

  it('discard 不留半写文件', async () => {
    const sink = await filesystem.openWrite(['db', 'in.bin']);
    await sink.write(bytes('partial'));
    await sink.discard();

    await expect(filesystem.stat(['db', 'in.bin'])).resolves.toBeUndefined();
  });

  it('零字节文件可以 commit 并读回空内容', async () => {
    await write(['empty.bin'], '');

    await expect(filesystem.stat(['empty.bin'])).resolves.toMatchObject({ kind: 'file', size: 0 });
    const source = await filesystem.openRead(['empty.bin']);
    expect(source.totalBytes).toBe(0);
    await source.close();
  });
});

describe('createDevToolsDesktopFilesystem — 目录与删除', () => {
  it('createDirectory 建目录，stat 可见', async () => {
    await filesystem.createDirectory(['db', 'backups']);

    await expect(filesystem.stat(['db', 'backups'])).resolves.toMatchObject({ kind: 'directory' });
  });

  it('remove 按类型删除文件或递归删除目录', async () => {
    await write(['db', 'main.sqlite'], 'main');
    await write(['db', 'backups', 'a.sqlite'], 'a');

    await filesystem.remove(['db', 'main.sqlite']);
    await expect(filesystem.stat(['db', 'main.sqlite'])).resolves.toBeUndefined();

    await filesystem.remove(['db', 'backups']);
    await expect(filesystem.stat(['db', 'backups'])).resolves.toBeUndefined();
  });
});

describe('createDevToolsDesktopFilesystem — 会话与错误', () => {
  it('读一个不存在的文件抛出的错误带 Node errno', async () => {
    await expect(filesystem.openRead(['nope'])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('dispose 关闭 host 会话', async () => {
    await write(['a.txt'], 'a');
    expect(host.openSessionCount).toBeGreaterThan(0);

    filesystem.dispose();
    // 会话关闭是异步的；让出一次宏任务等它落地。
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.openSessionCount).toBe(0);
  });
});
