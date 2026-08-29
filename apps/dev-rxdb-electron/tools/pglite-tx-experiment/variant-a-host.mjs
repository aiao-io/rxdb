/**
 * US-208 线 G · 方案 A：**IPC 事务 ID 协议**的主进程侧原型。
 *
 * 主进程持有唯一的 PGlite 连接，渲染进程用一个事务 ID 把多次 `ipcRenderer.invoke`
 * 串成一条事务：`begin` → `exec` × N → `commit` / `rollback`。
 *
 * ## 核心难点：PGlite 只有 callback 事务
 *
 * `pg.transaction(cb)` 的边界由 `cb` 的**返回**决定 —— 返回即 COMMIT，抛出即 ROLLBACK。
 * 而 `cb` 不可能跨 IPC 序列化（US-207 拆出本故事的原因就是这句话）。
 *
 * 本原型的做法是**把 callback 挂起**：`cb` 拿到 `tx` 后立刻 `await` 一个由外部持有的
 * promise，于是事务在 PostgreSQL 侧一直开着，而 `tx` 句柄留在 Map 里供后续 invoke 复用。
 * `commit` resolve 它、`rollback` reject 它，PGlite 自己去发 COMMIT / ROLLBACK。
 *
 * 这不是绕过 PGlite 的事务语义，恰恰是照它的语义用：所有语句都真的走同一个 `tx`，
 * 没有任何一条被拆到隐式事务里（AC#2 明令「不得把多条独立请求包装成假事务」）。
 *
 * ## 代价，也是本实验要量的东西
 *
 * 1. 每条语句一次 IPC 往返；
 * 2. 挂起的 callback 会独占 PGlite 的连接锁 —— 渲染进程崩在事务中间，整个库就卡死了。
 *    所以 {@link VariantAHost.releaseOwner} 不是可选的收尾，而是本方案能不能成立的前提（AC#3）。
 *
 * @module pglite-tx-experiment/variant-a-host
 */

/**
 * 单条打开中的事务。
 *
 * @typedef {object} OpenTransaction
 * @property {number} owner - 发起方 `webContents.id`；回收时按它清场
 * @property {unknown} tx - PGlite 交给 callback 的事务句柄
 * @property {{ resolve: () => void, reject: (error: Error) => void }} settle - 挂起点的开关
 * @property {Promise<unknown>} finished - `pg.transaction(...)` 本身，等它落地才算真的提交/回滚完
 * @property {number} statements - 已在本事务里执行过的语句数
 */

/** `begin` 等待 PGlite 真正进入 callback 的上限。超时说明连接被别的事务占着。 */
const BEGIN_TIMEOUT_MS = 5_000;

/**
 * 把 PGlite 的 `Results` 收窄成能过 structured clone 的形状。
 *
 * @remarks
 * `fields` 上挂着 PGlite 自己的解析器等不可克隆的东西，整个丢给 `ipcRenderer.invoke`
 * 会以 "An object could not be cloned" 失败 —— 而报错点在 IPC 层，看上去与 SQL 毫无关系。
 * `rows` 里的 BigInt / Uint8Array / Date 都是 structured clone 原生支持的，原样带走。
 */
const toWireResult = result => ({
  rows: result.rows,
  fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
  affectedRows: result.affectedRows ?? 0
});

/** 把错误收窄成能过 IPC 的形状。`ipcMain.handle` 直接抛的话，渲染进程只能拿到被拼过的字符串。 */
const toWireError = error => ({
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : 'Error'
});

/**
 * 创建方案 A 的主进程 host。
 *
 * @param {{ pg: any }} options - `pg` 为已打开的 PGlite 实例
 * @returns {{
 *   handle: (ownerId: number, request: unknown) => Promise<object>,
 *   releaseOwner: (ownerId: number) => Promise<number>,
 *   readonly openCount: number,
 *   readonly opKinds: readonly string[]
 * }} host
 */
