import { v7 as v7_uuid } from 'uuid';
import { EntityStatus } from './entity/entity-status.js';
import { EntityType, UUID } from './entity/entity.interface.js';
import { EntityMetadata } from './entity/metadata.interface.js';
import { ENTITY_TYPE, METADATA, STATUS } from './rxdb.private.js';
import { RxDBError } from './RxDBError.js';

interface SymbolKeyed {
  [METADATA]?: EntityMetadata;
  [ENTITY_TYPE]?: EntityType;
  [STATUS]?: EntityStatus<EntityType>;
  constructor?: SymbolKeyed;
}

/**
 * 读 Symbol 注入的槽位：先看对象自身，再看它的构造函数。
 *
 * @remarks
 * 入参有意收成 `unknown`：这三个 getter 的调用点合计 600+，
 * 传进来的东西是不是实体只有运行时说了算，编译期收窄没有意义。
 */
const readSymbolSlot = <V>(target: unknown, key: keyof SymbolKeyed): V | undefined => {
  if (target === null || (typeof target !== 'object' && typeof target !== 'function')) return undefined;
  const t = target as SymbolKeyed;
  return (t[key] ?? t.constructor?.[key]) as V | undefined;
};

/**
 * 获取实体元数据。
 *
 * @param target - 实体类或实体实例
 * @returns 实体元数据对象
 * @throws RxDBError 当 `target` 没有被 `@Entity` 装饰时
 *
 * @remarks
 * **查不到就抛，不返回 `undefined`。** 旧实现用 `!` 把 `undefined` 压成 `EntityMetadata`，
 * 于是未装饰对象会带着一个类型正确的 `undefined` 流到很远的地方才炸，
 * 现场与病因完全对不上。全仓 403 个调用点里只有 1 个对结果判过空 ——
 * 既有约定本来就是「传进来的必须是实体」，fail-fast 只是让声明变成真的。
 */
export const getEntityMetadata = <T extends EntityType>(target: T | InstanceType<T>): EntityMetadata => {
  const metadata = readSymbolSlot<EntityMetadata>(target, METADATA);
  if (!metadata) throw new RxDBError('Target has no entity metadata: it is not decorated with @Entity');
  return metadata;
};

/**
 * 探测实体元数据：查不到返回 `undefined`，不抛错。
 *
 * @param target - 任意对象；不要求它是实体
 * @returns 实体元数据对象，没有则 `undefined`
 *
 * @remarks
 * {@link getEntityMetadata} 改成 fail-fast 之后，**真正需要探测的调用点必须显式说出来**，
 * 而不是靠「反正返回 undefined」蒙混过去。目前唯一的合法探测是
 * `metadata-transition.ts` 沿原型链往上找父类元数据 —— 走到没有元数据的那一层就是终止条件，
 * 不是错误。
 */
export const tryGetEntityMetadata = (target: unknown): EntityMetadata | undefined =>
  readSymbolSlot<EntityMetadata>(target, METADATA);

/**
 * 从实体元数据取回实体类。
 *
 * @param metadata - 实体元数据（由 {@link getEntityMetadata} 或 `SchemaManager` 取得）
 * @returns 实体类型
 * @throws RxDBError 当元数据上没有实体类反向引用时
 *
 * @remarks
 * **入参从 `T | InstanceType<T> | EntityMetadata` 收窄成只剩 `EntityMetadata`。**
 * `ENTITY_TYPE` 这个槽位全仓只在 `entity-manager.ts` 往**元数据对象**上写过一次，
 * 类和实例上从来没有 —— 也就是说旧签名里 `T | InstanceType<T>` 那两支
 * 传什么都只会拿到 `undefined`（被 `!` 压住）。收窄之后误用在编译期就被挡下。
 */
export const getEntityType = (metadata: EntityMetadata): EntityType => {
  const entityType = readSymbolSlot<EntityType>(metadata, ENTITY_TYPE);
  if (!entityType) throw new RxDBError('Metadata has no entity type back-reference');
  return entityType;
};

/**
 * 获取实体状态。
 *
 * @param target - 实体实例
 * @returns 实体状态对象
 * @throws RxDBError 当 `target` 不是已挂载的实体实例时
 *
 * @remarks
 * 旧实现是 `target && target[STATUS]`：`target` 为假值时返回的是 **`target` 自己**
 * （`null` / `undefined` / `0` / `''`），却声明成 `EntityStatus<T>`。
 * 需要「探测」语义的只有 {@link isRxDBEntity}，它现在自己直接读槽位，
 * 所以这里可以老老实实 fail-fast。
 */
