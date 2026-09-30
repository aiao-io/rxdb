/**
 * 加密契约套件的查询计数登记表。
 *
 * @remarks
 * {@link EncryptedAdapterFactory.getQueryCount} 要回答「这个 adapter 到现在跑了多少条
 * SQL」，而计数器长在各适配器包自己的 `QueryCounting*Adapter` 子类上，套件那侧只认识
 * {@link EncryptedTestAdapter} 这个结构类型。本模块就是两者之间的那张表。
 *
 * 此前七个工厂各自 `new WeakMap()` 再写 `counts.get(adapter)?.() ?? 0`。那个 `?? 0`
 * 是**兜底**：登记表打空（接线错了）时它返回 0，而
 * {@link runQueryValidationSuite} 的 `expectRejectedBeforeQuery` 断言的是「调用前后
 * 计数不变」——`0 === 0` 恒成立，于是整批「加密列泄漏必须拦在 SQL 生成之前」的用例会
 * 静默变成空断言，绿得毫无意义。本模块把它换成抛错。
 *
 * @module
 */

/**
 * adapter → 读数函数。
 *
 * 存函数而不是数：登记发生在 `createAdapter()` 内部，套件读计数是之后的事，中间隔着
 * 被测的那些查询；存快照等于永远读到 0。
 *
 * `WeakMap` 而不是 `Map`：每条用例造一个新库，用 `Map` 会把整条测试进程跑过的所有
 * adapter（连同它们背后的 worker / OPFS 句柄）钉住不放。
 */
const queryCountReaders = new WeakMap<object, () => number>();

/**
 * 登记一个 adapter 的查询计数读数函数，并**原样返回它**。
 *
 * @param adapter - 套件之后会拿着去调 `getQueryCount()` 的那个对象
 * @param read - 每次调用返回该 adapter 当前累计执行的 SQL 条数
 * @returns 传进来的 `adapter` 本身
 *
 * @remarks
 * 返回值不是顺手写的便利：它逼调用点写成 `return registerQueryCount(x, ...)`，于是
 * 「登记 A 却返回 B」这种接线错误在语法上就写不出来。PGlite 两个工厂返回的是查询形状
 * 代理而不是裸 adapter，正是这种错误最容易发生的地方 —— 登记键必须是**交给套件的那个
 * 对象**，读数函数则闭包捕获内层真正带计数器的实例：
 *
 * ```ts
 * const inner = await createAdapter();
 * return registerQueryCount(wrapShape(inner), () => inner.queryCount);
 * ```
 */
export const registerQueryCount = <T extends object>(adapter: T, read: () => number): T => {
  queryCountReaders.set(adapter, read);
  return adapter;
};

/**
 * 读取已登记 adapter 的当前查询计数。
 *
 * @param adapter - 由 {@link registerQueryCount} 登记过的那个对象
 * @returns 该 adapter 到此刻累计执行的 SQL 条数
 * @throws {@link Error} 该对象从未登记过
 *
 * @remarks
 * 查不到就抛，**不返回 0**：查不到意味着工厂的 `createAdapter()` 没登记，或者登记的键
 * 与交还给套件的对象不是同一个。这两种都是接线 bug，而 0 是个合法读数 —— 让 bug 伪装
 * 成合法读数，代价是把断言「计数没变」的那批用例整片变成恒真。
 */
export const queryCountOf = (adapter: object): number => {
  const read = queryCountReaders.get(adapter);
  if (read === undefined) {
    throw new Error(
      '[rxdb-test] 该 adapter 没有登记查询计数：EncryptedAdapterFactory.createAdapter() ' +
        '必须用 registerQueryCount() 登记它交还的**那一个**对象（代理包装过的工厂，登记键是代理，' +
        '不是内层实例）'
    );
  }
  return read();
};