export function createVariantAHost({ pg }) {
  /** @type {Map<string, OpenTransaction>} */
  const open = new Map();
  let seq = 0;

  /**
   * 开一条事务，挂起在 PGlite 的 callback 里。
   *
   * @param {number} ownerId - 发起方 `webContents.id`
   * @returns {Promise<string>} 事务 ID
   */
  const begin = async ownerId => {
    const txId = `tx-a-${++seq}`;
    /** @type {OpenTransaction} */
    const entry = { owner: ownerId, tx: null, settle: null, finished: null, statements: 0 };

    // 先把挂起点建好再进 callback：callback 可能在下一个微任务就跑起来，
    // 那时它要用的 `closed` 必须已经存在。
    const closed = new Promise((resolve, reject) => {
      entry.settle = { resolve, reject };
    });
    let markStarted;
    const started = new Promise(resolve => {
      markStarted = resolve;
    });

    entry.finished = pg.transaction(async tx => {
      entry.tx = tx;
      markStarted();
      // 事务从这里一直开着，直到 commit / rollback / 回收把 `closed` 结掉。
      await closed;
    });
    // PGlite 的 rejection 由 commit/rollback 那侧显式消费；这里先接住，免得变成未处理拒绝。
    entry.finished.catch(() => undefined);
    open.set(txId, entry);

    const timedOut = Symbol('begin-timeout');
    const race = await Promise.race([
      started,
      new Promise(resolve => setTimeout(() => resolve(timedOut), BEGIN_TIMEOUT_MS))
    ]);
    if (race === timedOut) {
      open.delete(txId);
      throw new Error(`begin 超时：PGlite 连接被另一条事务占用超过 ${BEGIN_TIMEOUT_MS}ms`);
    }
    return txId;
  };

  /** 取一条打开中的事务，取不到就是协议违例，直接抛。 */
  const require_ = txId => {
    const entry = open.get(txId);
    if (!entry) throw new Error(`未知或已结束的事务 ID：${String(txId)}`);
    return entry;
  };

  /**
   * 结束一条事务。
   *
   * @param {string} txId - 事务 ID
   * @param {Error | null} failure - 传 `null` 提交，传 Error 回滚
   */
  const settle = async (txId, failure) => {
    const entry = require_(txId);
    open.delete(txId);
    if (failure) entry.settle.reject(failure);
    else entry.settle.resolve();
    // 必须等 `pg.transaction` 自己落地：不等的话 COMMIT 还在飞，紧接着的读可能看不到写入，
    // 而那会被误读成「事务语义不成立」。
    if (failure) await entry.finished.catch(() => undefined);
    else await entry.finished;
    return entry.statements;
  };

  return {
    /** 协议的操作集合。**不随用例数量增长**，这正是与方案 B 对照的那个量。 */
    opKinds: Object.freeze(['begin', 'exec', 'commit', 'rollback']),

    get openCount() {
      return open.size;
    },

    async handle(ownerId, request) {
      const op = typeof request === 'object' && request !== null ? request.op : undefined;
      try {
        if (op === 'begin') return { ok: true, value: { txId: await begin(ownerId) } };
        if (op === 'exec') {
          const entry = require_(request.txId);
          if (entry.owner !== ownerId) throw new Error('事务不属于本窗口');
          entry.statements++;
          return { ok: true, value: toWireResult(await entry.tx.query(request.sql, request.params)) };
        }
        if (op === 'commit') return { ok: true, value: { statements: await settle(request.txId, null) } };
        if (op === 'rollback') {
          return { ok: true, value: { statements: await settle(request.txId, new Error('rollback requested')) } };
        }
        throw new Error(`未知操作：${String(op)}`);
      } catch (error) {
        return { ok: false, error: toWireError(error) };
      }
    },

    /**
     * 回收某个窗口名下所有悬挂事务（AC#3）。
     *
     * @remarks
     * 这是方案 A 的生死线：挂起的 callback 独占 PGlite 连接锁，不回收的话渲染进程一崩，
     * 后续任何查询都会永远排队 —— 表征是「数据库没响应」，与崩溃现场毫无关联线索。
     *
     * @param {number} ownerId - 已崩溃或已销毁的 `webContents.id`
     * @returns {Promise<number>} 本次回滚掉的事务条数
     */
    async releaseOwner(ownerId) {
      const doomed = [...open.entries()].filter(([, entry]) => entry.owner === ownerId).map(([txId]) => txId);
      for (const txId of doomed) {
        await settle(txId, new Error(`owner ${ownerId} 已消失，事务被回收`));
      }
      return doomed.length;
    }
  };
}
