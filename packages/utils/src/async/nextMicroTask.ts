const resolvedPromise = /*@__PURE__*/ Promise.resolve();

/**
 * 将函数推迟到下一个微任务队列执行
 *
 * @template T - 回调函数中 this 的类型
 * @template R - 回调函数的返回值类型
 * @param fn - 要推迟执行的函数，可选
 * @returns 解析为回调结果的 Promise；未传回调时在下一微任务解析
 */
export const nextMicroTask = <T = void, R = void>(fn?: (this: T) => R): Promise<R | void> =>
  (fn ? resolvedPromise.then(fn) : resolvedPromise) as Promise<R | void>;
