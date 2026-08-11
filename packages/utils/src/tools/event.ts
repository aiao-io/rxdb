/** 事件名称到事件数据的默认映射。 */
export interface EventMap {
  [eventName: string]: unknown;
}

/** 事件监听器。 */
export type EventListener<T> = (data: T) => void;

export interface IEventDispatcher<Events extends object = EventMap> {
  addEventListener<T extends keyof Events>(type: T, listener: EventListener<Events[T]>): void;
  hasEventListener<T extends keyof Events>(type: T, listener: EventListener<Events[T]>): boolean;
  removeEventListener<T extends keyof Events>(type: T, listener: EventListener<Events[T]>): void;
  dispatchEvent<T extends keyof Events>(type: T, data: Events[T]): void;
  removeAllEventListeners(): void;
}

/**
 * 类型安全的同步事件调度器。
 *
 * 派发语义与 DOM `EventTarget` 对齐：
 * - `dispatchEvent` 对监听器集合取**快照**后再遍历。派发过程中新增的监听器
 *   不会收到本次事件，要等下一次派发；派发过程中移除的监听器**仍会**被本次调用到。
 * - 监听器抛出的异常不被吞掉，直接向调用方冒泡，后续监听器不再执行。
 * - 只有 `addEventListener` 会为事件名建立集合；集合被删空后立即回收该事件名，
 *   避免事件名无界时 Map 持续增长。
 */
export abstract class EventDispatcher<Events extends object = EventMap> implements IEventDispatcher<Events> {
  #listeners = new Map<keyof Events, Set<EventListener<never>>>();

  /**
   * 注册监听器。同一 `listener` 重复注册只保留一份（集合语义）。
   *
   * @param type - 事件名
   * @param listener - 监听器
   */
  addEventListener<T extends keyof Events>(type: T, listener: EventListener<Events[T]>): void {
    const existing = this.#listeners.get(type);
    if (existing) {
      existing.add(listener);
      return;
    }
    this.#listeners.set(type, new Set<EventListener<never>>([listener as EventListener<never>]));
  }

  /**
   * 查询监听器是否已注册。不会为未知事件名建立集合。
   *
   * @param type - 事件名
   * @param listener - 监听器
   * @returns 是否已注册
   */
  hasEventListener<T extends keyof Events>(type: T, listener: EventListener<Events[T]>): boolean {
    return this.#listeners.get(type)?.has(listener) === true;
  }

  /**
   * 移除监听器。未知事件名或未注册的监听器都是无操作，且不会建立空集合。
   *
   * 若在 `dispatchEvent` 过程中移除，被移除者**仍会**收到本次事件（快照语义）。
   *
   * @param type - 事件名
   * @param listener - 监听器
   */
  removeEventListener<T extends keyof Events>(type: T, listener: EventListener<Events[T]>): void {
    const listeners = this.#listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) this.#listeners.delete(type);
  }

  /**
   * 同步派发事件。
   *
   * 遍历的是快照而非实时集合：监听器在处理过程中 `addEventListener` 不会自喂
   * 本轮迭代（否则单次同步派发可被第三方监听器无限延长，UTL-011）。
   *
   * @param type - 事件名
   * @param data - 事件数据
   * @throws 监听器抛出的任意异常，原样向上冒泡；其后的监听器不再执行
   */
  dispatchEvent<T extends keyof Events>(type: T, data: Events[T]): void {
    const listeners = this.#listeners.get(type);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      (listener as EventListener<Events[T]>)(data);
    }
  }

  /** 清空所有事件名下的全部监听器。 */
  removeAllEventListeners(): void {
    this.#listeners.clear();
  }
}
