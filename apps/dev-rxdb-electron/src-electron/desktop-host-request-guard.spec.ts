/**
 * @fileoverview AC#50：桌面 host 请求 kind 闭集守卫的行为门禁。
 *
 * @remarks
 * 三层校验（connector / preload / host）里，connector 的 capability × mutationPolicy 授权已在
 * `@aiao/rxdb-devtools` 的 conformance 关闭，host 的协议 / 会话归属 / 越界路径 / 脱敏已在
 * `packages/rxdb-adapter-electron` 关闭。本文件关的是**中间那一层**：kind 闭集闸在 host 分派
 * 之前就收口，且 preload 的内联副本不因 ELEC-15 的「必须内联」而与 guard 漂移。
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDesktopHostFileRequestKind } from '@aiao/rxdb-adapter-electron/host';
import { isDesktopPgliteRequestKind } from '@aiao/rxdb-adapter-electron/pglite-host';
import { createStorageRootResolver } from './desktop-file-bridge';
import { createDesktopHostBridge, type DesktopHostBridge } from './desktop-host-bridge';
import { createDatabasePathResolver } from './desktop-sqlite-bridge';
import {
  DESKTOP_HOST_REQUEST_KINDS,
  isKnownDesktopHostRequestKind,
  readDesktopHostRequestKind
} from './desktop-host-request-guard';

/** 文件族与 PGlite 族的 kind 数量；SQLite 族是 5。三者之和钉住闭集大小。 */
const FILE_KIND_COUNT = 15;
const PGLITE_KIND_COUNT = 9;
const SQLITE_KINDS = ['handshake', 'open', 'execute', 'version', 'close'] as const;

/** 一个同源脚本可能塞进来的任意文本——它绝不能出现在拒绝应答里（脱敏）。 */
const HOSTILE_KIND = '../../etc/passwd; DROP TABLE todos; secret=classified';

describe('desktop-host-request-guard', () => {
  it('接受三族全部请求 kind', () => {
    expect(DESKTOP_HOST_REQUEST_KINDS.size).toBe(FILE_KIND_COUNT + PGLITE_KIND_COUNT + SQLITE_KINDS.length);

    for (const kind of SQLITE_KINDS) {
      expect(isKnownDesktopHostRequestKind({ kind })).toBe(true);
    }
    expect(isKnownDesktopHostRequestKind({ kind: 'file.open' })).toBe(true);
    expect(isKnownDesktopHostRequestKind({ kind: 'file.writeCommit' })).toBe(true);
    expect(isKnownDesktopHostRequestKind({ kind: 'pg.handshake' })).toBe(true);
    expect(isKnownDesktopHostRequestKind({ kind: 'pg.close' })).toBe(true);
  });

  it('file / pg 子集与协议包的谓词逐字一致', () => {
    for (const kind of DESKTOP_HOST_REQUEST_KINDS) {
      if (kind.startsWith('file.')) expect(isDesktopHostFileRequestKind(kind), kind).toBe(true);
      if (kind.startsWith('pg.')) expect(isDesktopPgliteRequestKind(kind), kind).toBe(true);
    }
    // 闭集里不存在「看起来像 file/pg 却不在协议里」的越权 kind。
    expect(isDesktopHostFileRequestKind('file.nope')).toBe(false);
    expect(isDesktopPgliteRequestKind('pg.nope')).toBe(false);
  });

  it('拒绝未知 kind、非对象与非字符串 kind，且不回显攻击文本', () => {
    expect(isKnownDesktopHostRequestKind({ kind: 'file.nope' })).toBe(false);
    expect(isKnownDesktopHostRequestKind({ kind: HOSTILE_KIND })).toBe(false);
    expect(isKnownDesktopHostRequestKind({ kind: 'file.open', extra: 1 })).toBe(true);
    expect(isKnownDesktopHostRequestKind(null)).toBe(false);
    expect(isKnownDesktopHostRequestKind('file.open')).toBe(false);
    expect(isKnownDesktopHostRequestKind({ kind: 42 })).toBe(false);
    expect(isKnownDesktopHostRequestKind({})).toBe(false);
  });

  it('readDesktopHostRequestKind 只读 kind 字段，不碰其余载荷', () => {
    expect(readDesktopHostRequestKind({ kind: 'file.open', path: '../../x', sql: 'DROP' })).toBe('file.open');
    expect(readDesktopHostRequestKind(undefined)).toBeUndefined();
    expect(readDesktopHostRequestKind([])).toBeUndefined();
  });
});

