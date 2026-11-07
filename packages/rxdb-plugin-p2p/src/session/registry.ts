/** 已就绪会话的登记处：按对端身份去重，会话结束时自动摘除。 */
import { BehaviorSubject, type Observable } from 'rxjs';
import { peerIdentityKey, type P2PPeerIdentity } from './identity.js';
import type { P2PPeerSession } from './session.js';

/**
 * 两条会话连着同一对端时保留哪条。
 *
 * @remarks
 * 方向相反（双方同时拨号）时，身份键较小的一方发起的那条胜出：两端看到的是同一对身份键，各自算出的是同一条连接。
 *
 * 方向相同的重复连接（同一端拨了两次）保留先登记的，正在用的会话不会被后到的连接顶掉；按连接标识之类的固定规则
 * 挑选虽能让两端一致，却会关掉已在传输的那条。代价是两端登记的先后可能相反：两端各留一条、又各自以 `duplicate`
 * 关掉对方留下的那条，最后都不剩会话、要重新拨号。所以拨号方不应同时向同一对端拨两次。
 */
const preferredSession = (current: P2PPeerSession, incoming: P2PPeerSession, peer: P2PPeerIdentity): P2PPeerSession => {
  if (current.role === incoming.role) return current;
  const localDialerWins = peerIdentityKey(incoming.local) < peerIdentityKey(peer);
  return (incoming.role === 'initiator') === localDialerWins ? incoming : current;
};

/**
 * 已就绪会话的登记处：一个对端（用户 + 设备 + 实例）只留一条会话。
 *
 * @remarks
 * 落选的会话以 `duplicate` 关闭并告知对端；会话结束（任何原因）后自动从登记处摘除。
 */
export class P2PSessionRegistry {
  readonly #sessions = new Map<string, P2PPeerSession>();
  readonly #changes = new BehaviorSubject<readonly P2PPeerSession[]>([]);
  /** 当前会话列表：订阅时先给出当前值，之后每次增删推送一次。 */
  readonly sessions$: Observable<readonly P2PPeerSession[]> = this.#changes.asObservable();

  /** 当前会话列表的快照。 */
  get sessions(): readonly P2PPeerSession[] {
    return this.#changes.value;
  }

  /**
   * 登记一条会话：等它就绪后按对端身份去重。
   *
   * @returns 登记处为该对端保留的会话：可能是传入的这条，也可能是已有的那条
   * @throws P2PSessionClosedError 会话在就绪前结束
   */
  async add(session: P2PPeerSession): Promise<P2PPeerSession> {
    const peer = await session.ready;
    const key = peerIdentityKey(peer);
    const current = this.#sessions.get(key);
    const kept = current && current.state !== 'closed' ? preferredSession(current, session, peer) : session;
    if (kept !== session) {
      void session.close('duplicate');
      return kept;
    }
    this.#sessions.set(key, session);
    this.#publish();
    void session.closed.then(() => this.#remove(key, session));
    if (current) void current.close('duplicate');
    return session;
  }

  /** 某个对端当前登记的会话。 */
  get(peer: P2PPeerIdentity): P2PPeerSession | undefined {
    return this.#sessions.get(peerIdentityKey(peer));
  }

  /** 关闭全部登记的会话。 */
  async close(): Promise<void> {
    await Promise.all([...this.#sessions.values()].map(session => session.close()));
  }

  #remove(key: string, session: P2PPeerSession): void {
    if (this.#sessions.get(key) !== session) return;
    this.#sessions.delete(key);
    this.#publish();
  }

  #publish(): void {
    this.#changes.next([...this.#sessions.values()]);
  }
}
