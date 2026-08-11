const serialize = (value: unknown, ancestors: ReadonlySet<object>, label: string): string => {
  const SERIALIZABLE_MESSAGE = `${label} must contain serializable values`;
  const CIRCULAR_MESSAGE = `${label} must not contain circular references`;

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return `boolean:${String(value)}`;
  if (typeof value === 'number') return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
  if (typeof value === 'bigint') return `bigint:${String(value)}`;
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(SERIALIZABLE_MESSAGE);
  }
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (value instanceof RegExp) return `regexp:${value.source}/${value.flags}`;
  if (ancestors.has(value)) throw new TypeError(CIRCULAR_MESSAGE);

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    // `Array.prototype.map` **跳过 hole** 且不体现长度：`[,,]`（长度 2）与 `[]` 都会产出
    // `array:[]`，两个语义不同的查询就此共用同一个缓存 key。
    // 显式编码长度，并把 hole 与 `undefined` 区分开（UTL-034）
    const items = Array.from({ length: value.length }, (_, index) =>
      index in value ? serialize(value[index], nextAncestors, label) : 'hole'
    );
    return `array(${value.length}):[${items.join(',')}]`;
  }
  // Map / Set 的 Object.keys 恒为 []，落进下面的 plain-object 分支会坍缩成 "object:{}"，
  // 任意两个 Map（或 Set）的 key 就此相等，内容变了也检测不出来。
  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([key, item]) => `${serialize(key, nextAncestors, label)}=>${serialize(item, nextAncestors, label)}`)
      .sort();
    return `map:{${entries.join(',')}}`;
  }
  if (value instanceof Set) {
    const entries = Array.from(value.values())
      .map(item => serialize(item, nextAncestors, label))
      .sort();
    return `set:{${entries.join(',')}}`;
  }
  // 只有 plain object 才走键值展开：其余宿主对象（WeakMap/ArrayBuffer/DOM 节点…）
  // 的 Object.keys 同样为空，兜底会静默把它们视作等价。这里与 function/symbol
  // 一样显式拒绝，不做降级。
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== null && prototype !== Object.prototype) {
    throw new TypeError(SERIALIZABLE_MESSAGE);
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${serialize(record[key], nextAncestors, label)}`);
  return `object:{${entries.join(',')}}`;
};

/**
 * 把任意可序列化的值转成稳定字符串 key，用于「内容是否变化」的判定。
 *
 * @param value 待序列化的值
 * @param label 错误信息前缀，用于让调用方的报错带上业务语境（如 `'RxDB query options'`）
 * @returns 与内容一一对应的稳定 key；对象键序、Map 键序、Set 成员序均不影响结果
 * @throws {TypeError} 值中含函数、symbol、无法识别的宿主对象或循环引用时抛出
 *
 * @remarks
 * 供三框架绑定包共用，避免各自实现漂移：`JSON.stringify` + `Object.keys` 的朴素做法
 * 会把 `Date`/`Map`/`Set`/`RegExp` 全部坍缩成 `{}`，选项内容变了却算出同一个 key，
 * 表现为「改了筛选条件但列表不刷新」且没有任何报错。
 *
 * @example
 * ```ts
 * createStableKey({ b: 1, a: 2 }) === createStableKey({ a: 2, b: 1 }); // true
 * createStableKey(new Date('2026-01-01')) !== createStableKey(new Date('2026-07-01')); // true
 * ```
 */
export const createStableKey = (value: unknown, label = 'Value'): string => serialize(value, new Set(), label);
