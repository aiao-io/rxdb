import type { SerializedEvent } from './types.js';

/** 默认最大缓冲区大小 */
const DEFAULT_MAX_SIZE = 100;

/**
 * 事件缓冲区
 * 在 DevTools 断开连接时缓存事件，重连后 flush
 *
 * FIFO 策略：当缓冲区满时，移除最旧的事件
 */
export class EventBuffer {
  #buffer: SerializedEvent[] = [];
  #maxSize: number;

  /** 当前缓冲区大小 */
  get length(): number {
    return this.#buffer.length;
  }

  /** 最大缓冲区大小 */
  get maxSize(): number {
    return this.#maxSize;
  }

  /** 缓冲区是否为空 */
  get isEmpty(): boolean {
    return this.#buffer.length === 0;
  }

  /** 缓冲区是否已满 */
  get isFull(): boolean {
    return this.#buffer.length >= this.#maxSize;
  }

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    if (!Number.isSafeInteger(maxSize) || maxSize <= 0) {
      throw new RangeError('EventBuffer maxSize must be a positive safe integer');
    }
    this.#maxSize = maxSize;
  }

  /** 添加事件到缓冲区 */
  push(event: SerializedEvent): void {
    if (this.#buffer.length >= this.#maxSize) {
      this.#buffer.shift();
    }
    this.#buffer.push(event);
  }

  /** 清空并返回所有缓冲的事件 */
  flush(): SerializedEvent[] {
    const events = [...this.#buffer];
    this.#buffer = [];
    return events;
  }

  /** 清空缓冲区 */
  clear(): void {
    this.#buffer = [];
  }
}
