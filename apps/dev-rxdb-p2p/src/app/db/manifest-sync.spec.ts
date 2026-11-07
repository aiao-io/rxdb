import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManifestSync, REMOTE_EVENT_TYPES, type ManifestSyncTarget, type RemoteEntityEvent } from './manifest-sync';

class FakeTarget implements ManifestSyncTarget {
  #release: (() => void) | null = null;
  readonly calls: string[] = [];
  readonly listeners = new Map<string, Set<(event: RemoteEntityEvent) => void>>();
  failNext: Error | null = null;
  hold = false;

  pull = vi.fn(() => this.#run('pull'));
  push = vi.fn(() => this.#run('push'));

  addEventListener(type: string, listener: (event: RemoteEntityEvent) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener));
  }

  removeEventListener(type: string, listener: (event: RemoteEntityEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, namespace: string, entity: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ entities: [{ namespace, entity }] });
  }

  release(): void {
    this.#release?.();
  }

  async #run(kind: string): Promise<void> {
    this.calls.push(`${kind}:start`);
    if (this.hold) await new Promise<void>(resolve => (this.#release = resolve));
    const failure = this.failNext;
    this.failNext = null;
    if (failure) throw failure;
    this.calls.push(`${kind}:end`);
  }
}

describe('ManifestSync', () => {
  let target: FakeTarget;
  let sync: ManifestSync;

  beforeEach(() => {
    vi.useFakeTimers();
    target = new FakeTarget();
    sync = new ManifestSync(target, { intervalMs: 10_000, debounceMs: 50, now: () => 1234 });
  });

  afterEach(() => {
    sync.stop();
    vi.useRealTimers();
  });

  it('pulls once when started and records the time', async () => {
    sync.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(target.pull).toHaveBeenCalledTimes(1);
    expect(sync.status$.value).toEqual({ phase: 'idle', error: null, lastSyncedAt: 1234 });
  });

  it('pulls soon after a remote change to the manifest, but not for other entities', async () => {
    sync.start();
    await vi.advanceTimersByTimeAsync(0);

    target.emit(REMOTE_EVENT_TYPES[0], 'public', 'Todo');
    await vi.advanceTimersByTimeAsync(60);
    expect(target.pull).toHaveBeenCalledTimes(1);

    target.emit(REMOTE_EVENT_TYPES[1], 'p2p', 'P2PFileManifest');
    target.emit(REMOTE_EVENT_TYPES[2], 'p2p', 'P2PFileManifest');
    await vi.advanceTimersByTimeAsync(60);
    expect(target.pull).toHaveBeenCalledTimes(2);
  });

  it('polls on an interval in case a realtime notice is missed', async () => {
    sync.start();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(target.pull).toHaveBeenCalledTimes(2);
  });

  it('runs a push only after the pull in flight has finished', async () => {
    target.hold = true;
    sync.start();
    await vi.advanceTimersByTimeAsync(0);

    const pushed = sync.push();
    await vi.advanceTimersByTimeAsync(0);
    expect(target.calls).toEqual(['pull:start']);

    target.release();
    await vi.advanceTimersByTimeAsync(0);
    target.release();
    await pushed;

    expect(target.calls).toEqual(['pull:start', 'pull:end', 'push:start', 'push:end']);
  });

  it('shows a failed sync until the next one succeeds', async () => {
    target.failNext = new Error('JWT expired');
    sync.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sync.status$.value).toEqual({ phase: 'error', error: 'JWT expired', lastSyncedAt: null });

    await sync.push();
    expect(sync.status$.value).toEqual({ phase: 'idle', error: null, lastSyncedAt: 1234 });
  });

  it('stops listening and polling', async () => {
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    sync.stop();

    target.emit(REMOTE_EVENT_TYPES[0], 'p2p', 'P2PFileManifest');
    await vi.advanceTimersByTimeAsync(20_000);

    expect(target.pull).toHaveBeenCalledTimes(1);
  });
});