export const getEntityStatus = <T extends EntityType>(target: InstanceType<T>): EntityStatus<T> => {
  const status = readSymbolSlot<EntityStatus<T>>(target, STATUS);
  if (!status) throw new RxDBError('Target has no entity status: it is not an attached RxDB entity');
  return status;
};

/**
 * 检查是否为 RxDB 实体。
 *
 * @param target - 要检查的对象
 * @returns 是实体返回 `true`，否则返回 `false`
 *
 * @remarks
 * 这是**唯一**需要「查不到也不抛」的入口，所以它不走 {@link getEntityStatus}，
 * 自己直接读 `STATUS` 槽位。返回值也从 `target && ...`（假值时把入参原样吐回来）
 * 改成真正的 `boolean`，并声明为类型守卫。
 */
export const isRxDBEntity = <T extends EntityType>(target: unknown): target is InstanceType<T> =>
  !!readSymbolSlot<EntityStatus<T>>(target, STATUS);

/**
 * 探测实体状态：查不到返回 `undefined`，不抛错。
 *
 * @param target - 任意对象；不要求它是已挂载的实体
 * @returns 实体状态对象，没有则 `undefined`
 *
 * @remarks
 * 同 {@link tryGetEntityMetadata}：{@link getEntityStatus} 改成 fail-fast 之后，
 * 那些**本来就写了 `if (!status)` 分支**的调用点要显式改用这个入口 ——
 * 它们的守卫此前对类型系统是不可见的（声明说非空），
 * 换过来之后守卫才真正被类型检查覆盖。
 */
export const tryGetEntityStatus = <T extends EntityType>(target: unknown): EntityStatus<T> | undefined =>
  readSymbolSlot<EntityStatus<T>>(target, STATUS);

/**
 * 装饰器批处理：装饰器生成的代码会反复创建这个辅助函数，统一从这里 import 以减少产物代码量
 */
type DecoratorFunction = (...args: never[]) => unknown;

export const __decorateClass = <TTarget extends object>(
  decorators: readonly DecoratorFunction[],
  target: TTarget,
  key: PropertyKey = '',
  kind = 0
): TTarget => {
  let result: unknown =
    kind > 1 ? undefined
    : kind ? Object.getOwnPropertyDescriptor(target, key)
    : target;

  for (let index = decorators.length - 1; index >= 0; index--) {
    const decorator = decorators[index] as (value: unknown) => unknown;
    result = decorator(result) || result;
  }

  return result as TTarget;
};

export const uuid = () => v7_uuid() as UUID;

// 关闭/断连类错误 message 的固定短语，全部按小写比较。
const ADAPTER_SHUTDOWN_PHRASES = [
  'adapter is disconnected',
  'database is closing',
  'database is closed',
  'pglite is closing',
  'pglite is closed',
  'connection is closing'
];

const ADAPTER_TOKEN = 'adapter';

/**
 * 「`adapter` 之后出现 `closed`」单独判。
 *
 * 原先与上面的短语写在同一条正则里（`adapter is disconnected|adapter.*closed|…`），
 * 两个分支共享 `adapter` 前缀而后半段歧义，`'adapter'.repeat(20000)` 这类 message
 * 会让引擎把每个起点的每种切分都走一遍，退化成 O(n²)（CS-003）。
 * 两次 indexOf 是线性的，语义上只差一点：正则的 `.` 不跨行，indexOf 跨行 ——
 * 多行 message 里 `adapter` 与 `closed` 分处两行，同样属于关闭错误。
 */
const hasAdapterClosed = (message: string): boolean => {
  const adapterAt = message.indexOf(ADAPTER_TOKEN);
  return adapterAt >= 0 && message.includes('closed', adapterAt + ADAPTER_TOKEN.length);
};

/**
 * 判断错误是否由 adapter 关闭/断连引起。
 *
 * 在 RxDB.disconnect 期间，in-flight 的查询会撞到已断连的 adapter 并立即抛错，
 * 属于预期行为，通常不应作为错误日志输出。本函数统一各底层驱动（SQLite/PGlite/IndexedDB）
 * 的关闭错误识别，供 HistoryManager、RxDBAdapterPGlite、RxDBPluginTrigger 等模块共享。
 */
