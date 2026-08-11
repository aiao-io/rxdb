import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderElection } from '../../@browser/leader-election.js';

describe('LeaderElection', () => {
  let mockLockRequest: ReturnType<typeof vi.fn>;
  let originalLocks: LockManager | undefined;

  beforeEach(() => {
    originalLocks = navigator.locks;
    mockLockRequest = vi.fn((name: string, callback: () => Promise<void>) => callback());
    Object.defineProperty(navigator, 'locks', {
      writable: true,
      configurable: true,
      value: { request: mockLockRequest }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'locks', {
      writable: true,
      configurable: true,
      value: originalLocks
    });
  });

  it('does not require a Window lifecycle target', () => {
    vi.stubGlobal('addEventListener', undefined);
    vi.stubGlobal('removeEventListener', undefined);
    const leader = new LeaderElection('worker');
    expect(() => leader.dispose()).not.toThrow();
  });

  it('throws clearly when neither Web Locks nor BroadcastChannel is available', () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    vi.stubGlobal('BroadcastChannel', undefined);
    const leader = new LeaderElection('unsupported');
    expect(() => leader.elect(() => undefined)).toThrow(
      'LeaderElection requires Web Locks or BroadcastChannel support'
    );
    leader.dispose();
  });

  it('should become leader when lock is acquired', () =>
    new Promise<void>(done => {
      const leader = new LeaderElection('test');

      leader.elect(isLeader => {
        expect(isLeader).toBe(true);
        expect(leader.isLeader).toBe(true);
        leader.dispose();
        done();
      });
    }));

  it('should return unsubscribe function', () => {
    const leader = new LeaderElection('test');
    const callback = vi.fn();

    const unsubscribe = leader.elect(callback);
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    leader.dispose();
  });

  it('should only request lock once', () => {
    const leader = new LeaderElection('test');

    leader.elect(() => {
      //
    });
    leader.elect(() => {
      //
    });

    expect(mockLockRequest).toHaveBeenCalledTimes(1);
    leader.dispose();
  });

  it('should clear listeners on dispose', () =>
    new Promise<void>(done => {
      const leader = new LeaderElection('test');
      const callback = vi.fn();

      leader.elect(callback);
      leader.dispose();

      // dispose 后不应再调用 callback
      expect(callback).toHaveBeenCalledTimes(1);
      done();
    }));

  it('dispose resets leadership and prevents re-election', async () => {
    const leader = new LeaderElection('disposed');
    await new Promise<void>(resolve => {
      leader.elect(() => resolve());
    });

    leader.dispose();

    expect(leader.isLeader).toBe(false);
    expect(() => leader.elect(() => undefined)).toThrow('LeaderElection has been disposed');
    expect(mockLockRequest).toHaveBeenCalledTimes(1);
  });

  it('notifies late subscribers immediately when already leader', async () => {
    const leader = new LeaderElection('late');
    await new Promise<void>(resolve => {
      leader.elect(() => resolve());
    });

    const late = vi.fn();
    const unsubscribe = leader.elect(late);
    expect(late).toHaveBeenCalledWith(true);
    unsubscribe();
    leader.dispose();
  });

  it('falls back to BroadcastChannel election, heartbeat, release, and watchdog', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });

    type Handler = ((event: MessageEvent) => void) | null;
    const channels: Array<{
      name: string;
      onmessage: Handler;
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }> = [];

    class FakeBroadcastChannel {
      onmessage: Handler = null;
      postMessage = vi.fn((data: unknown) => {
        for (const channel of channels) {
          if (channel === this || channel.name !== this.name) continue;
          channel.onmessage?.({ data } as MessageEvent);
        }
      });
      close = vi.fn();
      constructor(readonly name: string) {
        channels.push(this as unknown as (typeof channels)[number]);
      }
    }

    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const follower = new LeaderElection('bc-room');
    const followerCallback = vi.fn();
    follower.elect(followerCallback);
    const channel = channels[0];

    // 较早的对端声明会阻止本地成为 leader，并启动 watchdog。
    channel.onmessage?.({
      data: { type: 'CLAIM', tabId: 'peer-leader', requestTime: 1 }
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(500);
    expect(followerCallback).not.toHaveBeenCalled();

    // 对端 heartbeat 让 follower 保持非 leader 状态。
    channel.onmessage?.({
      data: { type: 'HEARTBEAT', tabId: 'peer-leader', requestTime: 1 }
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(1000);
    expect(followerCallback).not.toHaveBeenCalled();

    // 对端释放会触发重新选举。
    // RELEASE 会将 lastLeaderHeartbeat 清零，而 watchdog 可能仍在选举宽限期的同一
    // 截止时间运行，因此重启后要额外等待一个宽限周期。
    channel.onmessage?.({
      data: { type: 'RELEASE', tabId: 'peer-leader', requestTime: 1 }
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(500 + 1000 + 500);
    expect(followerCallback).toHaveBeenCalledWith(true);
    expect(follower.isLeader).toBe(true);

    // leader 用 heartbeat 响应 challenger 的声明。
    const postsBefore = channel.postMessage.mock.calls.length;
    channel.onmessage?.({
      data: { type: 'CLAIM', tabId: 'challenger', requestTime: Date.now() + 10_000 }
    } as MessageEvent);
    expect(channel.postMessage.mock.calls.length).toBeGreaterThan(postsBefore);
    const lastPost = channel.postMessage.mock.calls.at(-1)?.[0] as { type: string };
    expect(lastPost.type).toBe('HEARTBEAT');

    follower.dispose();
    follower.dispose();
    expect(channel.close).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('re-elects via watchdog when peer leader heartbeats stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });

    type Handler = ((event: MessageEvent) => void) | null;
    const channels: Array<{ name: string; onmessage: Handler; postMessage: ReturnType<typeof vi.fn> }> = [];

    class FakeBroadcastChannel {
      onmessage: Handler = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor(readonly name: string) {
        channels.push(this as unknown as (typeof channels)[number]);
      }
    }

    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const follower = new LeaderElection('watchdog-room');
    const callback = vi.fn();
    follower.elect(callback);
    const channel = channels[0];

    channel.onmessage?.({
      data: { type: 'HEARTBEAT', tabId: 'peer-leader', requestTime: 1 }
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(500);
    expect(callback).not.toHaveBeenCalled();

    // 不再收到 heartbeat → 超时 → 重新选举宽限期 → 成为 leader。
    await vi.advanceTimersByTimeAsync(3000 + 1000 + 500);
    expect(callback).toHaveBeenCalledWith(true);

    follower.dispose();
    vi.useRealTimers();
  });
});
