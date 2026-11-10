/**
 * @fileoverview 启动清扫与本轮写入的时序门禁。
 *
 * @remarks
 * 单独成文件是因为要替换 `node:fs/promises` 的 `readdir`：把清扫卡在某个子目录上，
 * 才能稳定构造「清扫还没走到这个目录，renderer 已经在里面开始写」的时序。
 * 替换只在设好暂停点时拦一次，其余调用原样转给真实实现，文件系统全程是真的。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFileBridge, createStorageRootResolver, DESKTOP_STORAGE_DIRECTORY } from './desktop-file-bridge';

interface ReaddirPause {
  readonly directory: string;
  readonly reached: () => void;
  readonly release: Promise<void>;
}

const control = vi.hoisted(() => ({ pause: undefined as ReaddirPause | undefined }));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readdir = (async (...args: Parameters<typeof actual.readdir>) => {
    const pause = control.pause;
    if (pause && String(args[0]) === pause.directory) {
      control.pause = undefined;
      pause.reached();
      await pause.release;
    }
    return actual.readdir(...args);
  }) as typeof actual.readdir;
  return { ...actual, readdir, default: { ...actual, readdir } };
});

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'electron-file-sweep-race-'));
});

afterEach(() => {
  control.pause = undefined;
  rmSync(workspace, { recursive: true, force: true });
});

describe('createDesktopFileBridge 启动清扫', () => {
  it('清扫尚未走到的目录里，本轮开始的写入照常提交', async () => {
    const root = join(workspace, DESKTOP_STORAGE_DIRECTORY);
    mkdirSync(join(root, 'late'), { recursive: true });

    let reached!: () => void;
    let release!: () => void;
    const sweepReachedLate = new Promise<void>(resolve => (reached = resolve));
    control.pause = {
      directory: join(root, 'late'),
      reached,
      release: new Promise<void>(resolve => (release = resolve))
    };

    const bridge = createDesktopFileBridge({ resolveStorageRoot: createStorageRootResolver(workspace) });
    const target = { isDestroyed: (): boolean => false };
    try {
      await sweepReachedLate;
      const open = await bridge.handle(target, { kind: 'file.open' });
      if (open.kind !== 'file.open') throw new Error(`open failed: ${JSON.stringify(open)}`);
      const { sessionId } = open.result;

      const beginning = bridge.handle(target, { kind: 'file.writeBegin', sessionId, path: 'late/normal.txt' });
      // 给 writeBegin 一个先落盘的机会：门禁缺失时它会抢在清扫之前建好临时文件。
      await new Promise(resolve => setTimeout(resolve, 20));
      release();
      await bridge.whenSwept;

      const begin = await beginning;
      if (begin.kind !== 'file.writeBegin') throw new Error(`writeBegin failed: ${JSON.stringify(begin)}`);
      const { writeId } = begin.result;
      await bridge.handle(target, {
        kind: 'file.writeChunk',
        sessionId,
        writeId,
        chunk: new TextEncoder().encode('payload')
      });

      expect(await bridge.handle(target, { kind: 'file.writeCommit', sessionId, writeId })).toEqual({
        kind: 'file.writeCommit'
      });
      expect(readFileSync(join(root, 'late', 'normal.txt'), 'utf8')).toBe('payload');
    } finally {
      release();
      await bridge.closeAll();
    }
  });
});