export const isAdapterShutdownError = (err: unknown): boolean => {
  if (!err) return false;
  const message = (
    err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err)
  ).toLowerCase();
  return ADAPTER_SHUTDOWN_PHRASES.some(phrase => message.includes(phrase)) || hasAdapterClosed(message);
};

/**
 * 确定性的 JSON.stringify
 *
 * 通过对 object 的键进行排序，确保相同内容但具有不同键顺序的对象能够生成相同的缓存 Key。
 *
 * @remarks
 * 输出直接用作查询缓存 key（`QueryManager.createTask`）和数据指纹
 * （`QueryCacheRepository.#computeDataFingerprint`），因此**两个语义不同的输入绝不能
 * 映射到同一字符串** —— 那等于把 A 查询的结果发给 B 查询。
 *
 * 所有 `JSON.stringify` 会返回 `undefined` 的值（顶层 undefined、数组元素 undefined、
 * 函数、symbol）都必须显式编码，否则会被拼成裸 `undefined` 或被 `Array.join` 吞成空串
 * （`[undefined]` 与 `[]` 因此曾得到同一个 key）。这里选择「唯一编码」而非「拒绝」：
 * 指纹路径跑在用户实体实例上，类字段形式的箭头函数是自有属性，抛错会打断线上查询。
 *
 * 函数按源码、symbol 按 description 编码，都是尽力而为 —— 同源码的两个闭包仍然同 key，
 * 但它们本来也无法作为查询条件区分。
 *
 * 对象里值为 `undefined` 的键仍然被跳过（`{a: undefined}` ≡ `{}`），这与 JSON 语义
 * 一致，也正是 `{limit: undefined}` 该等于 `{}` 的原因。
 */
export const deterministicStringify = (val: unknown): string => {
  // seen 只在递归中沿路径累积，用来把循环引用变成明确报错而不是爆栈
  const stringify = (value: unknown, seen: Set<object>): string => {
    if (value === null) return 'null';

    switch (typeof value) {
      case 'undefined':
        // 不带引号，与字符串 'undefined'（会被编码成 `"undefined"`）区分
        return 'undefined';
      case 'function':
        // 函数没有可靠的值身份：`String(fn)` 只是源码文本，捕获不同值的同源闭包会得到同一个
        // key。输出被当作查询缓存 key 与数据指纹用，伪造「唯一编码」等于把碰撞藏起来
        throw new TypeError('deterministicStringify does not support function values');
      case 'symbol':
        // 同理：`String(Symbol('a'))` 对两个不同的 Symbol('a') 完全相同
        throw new TypeError('deterministicStringify does not support symbol values');
      case 'bigint':
        // 加前缀，避免 10n 与 10 撞 key
        return 'bigint:' + value.toString();
      case 'number':
        // NaN 与 ±Infinity 经 JSON.stringify 都变成 'null'，会与真正的 null 撞 key
        if (!Number.isFinite(value)) {
          throw new TypeError(`deterministicStringify does not support non-finite number: ${String(value)}`);
        }
        return JSON.stringify(value) as string;
      case 'object':
        break;
      default:
        return JSON.stringify(value) as string;
    }

    const objectValue = value as object;
    if (seen.has(objectValue)) {
      throw new TypeError('deterministicStringify does not support circular references');
    }

    if (objectValue instanceof Date) {
      if (Number.isNaN(objectValue.getTime())) {
        throw new TypeError('deterministicStringify does not support invalid Date values');
      }
      return JSON.stringify(objectValue.toISOString());
    }
    if (objectValue instanceof Map || objectValue instanceof Set) {
      throw new TypeError('deterministicStringify does not support Map or Set values');
    }

    seen.add(objectValue);
    try {
      if (Array.isArray(objectValue)) {
        // 按下标遍历而不是 `map`：`map` 会跳过稀疏数组的空洞，
        // `join` 再把它们渲染成空串，于是 `[undefined]` 和 `[]` 输出相同
        const parts: string[] = [];
        for (let i = 0; i < objectValue.length; i++) parts.push(stringify(objectValue[i], seen));
        return '[' + parts.join(',') + ']';
      }

      const record = objectValue as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      let res = '{';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (record[k] !== undefined) {
          if (res.length > 1) res += ',';
          res += JSON.stringify(k) + ':' + stringify(record[k], seen);
        }
      }
      return res + '}';
    } finally {
      seen.delete(objectValue);
    }
  };

  return stringify(val, new Set<object>());
};
