/** 判定值是否需要继续下钻：非 null 的对象或函数。 */
const isFreezable = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

/**
 * 递归冻结一棵对象树。
 *
 * `seen` 记录已处理过的对象，使循环引用与菱形引用都能收敛。
 */
const freezeDeep = (target: object, seen: WeakSet<object>): void => {
  if (seen.has(target)) return;
  seen.add(target);
  if (!Object.isFrozen(target)) Object.freeze(target);

  // 用 Reflect.ownKeys 而非 Object.getOwnPropertyNames：后者不含 symbol 键，
  // symbol 键指向的整棵子树会被静默跳过（UTL-004）。
  for (const propertyKey of Reflect.ownKeys(target)) {
    const value = (target as Record<PropertyKey, unknown>)[propertyKey];
    // 数组 / Map / Set / 类实例都要下钻，因此这里按「非 null 的对象或函数」判定，
    // 而不是用 isObject（它只认 constructor === Object 的纯对象）。
    if (!isFreezable(value)) continue;
    freezeDeep(value, seen);
  }

  // Map/Set 的元素存放在内部槽而非自有属性上，ownKeys 遍历不到。
  // 容器的内部槽无法冻结，但其中引用到的对象必须冻结，否则深层状态仍可改。
  if (target instanceof Map) {
    for (const [key, value] of target) {
      if (isFreezable(key)) freezeDeep(key, seen);
      if (isFreezable(value)) freezeDeep(value, seen);
    }
  } else if (target instanceof Set) {
    for (const item of target) {
      if (isFreezable(item)) freezeDeep(item, seen);
    }
  }
};

/**
 * 深度冻结对象及其所有嵌套属性，使其不可修改
 * 递归遍历对象的所有属性，对每个对象和函数属性调用 Object.freeze()
 * @template T - 对象类型
 * @param target - 要深度冻结的对象
 * @returns 传入的对象本身，类型收窄为 `Readonly<T>`
 * @example
 * const obj = { a: { b: 1 } };
 * const frozen = deepFreeze(obj);
 * frozen.a.b = 2; // 抛出错误，对象已被冻结
 * @example
 * const arr = [1, { nested: 2 }];
 * const frozenArr = deepFreeze(arr);
 * frozenArr[1].nested = 3; // 抛出错误，嵌套对象也被冻结
 * **注意：** 原始类型（string、number、boolean等）和 null 值不会被冻结
 * **注意：** 函数对象也会被冻结，防止修改其属性
 * **注意：** 始终返回传入的对象本身（已冻结的对象不会重复冻结）
 * **注意：** 循环引用与菱形引用都会收敛，不会栈溢出
 * **注意：** 字符串键与 symbol 键都会遍历（`Reflect.ownKeys`）
 * **注意：** `Map` / `Set` 中引用到的键、值、元素都会被冻结，但**容器的内部槽冻结不了**
 * —— 冻结后 `map.set()` / `map.delete()` / `set.add()` 仍然生效。返回类型因此只承诺
 * `Readonly<T>`：`ReadonlyDeep<T>` 会在类型层面谎报 Map/Set 内容不可变（UTL-004）。
 */
export const deepFreeze = <T extends object>(target: T): Readonly<T> => {
  freezeDeep(target, new WeakSet<object>());
  return target;
};