describe('createDesktopHostBridge 的 kind 闸', () => {
  let workspace: string;
  let bridge: DesktopHostBridge;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'electron-host-guard-'));
    bridge = createDesktopHostBridge({
      resolveDatabasePath: createDatabasePathResolver(workspace),
      resolveStorageRoot: createStorageRootResolver(workspace),
      pgliteDataRoot: join(workspace, 'pglite'),
      // 不存在的入口是**故意**的：本块只验 kind 闸，不验 PGlite 行为。
      pgliteWorkerPath: join(workspace, 'no-such-pglite-worker.js')
    });
  });

  afterEach(async () => {
    await bridge.closeAll();
    await rmSync(workspace, { recursive: true, force: true });
  });

  it('未知 kind 在任何 host 被触碰之前就以 protocol_violation 收口', async () => {
    const target = { id: 1, isDestroyed: (): boolean => false, send: (): void => undefined };
    const response = await bridge.handle(target, { kind: 'file.nope' });
    expect(response).toMatchObject({ kind: 'error', code: 'protocol_violation' });
    // 脱敏：拒绝应答不含调用方塞进来的 kind 文本，也不含任何 SQL / 路径片段。
    expect(JSON.stringify(response)).not.toContain('file.nope');
    expect(bridge.openSessionCount).toBe(0);
  });

  it('非对象与缺 kind 的负载同样在分派前被拒，不落进 SQLite 兜底', async () => {
    const target = { id: 2, isDestroyed: (): boolean => false, send: (): void => undefined };
    for (const hostile of [null, 'file.open', {}, { kind: 42 }, { kind: HOSTILE_KIND }]) {
      const response = await bridge.handle(target, hostile);
      expect(response).toMatchObject({ kind: 'error', code: 'protocol_violation' });
      expect(JSON.stringify(response)).not.toContain('file.open');
    }
    expect(bridge.openSessionCount).toBe(0);
  });

  it('合法 kind 仍按族正常分派，闸不影响既有路径', async () => {
    const target = { id: 3, isDestroyed: (): boolean => false, send: (): void => undefined };
    expect(await bridge.handle(target, { kind: 'file.open' })).toMatchObject({ kind: 'file.open' });
    expect(await bridge.handle(target, { kind: 'pg.handshake' })).toMatchObject({ kind: 'error', code: 'host_unavailable' });
  });
});

describe('preload 内联 kind 闸与 guard 一致', () => {
  // preload.ts 不能值导入 guard（ELEC-15），因此它的闸是逐字内联的。这里把两份名单钉住：
  // 逐字读 preload 源码，确认闭集里每一个 kind 字面量都出现在内联副本里。改协议 kind 时，
  // 协议包 / guard / preload 三处必须同步，这条会红。
  const preloadSource = readFileSync(resolve(import.meta.dirname, 'preload.ts'), 'utf8');

  it('闭集里每个 kind 字面量都出现在 preload 内联副本中', () => {
    for (const kind of DESKTOP_HOST_REQUEST_KINDS) {
      expect(preloadSource, kind).toContain(`'${kind}'`);
    }
  });

  it('preload 不导入 guard 模块，确认其闸是内联而非值导入', () => {
    // 值导入（`import ... from './desktop-host-request-guard'`）会 emit 成
    // `require("./desktop-host-request-guard")`，打进 ASAR 后解析失败（ELEC-15）。
    // 注释里可以解释这个约束，但源码里绝不能出现对 guard 模块的导入。
    expect(preloadSource).not.toContain("from './desktop-host-request-guard'");
  });
});
