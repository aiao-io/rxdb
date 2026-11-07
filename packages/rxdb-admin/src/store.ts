import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

/**
 * 同步快照 + 订阅源。
 *
 * @remarks
 * 三端绑定把它桥接到各自的响应式原语：React 的 `useSyncExternalStore`、Vue 的 `shallowRef`、
 * Angular 的 `toSignal`。`value` 必须在输入未变时保持引用稳定。
 */
export interface ReadableStore<T> {
  /** 当前值的同步快照。 */
  readonly value: T;
  /** 回放当前值并推送后续变更的可观察对象。 */
  readonly changes$: Observable<T>;
  /**
   * 订阅后续变更，不回放当前值。
   * @param listener - 变更回调。
   * @returns 退订函数。
   */
  subscribe(listener: (value: T) => void): () => void;
}

/** 可写的响应式存储，按引用去重。 */
export class Store<T> implements ReadableStore<T> {
  readonly #subject: BehaviorSubject<T>;
  /** 回放当前值并推送后续变更。 */
  readonly changes$: Observable<T>;

  /** 当前值的同步快照。 */
  get value(): T {
    return this.#subject.value;
  }

  /**
   * 创建存储。
   * @param initial - 初始值。
   */
  constructor(initial: T) {
    this.#subject = new BehaviorSubject(initial);
    this.changes$ = this.#subject.pipe(distinctUntilChanged());
  }

  /**
   * 写入新值；与当前值同引用时不通知。
   * @param next - 新值。
   */
  set(next: T): void {
    if (Object.is(next, this.#subject.value)) return;
    this.#subject.next(next);
  }

  /**
   * 以当前值计算下一个值。
   * @param project - 纯函数。
   */
  update(project: (current: T) => T): void {
    this.set(project(this.#subject.value));
  }

  /**
   * 订阅后续变更。
   * @param listener - 变更回调。
   * @returns 退订函数。
   */
  subscribe(listener: (value: T) => void): () => void {
    let first = true;
    const subscription = this.changes$.subscribe(value => {
      if (first) {
        first = false;
        return;
      }
      listener(value);
    });
    return () => subscription.unsubscribe();
  }
}

type ValuesOf<S extends readonly ReadableStore<unknown>[]> = {
  [K in keyof S]: S[K] extends ReadableStore<infer V> ? V : never;
};

/**
 * 由多个存储派生只读存储。
 *
 * @remarks
 * 惰性求值并按输入引用缓存：任一源值的引用没变就返回上一次的结果，
 * 投影结果引用相同则不通知，满足 `useSyncExternalStore` 对快照稳定性的要求。
 * @param sources - 源存储。
 * @param project - 纯投影函数。
 * @returns 派生存储。
 */
export function derive<const S extends readonly ReadableStore<unknown>[], R>(
  sources: S,
  project: (...values: ValuesOf<S>) => R
): ReadableStore<R> {
  let lastInputs: unknown[] | undefined;
  let lastResult: R;
  const read = (): R => {
    const inputs = sources.map(source => source.value);
    const unchanged = lastInputs !== undefined && inputs.every((input, index) => Object.is(input, lastInputs?.[index]));
    if (!unchanged) {
      lastInputs = inputs;
      lastResult = project(...(inputs as ValuesOf<S>));
    }
    return lastResult;
  };
  const changes$ = combineLatest(sources.map(source => source.changes$)).pipe(map(read), distinctUntilChanged());
  return {
    get value() {
      return read();
    },
    changes$,
    subscribe(listener) {
      let first = true;
      const subscription = changes$.subscribe(value => {
        if (first) {
          first = false;
          return;
        }
        listener(value);
      });
      return () => subscription.unsubscribe();
    }
  };
}
