/**
 * 序列号生成器类
 * 生成单调递增的序列号，用于事件排序
 */
export class SequenceGenerator {
  #current = 0;

  /** 获取当前序列号（不递增） */
  get current(): number {
    return this.#current;
  }

  /** 获取下一个序列号 */
  next(): number {
    return ++this.#current;
  }

  /** 重置序列号 */
  reset(): void {
    this.#current = 0;
  }
}
