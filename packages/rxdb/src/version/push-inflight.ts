/**
 * 推送在飞登记：push 把「正在往远端送」的变更区间挂出来，undo 认这个区间。
 *
 * @module rxdb/version/push-inflight
 */

/**
 * 一次 push 调用期间持有的认领句柄。
 *
 * 一次 `pushRepository` 可能同时推多个仓库（级联），因此 `claim` 可以调多次，
 * 而 {@link release} 一次把这一轮的全部认领撤干净 —— 谁开的谁关，中途从哪条路径
 * 提前返回都不会漏。
 */
export interface PushInFlightSession {
  /**
   * 声明本轮正在把某仓库 id ≤ `maxChangeId` 的变更送往远端。
   *
   * @param repositoryKey - `namespace:entity`
   * @param maxChangeId - 本轮送出的最大 change id
   *
   * @remarks
   * 同一仓库重复认领取**较大**者：级联路径分相位推同一份计划，后一相位不该把
   * 前一相位已经罩住的区间缩回去。
   */
  claim(repositoryKey: string, maxChangeId: number): void;

  /** 撤销本 session 的全部认领。重复调用是空操作。 */
  release(): void;
}

/**
 * 「哪些变更此刻正在飞往远端」的进程内登记处。
 *
 * @remarks
 * 存在的理由是一个时序缺口：撤销的判据是「还没推上去」，而这件事的数据源
 * `RxDBSync.lastPushedChangeId` 只在 push **提交**时才写。push 的远端往返在事务之外，
 * 于是「已经发出去了、水位线还没推进」这段窗口里，`undo()` 会放行一条其实已经到达
 * 远端的变更。
 *
 * 撤销**不产生新的变更行**（`undo-redo-apply.ts` 只给原行打 `revertChangeId` 标记），
 * 而出站查询过滤 `revertChangeId = null` —— 那条变更从此远端有、本地无，且没有任何
 * 一次 push 会把这个差异送出去。本登记处把那段窗口填上：在飞即视同已推。
 *
 * **只覆盖本进程。** 多 tab / Tauri 多进程共享同一份本地库时，另一个进程的 push
 * 在这里是看不见的。跨进程要的是数据库里的一条租约行，而 push 路径目前整体就没有
 * 跨进程互斥（两个进程会各自推同一批变更），那是另一个问题，不在这里假装解决。
 */
export class PushInFlightRegistry {
  /** sessionId -> (repositoryKey -> 该 session 认领的最大 change id) */
  readonly #sessions = new Map<number, Map<string, number>>();
  #nextSessionId = 0;

  /**
   * 开一轮认领。
   *
   * @returns 本轮的认领句柄；调用方必须在 `finally` 里 {@link PushInFlightSession.release}
   */
  session(): PushInFlightSession {
    const sessionId = ++this.#nextSessionId;
    const claims = new Map<string, number>();
    this.#sessions.set(sessionId, claims);

    return {
      claim: (repositoryKey: string, maxChangeId: number): void => {
        const existing = claims.get(repositoryKey);
        if (existing !== undefined && existing >= maxChangeId) return;
        claims.set(repositoryKey, maxChangeId);
      },
      release: (): void => {
        this.#sessions.delete(sessionId);
      }
    };
  }

  /**
   * 当前全部在飞认领，按仓库取最大值。
   *
   * @returns `namespace:entity` -> 正在飞的最大 change id；没有任何认领时是空 Map
   */
  snapshot(): ReadonlyMap<string, number> {
    const merged = new Map<string, number>();
    for (const claims of this.#sessions.values()) {
      for (const [repositoryKey, maxChangeId] of claims) {
        const existing = merged.get(repositoryKey);
        if (existing !== undefined && existing >= maxChangeId) continue;
        merged.set(repositoryKey, maxChangeId);
      }
    }
    return merged;
  }
}
