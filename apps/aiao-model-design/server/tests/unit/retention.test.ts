import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RetentionStore } from '../../src/gateway/core/retention';

let rootDir: string;
let store: RetentionStore;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'retention-test-'));
  store = new RetentionStore({ rootDir, ttlMs: 1_000, sweepIntervalMs: 60_000 });
});

afterEach(() => {
  store.stopInterval();
  rmSync(rootDir, { recursive: true, force: true });
});

describe('RetentionStore.register', () => {
  it('writes Buffer to disk with 0600 mode at <rootDir>/<traceId>.<ext>', async () => {
    const traceId = '11111111-2222-3333-4444-555555555555';
    const path = await store.register(traceId, 'wav', Buffer.from('hello'));
    expect(path).toBe(join(rootDir, `${traceId}.wav`));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, 'utf-8')).toBe('hello');
  });

  it('writes Web ReadableStream payload', async () => {
    const traceId = 'aaaa-bbbb';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('streamed'));
        controller.close();
      }
    });
    const path = await store.register(traceId, 'mp3', stream);
    expect(readFileSync(path, 'utf-8')).toBe('streamed');
  });

  it('rejects traceId containing path separator', async () => {
    await expect(store.register('../etc/passwd', 'txt', Buffer.from('x'))).rejects.toThrow(/invalid traceId/);
  });

  it('rejects ext containing path separator or dot', async () => {
    await expect(store.register('safe-id', '../oops', Buffer.from('x'))).rejects.toThrow(/invalid ext/);
  });

  it('rejects traceId with whitespace', async () => {
    await expect(store.register('a b c', 'wav', Buffer.from('x'))).rejects.toThrow(/invalid traceId/);
  });
});

describe('RetentionStore sweep', () => {
  it('removes files older than ttl', async () => {
    const traceId = 'old-file';
    const path = await store.register(traceId, 'tmp', Buffer.from('aged'));
    const oldTime = Date.now() / 1000 - 60;
    utimesSync(path, oldTime, oldTime);
    const removed = await store.tick();
    expect(removed).toBe(1);
    expect(readdirSync(rootDir)).not.toContain('old-file.tmp');
  });

  it('keeps fresh files under ttl', async () => {
    await store.register('fresh', 'tmp', Buffer.from('fresh'));
    const removed = await store.tick();
    expect(removed).toBe(0);
    expect(readdirSync(rootDir)).toContain('fresh.tmp');
  });

  it('startupSweep is equivalent to tick (same logic)', async () => {
    const path = await store.register('boot', 'tmp', Buffer.from('boot'));
    const oldTime = Date.now() / 1000 - 60;
    utimesSync(path, oldTime, oldTime);
    const removed = await store.startupSweep();
    expect(removed).toBe(1);
  });
});
