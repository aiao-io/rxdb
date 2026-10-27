import { assertSafePath, isArrayIndex } from './object-path.js';

type MutableContainer = Record<string, unknown> | unknown[];
type SetCustomizer = (currentValue: unknown, key: string, object: MutableContainer) => unknown;

const toArrayPath = (path: string): string[] => path.replace(/\[/g, '.').replace(/\]/g, '').split('.').filter(Boolean);

const isContainer = (value: unknown): value is MutableContainer => typeof value === 'object' && value !== null;

export function setBase<T extends object>(object: T, path: string, value: unknown, custom?: SetCustomizer): T {
  const segments = toArrayPath(path);
  assertSafePath(segments);

  let current = object as MutableContainer;
  for (let index = 0; index < segments.length; index++) {
    const key = segments[index];
    if (index === segments.length - 1) {
      // Reflect.set 返回 false 表示写入被拒（对象已冻结 / 属性 writable:false /
      // setter 主动拒绝）。忽略它并照常 return object，调用方会以为写成功了 ——
      // 静默的数据丢失比抛错难查得多（UTL-023）
      if (!Reflect.set(current, key, value)) {
        throw new TypeError(`set: 无法写入路径段 "${key}"（完整路径 "${path}"）——目标不可写`);
      }
      break;
    }

    const existing: unknown = Object.hasOwn(current, key) ? Reflect.get(current, key) : undefined;
    if (isContainer(existing)) {
      current = existing;
      continue;
    }

    const customized = custom?.(existing, key, current);
    const next =
      isContainer(customized) ? customized
      : isArrayIndex(segments[index + 1]) ? []
      : {};
    if (!Reflect.set(current, key, next)) {
      throw new TypeError(`set: 无法在路径段 "${key}"（完整路径 "${path}"）上创建中间容器——目标不可写`);
    }
    current = next;
  }

  return object;
}

/**
 * 设置对象中指定路径的属性值，自动创建不存在的嵌套路径。
 * 下一段是规范数组下标（`0`、`12`，不含 `01` 这类前导零）时创建数组，否则创建对象；
 * 危险的原型链路径会抛出 TypeError。
 *
 * @param object - 要修改的对象
 * @param path - 点号或方括号路径
 * @param value - 要设置的值
 * @returns 原对象
 */
export function set<T extends object>(object: T, path: string, value: unknown): T {
  return setBase(object, path, value);
}
