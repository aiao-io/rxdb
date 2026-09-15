/**
 * @fileoverview raw 写通道的**接缝**：能力位为假就放行，为真就转交给捕获运行时。
 *
 * @remarks
 * `rawQuery?()` 是 `IRxDBAdapter` 上的**可选方法**，核心包没法像四个挂载点那样替适配器包住它
 * （见 `capture-interceptor.ts` 的 @fileoverview）。于是 adapter-contract.md §2 的形态是：
 * 各适配器在自己的 `rawQuery` 实现里调一句 {@link gateRawWrite}，其余一概不管。
 *
 * **本文件只有分派，没有判定。** 判定认的是语句词法、表名在六种后端上的物理形态、以及受信
 * 意图豁免——三样都随捕获规则变，整套随 `@aiao/rxdb-plugin-working-tree` 走。留在核心的是
 * 那一句「没装插件就什么都不做」，因为它必须对**所有**用户成立，包括永远不装插件的那些。
 *
 * **未启用形态在类型上就没有门。** {@link RawWriteContext} 是个可辨识联合：`capabilityEnabled`
 * 为 `false` 的那一支**结构上不存在** `gate` 成员。旧实现把「未启用」写成一个 `domain` 取值即抛的
 * 单例，靠的是「第 1 步一定排在读 `domain` 之前」这条人工约定；现在那条约定由编译器执行——
 * 把能力位判断挪到分派之后，是类型错误，而不是一条静默放行的 raw 通道。
 */

/**
 * 一次 raw 写的判定入口；由捕获运行时提供
 *
 * @remarks
 * 写成带泛型调用签名的接口而不是 `type Gate = <T>(…) => …` 的别名：两者等价，但接口形态在
 * 实现方那侧的报错会指向具体成员而不是整条函数类型。
 */
export interface RawWriteGate {
  /**
   * @typeParam T - 语句执行体的返回类型；放行时原样透传
   * @param sql - 待判定的语句原文
   * @param execute - **还没被调用的**执行体
   * @returns `execute()` 的返回值本身
   * @throws 判定落在拒绝上时抛出；此时 `execute` 一次都不会被调用
   */
  <T>(sql: string, execute: () => Promise<T> | T): Promise<T>;
}

/**
 * 某个适配器实例当前的 raw 写判定上下文（adapter-contract.md §2）
 *
 * @remarks
 * 由 `RxDBAdapterLocalBase.workingTreeRawWriteContext` 交出，适配器原样转给 {@link gateRawWrite}，
 * 中途不拆开、不补字段。六个适配器需要写对的因此只有「把它转给门」这一句，
 * 「能力位怎么算」「判定去哪找」两个真正容易写歪的问题一次都不会落到它们头上。
 */
export type RawWriteContext =
  | {
      /** 这个数据库没有启用提交能力；raw 写无条件放行 */
      readonly capabilityEnabled: false;
    }
  | {
      /** 这个数据库启用了提交能力 */
      readonly capabilityEnabled: true;

      /** 判定入口；来自装在这个适配器上的捕获运行时 */
      readonly gate: RawWriteGate;
    };

/**
 * 判定一次 raw 写，放行时才执行语句
 *
 * @typeParam T - 语句执行体的返回类型；门禁原样透传，不做任何包装
 * @param sql - 待判定的语句原文
 * @param context - 取自 `RxDBAdapterLocalBase.workingTreeRawWriteContext`
 * @param execute - **还没被调用的**语句执行体
 * @returns `execute()` 的返回值本身
 * @throws 已启用提交能力且判定落在拒绝上时抛出；此时 `execute` 一次都不会被调用
 *
 * @remarks
 * 未启用时**同步走到 `execute()`，不多绕任何一步**：FR-046 要求没启用提交能力的库与没有这个
 * 版本时逐字节一致，而「绕一层再放行」在事务里是可观察的。
 *
 * @example
 * ```ts
 * override rawQuery<T>(sql: string): Promise<T> {
 *   return gateRawWrite(sql, this.workingTreeRawWriteContext, () => this.#exec<T>(sql));
 * }
 * ```
 */
export async function gateRawWrite<T>(
  sql: string,
  context: RawWriteContext,
  execute: () => Promise<T> | T
): Promise<T> {
  if (!context.capabilityEnabled) return await execute();
  return await context.gate(sql, execute);
}
