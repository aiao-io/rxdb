import { RxDB } from '@aiao/rxdb';
import {
  DestroyRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  provideAppInitializer,
  type EnvironmentProviders
} from '@angular/core';

/**
 * `provideRxDB` 接受的数据库形态：实例、Promise，或返回二者之一的工厂。
 *
 * @typeParam T - 数据库类型，默认 {@link RxDB}
 *
 * @remarks
 * 三个框架包（Angular / React / Vue）的 provider 收的是**同一个**联合类型，
 * 名字也相同 —— 这是三框架对称铁律的落点之一：同一段「怎么把库交给框架」的说明
 * 在三端逐字成立，用户换框架时不需要重学。
 *
 * 允许 Promise 是为了「候选走动态 `import()`」这类场景（US-207 E11）：
 * 桌面分支不应被静态 import 打进 web bundle，而 `await import()` 只能给出 Promise。
 */
export type RxDBSource<T extends RxDB = RxDB> = T | Promise<T> | (() => T | Promise<T>);

/** 结构化的 thenable 判定；`await import()` 的返回值未必是原生 `Promise` 实例。 */
const isThenable = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T> | undefined)?.then === 'function';

/** 数据库尚未就绪时 {@link useRxDB} / `inject(RxDB)` 的报错文案。 */
const NOT_READY_MESSAGE =
  'RxDB is not ready yet: the source passed to provideRxDB() is still resolving. ' +
  'Await it in an app initializer, or read it with useRxDBOptional() and render a loading state.';

/** holder 的对外形状；仅供本模块的 providers 使用，不出包。 */
interface RxDBHolder {
  /** 等待数据库就绪。**永不 reject** —— 失败被记下，改由 {@link RxDBHolder.require} 抛出。 */
  readonly ready: () => Promise<void>;
  /** 取已就绪实例；未就绪或创建失败时抛错。 */
  readonly require: () => RxDB;
  /** 取已就绪实例；未就绪或创建失败时返回 `undefined`。 */
  readonly optional: () => RxDB | undefined;
}

const RXDB_HOLDER = new InjectionToken<RxDBHolder>('RXDB_HOLDER');

/**
 * 解析 source 并接管（或不接管）它的生命周期。
 *
 * @remarks
 * **所有权规则：provider 只销毁自己造的东西。** 传进来的是工厂或 Promise，实例就是
 * 本 provider 造/等来的，注入器销毁时负责 `disconnectAll()`；传进来的是一个已就绪实例，
 * 它归调用方所有，本 provider 不碰 —— 否则一个模块级单例会被某个子注入器的销毁顺手断掉。
 * 这条规则三端逐字相同。
 */
const createHolder = (source: RxDBSource, destroyRef: DestroyRef): RxDBHolder => {
  const owned = typeof source === 'function' || isThenable(source);
  const produced = typeof source === 'function' ? source() : source;

  let instance: RxDB | undefined;
  let failure: unknown;

  // 失败在这里被吸收：ready() 交给 provideAppInitializer，而 initializer 一旦 reject，
  // Angular 会中止 bootstrap —— 组件树不渲染、窗口全白，为这种失败准备的应用内诊断面板
  // 反而被失败本身挡在门外。所以错误留到 require() 再抛，那时页面已经渲染出来了。
  const ready: Promise<void> = isThenable(produced)
    ? Promise.resolve(produced).then(
        database => void (instance = database),
        error => void (failure = error)
      )
    : Promise.resolve(void (instance = produced));

  if (owned) {
    destroyRef.onDestroy(() => {
      // 销毁可能早于 resolve：挂在 ready 之后才不会漏掉「还在建库时就被销毁」这一路。
      void ready
        .then(() => instance?.disconnectAll())
        .catch(error => console.error('RxDB shutdown failed', error));
    });
  }

  const require = (): RxDB => {
    if (failure !== undefined) throw failure;
    if (instance === undefined) throw new Error(NOT_READY_MESSAGE);
    return instance;
  };

  return { ready: () => ready, require, optional: () => instance };
};

/**
 * 配置 Angular 注入器使用的 RxDB 实例。
 *
 * @param source - 数据库实例、Promise，或返回二者之一的工厂
 * @returns Angular 环境 providers
 *
 * @remarks
 * 同步的 source（实例或返回实例的工厂）解析后 `inject(RxDB)` 立即可用，与改动前一致。
 * 异步的 source 由本函数一并注册的 `provideAppInitializer` 在 **bootstrap 之前**等完，
 * 因此根注入器下 `inject(RxDB)` 依旧是同步的 —— 调用方不必自己写 initializer。
 *
 * 注意 `provideAppInitializer` 只在**根**环境注入器生效。把本函数用在路由级 providers 上时，
 * 异步 source 不会有人替你等，`inject(RxDB)` 会抛 {@link NOT_READY_MESSAGE}；
 * 这种场景请改用 {@link useRxDBOptional} 并自行处理 loading。
 *
 * 生命周期见 {@link createHolder} 的「所有权规则」。
 *
 * @example
 * ```typescript
 * // 同步工厂（最常见）
 * provideRxDB(setup_rxdb)
 *
 * // 动态 import：桌面分支不进 web bundle
 * provideRxDB(async () => (await import('./setup_rxdb_desktop')).default())
 * ```
 */
export const provideRxDB = (source: RxDBSource): EnvironmentProviders =>
  makeEnvironmentProviders([
    { provide: RXDB_HOLDER, useFactory: () => createHolder(source, inject(DestroyRef)) },
    provideAppInitializer(() => inject(RXDB_HOLDER).ready()),
    { provide: RxDB, useFactory: () => inject(RXDB_HOLDER).require() }
  ]);

/**
 * 读取当前注入器中的 RxDB 实例。
 *
 * @returns 已就绪的 RxDB 实例
 * @throws 没有 {@link provideRxDB}、数据库尚未就绪，或创建失败时抛错
 *
 * @remarks
 * 等价于 `inject(RxDB)`，存在的意义是与 React / Vue 的 `useRxDB()` 同名同语义。
 * 必须在注入上下文中调用。
 */
export const useRxDB = (): RxDB => inject(RxDB);

/**
 * 读取当前注入器中的 RxDB 实例，未就绪时返回 `undefined`。
 *
 * @returns 已就绪的 RxDB 实例；尚未就绪或创建失败时为 `undefined`
 *
 * @remarks
 * 与 {@link useRxDB} 的区别只有「没有时怎么办」：这个不抛错，用于异步 source 下
 * 渲染 loading 态。没有 {@link provideRxDB} 时同样返回 `undefined` 而不抛错。
 * 必须在注入上下文中调用。
 */
export const useRxDBOptional = (): RxDB | undefined => inject(RXDB_HOLDER, { optional: true })?.optional();
