/**
 * @fileoverview US-504：主进程侧文件 host 接线的行为门禁。
 *
 * @remarks
 * 与 `desktop-sqlite-bridge.spec.ts` 同源的做法——窗口收窄成一个两方法接口，
 * 于是整条会话生命周期能用真实文件系统驱动，不必启动 Electron。
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopFileBridge,
  createStorageRootResolver,
  DESKTOP_STORAGE_DIRECTORY,
  type DesktopFileBridge
} from './desktop-file-bridge';
import { createDesktopHostBridge, type DesktopHostBridge } from './desktop-host-bridge';
import { DESKTOP_DATABASE_DIRECTORY } from './desktop-sqlite-bridge';

/** 窗口替身：只要 `isDestroyed`/`send` 两个方法，与真实 `WebContents` 结构相容。 */
const createTarget = (): { isDestroyed(): boolean; send(): void } => ({
  isDestroyed: () => false,
  send: () => undefined
});

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'electron-file-bridge-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('createStorageRootResolver', () => {
  it('把文件根解析到应用数据目录下的专属子目录', () => {
    const resolve = createStorageRootResolver(workspace);
    expect(resolve()).toBe(join(workspace, DESKTOP_STORAGE_DIRECTORY));
  });

  it('按需创建根目录', () => {
    const resolve = createStorageRootResolver(workspace);
    expect(existsSync(join(workspace, DESKTOP_STORAGE_DIRECTORY))).toBe(false);
    resolve();
    expect(existsSync(join(workspace, DESKTOP_STORAGE_DIRECTORY))).toBe(true);
  });

  // 「不与 Chromium 自用目录重名」「与库目录分开」两条断言在
  // desktop-sqlite-bridge.spec.ts 里一处维护、两个目录名一起过 ——
  // 名单抄两份，改一份就是另一份悄悄失效。
});

describe('createDesktopFileBridge', () => {
  let bridge: DesktopFileBridge;

  beforeEach(() => {
    bridge = createDesktopFileBridge({ resolveStorageRoot: createStorageRootResolver(workspace) });
  });

  afterEach(() => {
    bridge.closeAll();
  });

  const openSession = async (target: ReturnType<typeof createTarget>): Promise<string> => {
    const response = await bridge.handle(target, { kind: 'file.open' });
    if (response.kind !== 'file.open') throw new Error(`open failed: ${JSON.stringify(response)}`);
    return response.result.sessionId;
  };

  it('文件写入落在应用数据目录里，而不是 Chromium profile 里', async () => {
    const target = createTarget();
    const sessionId = await openSession(target);
    await bridge.handle(target, { kind: 'file.mkdir', sessionId, path: 'notes' });

    const begin = await bridge.handle(target, { kind: 'file.writeBegin', sessionId, path: 'notes/a.txt' });
    if (begin.kind !== 'file.writeBegin') throw new Error('writeBegin failed');
    await bridge.handle(target, {
      kind: 'file.writeChunk',
      sessionId,
      writeId: begin.result.writeId,
      chunk: new TextEncoder().encode('hello')
    });
    expect(await bridge.handle(target, { kind: 'file.writeCommit', sessionId, writeId: begin.result.writeId })).toEqual({
      kind: 'file.writeCommit'
    });

    const physical = join(workspace, DESKTOP_STORAGE_DIRECTORY, 'notes', 'a.txt');
    expect(readFileSync(physical, 'utf8')).toBe('hello');
  });

  it('永不 reject：非法负载以 error 应答返回', async () => {
    const response = await bridge.handle(createTarget(), { kind: 'file.nope' });
    expect(response).toMatchObject({ kind: 'error', code: 'protocol_violation' });
  });

  it('窗口销毁时回收该窗口名下的会话', async () => {
    const alive = createTarget();
    const doomed = createTarget();
    await openSession(alive);
    await openSession(doomed);
    expect(bridge.openSessionCount).toBe(2);

    // 释放是即发即忘的（调用点是 'destroyed' 事件，不接受异步收尾），因此等它落地再断言。
    expect(bridge.releaseTarget(doomed)).toBe(1);
    await vi.waitFor(() => expect(bridge.openSessionCount).toBe(1));
    // 再释放一次不该重复计数，也不该动到别的窗口。
    expect(bridge.releaseTarget(doomed)).toBe(0);
    expect(bridge.openSessionCount).toBe(1);
  });

  // AC#5：窗口在传输途中消失，临时文件必须跟着走，否则每次崩溃都在磁盘上留一份垃圾。
  it('窗口销毁时中止未提交的写入，不留临时文件', async () => {
    const target = createTarget();
    const sessionId = await openSession(target);
    const begin = await bridge.handle(target, { kind: 'file.writeBegin', sessionId, path: 'pending.bin' });
    if (begin.kind !== 'file.writeBegin') throw new Error('writeBegin failed');
    await bridge.handle(target, {
      kind: 'file.writeChunk',
      sessionId,
      writeId: begin.result.writeId,
      chunk: new Uint8Array([1, 2, 3])
    });

    bridge.releaseTarget(target);

    await vi.waitFor(() => expect(readdirSync(join(workspace, DESKTOP_STORAGE_DIRECTORY))).toEqual([]));
  });

  it('会话正常关闭后窗口释放不再计数', async () => {
    const target = createTarget();
    const sessionId = await openSession(target);
    expect(await bridge.handle(target, { kind: 'file.close', sessionId })).toEqual({ kind: 'file.close' });
    expect(bridge.releaseTarget(target)).toBe(0);
    expect(bridge.openSessionCount).toBe(0);
  });
});

describe('createDesktopHostBridge', () => {
  let bridge: DesktopHostBridge;

  beforeEach(() => {
    bridge = createDesktopHostBridge({
      resolveDatabasePath: name => join(workspace, DESKTOP_DATABASE_DIRECTORY, name),
      resolveStorageRoot: createStorageRootResolver(workspace)
    });
  });

  afterEach(() => {
    bridge.closeAll();
  });

  it('file.* 请求交给文件 host', async () => {
    const response = await bridge.handle(createTarget(), { kind: 'file.open' });
    expect(response).toMatchObject({ kind: 'file.open' });
  });

  // 分派若漏了 file.*，请求会掉进 SQLite host —— 那里把「不是 open/close/version 的」
  // 一律当 execute 处理，于是一条文件请求会被当成 SQL 跑一遍。
  //
  // 反向也要能分辨：`version` 只有 SQLite host 认，会话不存在时它答 `session_closed`；
  // 若被错分给文件 host，`kind` 不在它的集合里，答的会是 `protocol_violation`。
  // sessionId 必须是形状合法的 UUID，否则两边都在协议校验阶段就挂了，断言什么也证明不了。
  it('非 file.* 请求交给 SQLite host', async () => {
    const response = await bridge.handle(createTarget(), {
      kind: 'version',
      sessionId: '00000000-0000-4000-8000-000000000000'
    });
    expect(response).toMatchObject({ kind: 'error', code: 'session_closed' });
  });

  it('窗口销毁时两族会话一起回收', async () => {
    const target = createTarget();
    const file = await bridge.handle(target, { kind: 'file.open' });
    const sqlite = await bridge.handle(target, {
      kind: 'open',
      storage: { engine: 'sqlite', databaseName: 'demo.sqlite3' }
    });
    expect(file.kind).toBe('file.open');
    expect(sqlite.kind).toBe('open');
    expect(bridge.openSessionCount).toBe(2);

    expect(bridge.releaseTarget(target)).toBe(2);
    await vi.waitFor(() => expect(bridge.openSessionCount).toBe(0));
  });
});
