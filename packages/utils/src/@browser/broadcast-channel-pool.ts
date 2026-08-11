import { Observable, Observer, shareReplay } from 'rxjs';

export interface BroadcastTopic<T = unknown> {
  message$: Observable<T>;
  emit: (message: T) => void;
  /**
   * 关闭本 topic 持有的 channel。幂等；关闭后 `emit` 是空操作。
   *
   * @remarks
   * UTL-009：以前 channel 的生命周期绑在 RxJS observer 计数上（最后一次退订就 close），
   * 于是「谁拥有这个资源」是隐式的、且会被订阅时机意外触发。现在改为**显式所有权**。
   */
  close: () => void;
}

const requireBroadcastChannel = (): typeof BroadcastChannel => {
  const ctor = globalThis.BroadcastChannel;
  if (typeof ctor !== 'function') {
    throw new Error('BroadcastChannel is not available in this environment');
  }
  return ctor;
};

/**
 * 创建一个 BroadcastChannel 主题。
 *
 * @param event - 频道名称
 * @returns 消息流、发送方法与显式关闭方法
 *
 * @remarks
 * 语义与原生 `BroadcastChannel` **完全一致**：
 *
 * - 同一 realm 里对同一个 `event` 调用两次，得到两个**独立参与者**，彼此收得到对方的消息；
 * - **发送者收不到自己发的消息**（原生就不向发送对象自投递）；
 * - 跨 realm（其他 tab / worker）照常投递。
 *
 * UTL-009：原实现按**频道名**在池里复用同一个原生 channel 实例，
 * 于是同 realm 的两个 topic 共享同一个发送对象 —— 而原生不自投递，
 * **A 永远收不到 B 的消息**。两个独立模块无法通过这个公开抽象通信。
 *
 * 修法不是「加本地 fan-out」（那会引入自回声，属公开语义变更），
 * 而是**别再共享发送对象**：每个 topic 各自持有一个 channel。
 * 这样既恢复了同 realm 投递，又不改变「发送者是否收到自身消息」这个语义。
 *
 * 另外两处一并修掉：
 *
 * - 原先最后一次退订会 `close()` 并删缓存，此后同 topic `emit()` **同步抛错**。
 *   这不是假设性风险 —— `RxDBTabsGateway.init()` 的 `removeEventListener` 之所以必填，
 *   注释写的理由正是「残留监听器在 topic 被回收后再 emit 会抛错并冒泡到保存路径」，
 *   **下游已经为它加过一道防御性耦合**。现在 emit 不再抛错。
 * - channel 所有权不再绑在 observer 计数上，改为显式 `close()`。
 */
export const createBroadcastTopic = <T = unknown>(event: string): BroadcastTopic<T> => {
  const BroadcastChannelConstructor = requireBroadcastChannel();
  const channel = new BroadcastChannelConstructor(event);
  let closed = false;

  const message$ = new Observable<T>((observer: Observer<T>) => {
    const listener = (messageEvent: MessageEvent<T>) => {
      try {
        observer.next(messageEvent.data);
      } catch (error) {
        observer.error(error);
      }
    };
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  return {
    message$,
    emit: (message: T) => {
      // 关闭后静默忽略：抛错只会把「资源已回收」这件事炸到调用方的业务路径上，
      // 而调用方通常正处在 destroy / 清理流程里。
      if (closed) return;
      channel.postMessage(message);
    },
    close: () => {
      if (closed) return;
      closed = true;
      channel.close();
    }
  };
};

/**
 * 具名 topic 注册表。
 *
 * @remarks
 * 保留它是为了兼容既有调用点：`pool.on(name)` / `pool.emit(name, data)`
 * 共用**同一个**参与者，因此 `pool.emit` 不会被同名的 `pool.on` 收到（原生语义），
 * 但会被任何独立的 {@link createBroadcastTopic} 实例收到。
 *
 * 新代码建议直接用 {@link createBroadcastTopic} —— 它的所有权与生命周期是显式的。
 */
class BroadcastChannelPool {
  #topics = new Map<string, BroadcastTopic<unknown>>();

  /**
   * 发送消息到指定频道。
   *
   * @remarks
   * UTL-009：原实现在频道没有订阅者时**抛出 `BroadcastChannel "x" not found`**——
   * 发送方因此被迫依赖「必须先有人订阅」这个隐式顺序。现在按需创建，不再抛。
   */
  emit<T = unknown>(event: string, data: T): void {
    this.#topic<T>(event).emit(data);
  }

  /** 订阅指定频道的消息。 */
  on<T = unknown>(event: string): Observable<T> {
    return this.#topic<T>(event).message$;
  }

  /** 关闭并移除指定频道；幂等。 */
  close(event: string): void {
    const topic = this.#topics.get(event);
    if (!topic) return;
    this.#topics.delete(event);
    topic.close();
  }

  #topic<T>(event: string): BroadcastTopic<T> {
    const existing = this.#topics.get(event);
    if (existing) return existing as BroadcastTopic<T>;
    const created = createBroadcastTopic<T>(event);
    this.#topics.set(event, created as BroadcastTopic<unknown>);
    return created;
  }
}

export const pool = new BroadcastChannelPool();
