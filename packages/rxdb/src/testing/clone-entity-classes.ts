/**
 * @fileoverview 实体类克隆：让同一组实体类同时注册到多个 RxDB 实例而互不干扰。
 *
 * @remarks
 * 适配器的集成套件要在一个进程里并发开好几个隔离实例，而实体类是**模块级单例**：
 * {@link https://github.com/aiao-io/rxdb | `EntityManager`} 注册时会往类与
 * `类.prototype` 上写实例相关的槽位，第二个实例注册同一个类就会撞上第一个实例留下的那份。
 * 克隆给每个实例一份**独立的构造器对象**，于是那些写各自落在各自的克隆体上。
 *
 * 这份实现原本在 `@aiao/rxdb-adapter-sqlite-core/testing` 与 `@aiao/rxdb-adapter-pglite/testing`
 * 各有一份逐字等价的副本，两份都靠 `symbol.description === 'ɵMetadata'` 找元数据槽位。
 * 那个字面量**从来没匹配上过**——核心的槽位是 `Symbol.for('@aiao/rxdb/ɵMetadata')`，
 * 描述字符串带包名前缀。后果不是报错而是静默降级：元数据分支是死代码，元数据槽位被当成
 * 普通静态 symbol **按引用抄**给了克隆体。今天没出事，只因为元数据对象在 `@Entity` 装饰那一刻
 * 就构造完、此后不再被改；它哪天变成可变的，两份副本会同时、无声地失去隔离。
 *
 * 所以搬到核心之后判据换成 {@link METADATA} 这个 `unique symbol` **本身**：核心给它改名，
 * 这里就是一次编译错误，而不是又一次安静的降级。
 */

import type { EntityType } from '../entity/entity.interface.js';
import { METADATA } from '../rxdb.private.js';

/** 不随类复制的三个内建静态名：复制它们会把克隆体的身份也一起盖掉。 */
const OWN_IDENTITY_NAMES: ReadonlySet<string> = new Set(['prototype', 'length', 'name']);

/**
 * 判定一个 symbol 槽位是否属于核心内部
 *
 * @remarks
 * 两种写法都要认：核心自己的 `Symbol.for('@aiao/rxdb/ɵX')`（描述带包名前缀），以及包外为了
 * 造夹具手写的 `Symbol('ɵX')`。内部槽位一律不抄——它们要么由 {@link cloneEntityClasses}
 * 亲自重建（元数据），要么必须让克隆体从零开始（实例管理器、代理、状态）。
 */
const isInternalSlot = (slot: symbol): boolean => {
  const description = slot.description;
  if (description === undefined) return false;
  return description.startsWith('ɵ') || description.startsWith('@aiao/rxdb/ɵ');
};

/** 槽位值不是对象时按「没有元数据」处理，而不是把一个原始值当元数据克隆。 */
const asObject = (value: unknown): object | undefined =>
  value !== null && typeof value === 'object' ? value : undefined;

/**
 * 沿原型链找元数据槽位
 *
 * @remarks
 * 命中即终止——子类不自带槽位时继承父类那一份，这也正是 `tryGetEntityMetadata` 的查找方式。
 * 命中但值不是对象时返回 `undefined` 而**不继续往上找**：那一层已经明确声明了自己的元数据，
 * 只是声明得不对；越过它去用父类的会让一个坏夹具悄悄跑成"好像对了"。
 */
function findMetadata(EntityClass: EntityType): object | undefined {
  let current: object | null = EntityClass;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, METADATA);
    if (descriptor) return asObject(descriptor.value as unknown);
    current = Reflect.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * 把源类的自有静态属性搬到克隆体上；内部槽位与身份三件套除外。
 *
 * @remarks
 * 复制的是属性描述符，其中的 `value` 是引用而非深拷贝：静态属性若是原始值，复制后各自
 * 独立；若是可变对象（数组、普通对象……），源类与所有克隆体会共享同一个引用——其中
 * 任意一方原地修改，其余各方都会看到。{@link cloneEntityClasses} 事后用一个新对象覆盖
 * {@link METADATA} 槽位，单独补上隔离；除此之外的可变静态状态本函数不作处理，测试夹具
 * 里的其余静态属性应当只存不可变值。
 */
function copyStaticProperties(source: EntityType, target: EntityType): void {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (OWN_IDENTITY_NAMES.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) Object.defineProperty(target, key, descriptor);
  }

  for (const slot of Object.getOwnPropertySymbols(source)) {
    if (isInternalSlot(slot)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, slot);
    if (descriptor) Object.defineProperty(target, slot, { ...descriptor, configurable: true });
  }
}

/**
 * 克隆一组实体类，隔离跨实例 / 跨套件的注册副作用
 *
 * @param entities - 待克隆的实体类，顺序保留
 * @returns 与入参一一对应的克隆体；每个克隆体 `extends` 它的源类
 *
 * @remarks
 * 克隆体的元数据是一个**以源元数据为原型**的新对象，不是同一个引用：读取照常沿原型链走，
 * 而克隆体这一侧的写入停在自己身上，不会回流到源类或另一个实例的克隆体。
 *
 * 只给测试用。生产代码要多份实体注册应当各自声明实体类，而不是在运行时复制构造器——
 * 克隆体的类名是 `Clone`，出现在生产错误消息里毫无信息量。
 *
 * @example
 * ```ts
 * const [IsolatedUser] = cloneEntityClasses([User]);
 * const rxdb = new RxDB({ entities: [IsolatedUser], ... });
 * ```
 *
 * @public
 */
export function cloneEntityClasses(entities: EntityType[]): EntityType[] {
  return entities.map(EntityClass => {
    const Clone: EntityType = class extends EntityClass {};
    const metadata = findMetadata(EntityClass);
    copyStaticProperties(EntityClass, Clone);
    if (metadata) {
      Object.defineProperty(Clone, METADATA, {
        value: Object.create(metadata),
        enumerable: false,
        configurable: true,
        writable: false
      });
    }
    return Clone;
  });
}
