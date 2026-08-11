const HEARTBEAT_INTERVAL_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 3000;
const ELECTION_GRACE_MS = 500;

interface ElectionMessage {
  type: 'CLAIM' | 'HEARTBEAT' | 'RELEASE';
  tabId: string;
  requestTime: number;
}

/**
 * 基于 Web Locks API 的 Leader Election 实现（带 BroadcastChannel 降级）
 * 用于在多个浏览器 tab/window 之间选举唯一的 leader
 *
 * 主路径使用 Web Locks API（tab 关闭时自动释放锁，比心跳更可靠）
 * 降级路径使用 BroadcastChannel + timestamp 竞争选举（Safari Private Browsing 等环境）
 *
 * @example
 * ```ts
 * const leader = new LeaderElection('my-app');
 *
 * const unsubscribe = leader.elect(isLeader => {
 *   if (isLeader) {
 *     console.log('当前 tab 成为 leader');
 *     // 执行只有 leader 才能做的事情，如：
 *     // - 与服务器建立 WebSocket 连接
 *     // - 执行定时同步任务
 *   }
 * });
 *
 * // 同步检查是否为 leader
 * console.log(leader.isLeader);
 *
 * // 取消订阅
 * unsubscribe();
 *
 * // 页面关闭时自动释放，也可手动调用
 * leader.dispose();
 * ```
 */
export class LeaderElection {
  #disposed = false;
  #isLeader = false;
  #listeners = new Set<(isLeader: boolean) => void>();
  #lockManager?: LockManager;

  // Web Locks 状态
  #leadership?: Promise<unknown>;
  #resolve?: () => void;

  // BroadcastChannel fallback 状态
  #channel?: BroadcastChannel;
  #tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  #requestTime = Date.now();
  #heartbeatTimer?: ReturnType<typeof setInterval>;
  #electionTimer?: ReturnType<typeof setTimeout>;
  #lastLeaderHeartbeat = 0;
  #watchdogTimer?: ReturnType<typeof setInterval>;

  /** 当前是否为 leader */
  get isLeader() {
    return this.#isLeader;
  }

  /**
   * @param name - 锁名称，相同名称的实例竞争同一个 leader 位置
   */
  constructor(private readonly name: string) {
    const navigatorApi = globalThis.navigator as Navigator | undefined;
    this.#lockManager = navigatorApi?.locks;
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('beforeunload', this.#handleBeforeUnload);
    }
  }

  /**
   * 参与 leader 选举
   * @param callback - 成为 leader 时回调，参数为 `true`
   * @returns 取消订阅函数
   */
  elect(callback: (isLeader: boolean) => void) {
    if (this.#disposed) throw new Error('LeaderElection has been disposed');
    this.#listeners.add(callback);

    if (this.#isLeader) {
      callback(true);
      return () => this.#listeners.delete(callback);
    }

    if (this.#lockManager) {
      this.#electViaWebLocks();
    } else {
      this.#electViaBroadcastChannel();
    }

    return () => this.#listeners.delete(callback);
  }

  /** 释放 leader 身份并清理资源 */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('beforeunload', this.#handleBeforeUnload);
    }

    if (this.#lockManager) {
      this.#resolve?.();
    } else {
      this.#broadcastRelease();
      clearInterval(this.#heartbeatTimer);
      clearTimeout(this.#electionTimer);
      clearInterval(this.#watchdogTimer);
      this.#channel?.close();
    }

    this.#isLeader = false;
    this.#listeners.clear();
  }

  // ─── Web Locks 主路径 ────────────────────────────────

  #electViaWebLocks() {
    if (this.#leadership) return;
    const lockManager = this.#lockManager;
    if (!lockManager) {
      throw new Error('Web Locks API is not available in this environment');
    }
    this.#leadership = lockManager.request(this.name, async () => {
      if (this.#disposed) return;
      this.#isLeader = true;
      this.#listeners.forEach(fn => fn(true));
      await new Promise<void>(resolve => {
        this.#resolve = resolve;
      });
    });
  }

  // ─── BroadcastChannel fallback 路径 ────────────────────────

  #electViaBroadcastChannel() {
    if (this.#channel) return;
    const BroadcastChannelConstructor = globalThis.BroadcastChannel;
    if (typeof BroadcastChannelConstructor !== 'function') {
      throw new Error('LeaderElection requires Web Locks or BroadcastChannel support');
    }
    this.#channel = new BroadcastChannelConstructor(`leader-election:${this.name}`);
    this.#channel.onmessage = (event: MessageEvent<ElectionMessage>) => {
      this.#handleElectionMessage(event.data);
    };

    this.#startElection();
  }

  #startElection() {
    // 主动选举优先于 follower 看门狗；否则并发的看门狗 tick（尤其是 RELEASE 把
    // lastLeaderHeartbeat 清零之后）会 clearTimeout 宽限计时器，让 tab 卡在非 leader。
    clearInterval(this.#watchdogTimer);
    this.#watchdogTimer = undefined;

    this.#requestTime = Date.now();
    this.#broadcast({ type: 'CLAIM', tabId: this.#tabId, requestTime: this.#requestTime });

    clearTimeout(this.#electionTimer);
    this.#electionTimer = setTimeout(() => {
      if (!this.#isLeader && !this.#disposed) {
        this.#becomeLeader();
      }
    }, ELECTION_GRACE_MS);
  }

  #handleElectionMessage(msg: ElectionMessage) {
    if (this.#disposed) return;
    if (msg.tabId === this.#tabId) return;

    switch (msg.type) {
      case 'CLAIM':
        if (this.#isLeader) {
          this.#broadcast({ type: 'HEARTBEAT', tabId: this.#tabId, requestTime: this.#requestTime });
        } else if (
          msg.requestTime < this.#requestTime ||
          (msg.requestTime === this.#requestTime && msg.tabId < this.#tabId)
        ) {
          clearTimeout(this.#electionTimer);
          this.#lastLeaderHeartbeat = Date.now();
          this.#startWatchdog();
        }
        break;

      case 'HEARTBEAT':
        this.#lastLeaderHeartbeat = Date.now();
        if (!this.#isLeader) {
          clearTimeout(this.#electionTimer);
          this.#startWatchdog();
        }
        break;

      case 'RELEASE':
        this.#lastLeaderHeartbeat = 0;
        if (!this.#isLeader) {
          this.#startElection();
        }
        break;
    }
  }

  #becomeLeader() {
    this.#isLeader = true;
    this.#listeners.forEach(fn => fn(true));

    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = setInterval(() => {
      if (!this.#disposed) {
        this.#broadcast({ type: 'HEARTBEAT', tabId: this.#tabId, requestTime: this.#requestTime });
      }
    }, HEARTBEAT_INTERVAL_MS);

    clearInterval(this.#watchdogTimer);
  }

  #startWatchdog() {
    if (this.#watchdogTimer) return;
    this.#watchdogTimer = setInterval(() => {
      if (this.#disposed || this.#isLeader) {
        clearInterval(this.#watchdogTimer);
        this.#watchdogTimer = undefined;
        return;
      }
      if (Date.now() - this.#lastLeaderHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        clearInterval(this.#watchdogTimer);
        this.#watchdogTimer = undefined;
        this.#startElection();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  #broadcast(msg: ElectionMessage) {
    try {
      this.#channel?.postMessage(msg);
    } catch {
      // channel 可能已关闭
    }
  }

  #broadcastRelease() {
    this.#broadcast({ type: 'RELEASE', tabId: this.#tabId, requestTime: this.#requestTime });
  }

  #handleBeforeUnload = () => this.dispose();
}
