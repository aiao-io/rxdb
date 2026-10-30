/**
 * @packageDocumentation
 * 同一实体 id 上「在线写回执落本地缓存」的次序判据。
 *
 * @remarks
 * 远端优先写分两步：远端写，再把回执落进本地缓存。两步之间隔着一次网络往返，同一 id 上先后发出的
 * 几次写，回执完全可能反序到达 —— 更新的回执被网络滞留，其后发出的删除先完成并清掉缓存行，
 * 迟到的更新回执再无条件 upsert，已删除的行就在本地复活。读侧的作废代次
 * （`QueryCacheEngine.invalidateInflight`）管不到这条通道：它只约束 pull / 清孤儿，在线写回执不经过它。
 *
 * 判据：每次写在**发出时**按调用顺序取一个递增序号；回执落缓存前，只有序号大于该 id 上已经落过缓存的
 * 最大序号才落，并把那个最大序号推进到自己。于是：
 *
 * - 后发出的写先落了缓存，先发出的写迟到的回执一律不落。删除同样占序号，删除之后迟到的更新不会复活行；
 * - 后发出的写失败了（远端拒绝 / 网络失败）从不占位，先发出且成功的那次照常落缓存 ——
 *   一次失败的删除不会让成功的更新丢掉；
 * - 先发出的先到，照常落；后发出的随后到，再覆盖它；
 * - 不同 id 各记各的，互不阻塞。
 *
 * 收敛规则：本地以**最后发出**的写为准。服务器实际执行顺序可能与本地调用顺序不一致（两个请求同时在路上，
 * 服务器先执行了后发出的那次），那时远端最终停在先发出的那次写，本地缓存却按发出顺序停在后发出的那次。
 * 这一偏差不在这里纠正：回执里没有可比的权威版本（删除的回执连 `updatedAt` 都没有），而下一次读同步按远端
 * 元数据对账 —— 远端更新的行判 stale 重新拉取，远端已经没有的行判孤儿清掉 —— 由拉取兜底收敛到远端。
 */

/** 一个 id 上的次序账 */
export interface QueryCacheWriteLedger {
  /** 还没结算的写有几次；归零即丢掉这本账 */
  inflight: number;
  /** 已经落过缓存的最大序号 */
  committed: number;
}

/** 一次已发出的写：它的序号，以及它涉及的每个 id 上的账 */
export interface QueryCacheWriteTicket {
  readonly sequence: number;
  readonly ledgers: ReadonlyMap<string, QueryCacheWriteLedger>;
}

/**
 * 按实体 id 记账的写次序。
 *
 * @remarks
 * 只有「发出 → 回执落缓存 → 结算」这一条时间线，三步由调用方成对调用：{@link QueryCacheWriteOrder.issue}
 * 在请求发出时（订阅时）调，{@link QueryCacheWriteOrder.claim} 在回执到达、落缓存之前调，
 * {@link QueryCacheWriteOrder.settle} 在这次写无论成败都已结束时调。
 *
 * 账只为「还有写在飞」的 id 存在：一个 id 上的写全部结算之后，不会再有任何迟到的回执，账随之丢掉，
 * 表的大小不随写过的 id 数增长。
 */
export class QueryCacheWriteOrder {
  /** 发出序号；递增、不复用，只比大小 */
  #sequence = 0;
  readonly #ledgers = new Map<string, QueryCacheWriteLedger>();

  /**
   * 登记一次正在发出的写。
   *
   * @param ids - 这次写涉及的实体 id；为空时（服务端分配 id 的新建）不参与排序
   * @returns 这次写的票据，回执到达与结算时交回
   */
  issue(ids: readonly string[]): QueryCacheWriteTicket {
    const sequence = ++this.#sequence;
    const ledgers = new Map<string, QueryCacheWriteLedger>();
    for (const id of ids) {
      const ledger = this.#ledgers.get(id) ?? { inflight: 0, committed: 0 };
      ledger.inflight += 1;
      this.#ledgers.set(id, ledger);
      ledgers.set(id, ledger);
    }
    return { sequence, ledgers };
  }

  /**
   * 回执到达：挑出这次写还能落缓存的 id，并把它们「最近一次落缓存」的位置推进到这次写。
   *
   * @param ticket - {@link QueryCacheWriteOrder.issue} 发的票据
   * @returns 可以落缓存的 id；比这次写晚发出的写已经落过缓存的 id 不在其中
   *
   * @remarks
   * 判定与随后的落缓存在同一个同步段里发起：本地适配器按调用顺序执行写，判定的先后就是落盘的先后。
   */
  claim(ticket: QueryCacheWriteTicket): string[] {
    const claimed: string[] = [];
    for (const [id, ledger] of ticket.ledgers) {
      if (ledger.committed > ticket.sequence) continue;
      ledger.committed = ticket.sequence;
      claimed.push(id);
    }
    return claimed;
  }

  /**
   * 一次写结束（成功、失败或被退订），不再有它的回执要落。
   *
   * @param ticket - {@link QueryCacheWriteOrder.issue} 发的票据；同一张只结算一次
   */
  settle(ticket: QueryCacheWriteTicket): void {
    for (const [id, ledger] of ticket.ledgers) {
      ledger.inflight -= 1;
      if (ledger.inflight === 0 && this.#ledgers.get(id) === ledger) this.#ledgers.delete(id);
    }
  }

  /**
   * 登记一次已经在本地落定、不经远端的写（离线写）。
   *
   * @param ids - 本地刚写过的实体 id
   *
   * @remarks
   * 它排在此前发出的全部写之后：那些写迟到的回执不再落缓存，否则会盖掉这次本地写
   * （断网改走离线删除之后，先前在飞的更新回执把行写回来）。之后才发出的在线写照常落缓存。
   */
  supersede(ids: readonly string[]): void {
    const ticket = this.issue(ids);
    this.claim(ticket);
    this.settle(ticket);
  }
}
