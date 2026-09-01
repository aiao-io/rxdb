/**
 * US-208 线 G · 方案 B：**adapter 完整托管在主进程**的原型。
 *
 * 渲染进程只发一次高层请求（「跑名为 X 的那件事」），事务的开、闭与整个体都在主进程里，
 * 由 PGlite 原生的 `pg.transaction(cb)` 负责 —— 不需要挂起 callback，也不需要事务 ID。
 *
 * ## 与方案 A 的唯一差别
 *
 * 事务体来自同一个 {@link ../scenarios.mjs} —— 方案 A 把它注入渲染进程执行，本方案直接
 * `import` 后在主进程执行。SQL 一字不差，差的只有「在哪跑」。
 *
 * ## 代价，也是本实验要量的东西
 *
 * `SCENARIOS` 这张表就是本方案的**接口面**：渲染进程能做的事等于表里有的事。
 * 业务每多一种事务，主进程就得多一个条目 —— 而方案 A 的四个操作是恒定的。
 * {@link VariantBHost.opKinds} 与 {@link VariantBHost.bodiesInMain} 把这个增长量记下来，
 * 供对照时逐条比较，而不是靠印象判断「接口面显著变大」这句话到底有多大。
 *
 * @module pglite-tx-experiment/variant-b-host
 */

import { SCENARIOS } from './scenarios.mjs';

/**
 * 把错误收窄成能过 IPC 的形状。
 *
 * @remarks
 * 本方案不需要方案 A 那样的 `toWireResult`：跨 IPC 的只有事务体的**返回值**，而
 * PGlite 的 `Results`（`fields` 上挂着解析器，不可克隆）整个留在主进程里，从不出线。
 * 少一层收窄，也就少一处「忘了收窄导致 An object could not be cloned」的坑。
 */
const toWireError = (error, rolledBack) => ({
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : 'Error',
  rolledBack
});

/**
 * 创建方案 B 的主进程 host。
 *
 * @param {{ pg: any }} options - `pg` 为已打开的 PGlite 实例
 * @returns {{
 *   handle: (ownerId: number, request: unknown) => Promise<object>,
 *   releaseOwner: (ownerId: number) => Promise<number>,
 *   readonly inFlight: number,
 *   readonly opKinds: readonly string[],
 *   readonly bodiesInMain: readonly string[]
 * }} host
 */
export function createVariantBHost({ pg }) {
  /** 正在执行中的高层请求数。渲染进程崩了它也不会归零 —— 主进程并不知道该停下来。 */
  let inFlight = 0;

  /** 最近一次事务体在主进程里的实测耗时（毫秒）。崩溃用例靠它核对「事务确实在跑」。 */
  let lastScenarioMs = 0;

  return {
    /**
     * 协议的操作集合。
     *
     * @remarks
     * 表面上只有 `scenario` 一个操作，但它带的 `name` 是**有限枚举**，真正的接口面是
     * {@link bodiesInMain}。把两者都报出来，是为了不让「只有一个 op」这种表面数字
     * 掩盖掉实际的耦合面。
     */
    opKinds: Object.freeze(['scenario']),

    /** 主进程里必须预先存在的事务体。业务每多一种事务，这里就多一条。 */
    bodiesInMain: Object.freeze(Object.keys(SCENARIOS)),

    get inFlight() {
      return inFlight;
    },

    get lastScenarioMs() {
      return lastScenarioMs;
    },

    async handle(_ownerId, request) {
      const op = typeof request === 'object' && request !== null ? request.op : undefined;
      if (op !== 'scenario') return { ok: false, error: toWireError(new Error(`未知操作：${String(op)}`), false) };

      const body = Object.hasOwn(SCENARIOS, request.name) ? SCENARIOS[request.name] : null;
      if (!body) return { ok: false, error: toWireError(new Error(`未知事务体：${String(request.name)}`), false) };

      inFlight++;
      const startedAt = Date.now();
      try {
        // 整条事务在这一次 invoke 里开始并结束：PGlite 的 callback 从不挂起，
        // 因此不存在「悬挂事务」这种状态 —— 这既是本方案最大的优点，也是它没有取消点的原因。
        const value = await pg.transaction(async tx => body((sql, params) => tx.query(sql, params), request.args));
        return { ok: true, value };
      } catch (error) {
        // callback 抛出后 PGlite 已经发过 ROLLBACK，这里只负责如实上报。
        return { ok: false, error: toWireError(error, true) };
      } finally {
        lastScenarioMs = Date.now() - startedAt;
        inFlight--;
      }
    },

    /**
     * 窗口消失时的回收口。
     *
     * @remarks
     * 刻意是**空操作**，而且必须如实地空着：本方案下没有任何跨 invoke 的事务状态可回收。
     * 代价是也没有取消点 —— 渲染进程崩在事务中途时，主进程会把这条事务照常跑完并提交，
     * 只是没人再关心结果。这个差异由 `probe.mjs` 的 `AC3.variantB` 实测记录，不在这里下结论。
     *
     * @returns {Promise<number>} 恒为 0
     */
    releaseOwner() {
      return Promise.resolve(0);
    }
  };
}
