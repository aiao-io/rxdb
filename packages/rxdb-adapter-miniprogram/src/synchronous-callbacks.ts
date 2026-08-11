/** wa-sqlite 需要加固的同步回调方法 → arguments 索引。 */
const CALLBACK_ARGUMENTS = {
  commit_hook: [1],
  create_function: [5, 6, 7],
  progress_handler: [2],
  set_authorizer: [1],
  update_hook: [1]
} as const;

const hardenedTargets = new WeakSet<object>();

/** 用 Proxy 隐藏函数原型，避免被误判为转译后的异步函数。 */
function concealFunctionPrototype(callback: unknown): unknown {
  if (typeof callback !== 'function') return callback;
  return new Proxy(callback, { getPrototypeOf: () => null });
}

/** 防止微信 Babel 把同步回调误判为转译后的 `AsyncFunction`。 */
export function hardenWaSqliteSynchronousCallbacks<T extends object>(target: T): T {
  if (hardenedTargets.has(target)) return target;
  const methods = target as Record<string, unknown>;

  for (const [name, callbackArguments] of Object.entries(CALLBACK_ARGUMENTS)) {
    const method = methods[name];
    if (typeof method !== 'function') continue;
    methods[name] = function (this: unknown, ...arguments_: unknown[]): unknown {
      const hardenedArguments = [...arguments_];
      for (const index of callbackArguments) {
        hardenedArguments[index] = concealFunctionPrototype(hardenedArguments[index]);
      }
      return Reflect.apply(method, this, hardenedArguments);
    };
  }

  hardenedTargets.add(target);
  return target;
}
