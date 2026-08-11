import { BehaviorSubject, Observable } from 'rxjs';
import type { HistoryItem } from './VersionManager.interface.js';

/**
 * Redo 栈容量上限（会话内）
 *
 * 超过则丢弃最旧的项（尾部），避免长会话下无界增长。
 */
export const MAX_REDO_STACK_SIZE = 1000;

/**
 * 会话级 Redo 栈
 *
 * 从 HistoryManager 抽离的 redo 栈管理子模块：
 * - 持有内存 `BehaviorSubject<HistoryItem[]>`（不持久化）
 * - 新项总在头部（push 后第一个）
 * - 容量上限 `MAX_REDO_STACK_SIZE`
 *
 * 设计理由：
 * - HistoryManager 原本 1120 行，redo 栈状态 + 操作占 60+ 行且与 history 查询/undo 流程正交
 * - 独立后可单测，并避免泄漏 BehaviorSubject 引用
 *
 * @internal 由 HistoryManager 持有；外部通过 HistoryManager 公共 API 访问
 */
export class RedoStack {
  readonly #subject = new BehaviorSubject<HistoryItem[]>([]);

  /**
   * 当前 redo 栈的可观察流（新项在前）
   */
  get items$(): Observable<HistoryItem[]> {
    return this.#subject.asObservable();
  }

  /**
   * 当前栈快照
   */
  get value(): HistoryItem[] {
    return this.#subject.value;
  }

  /**
   * 将一组历史项压入栈顶（items 在前）
   *
   * 超过 MAX_REDO_STACK_SIZE 时丢弃尾部最旧项。
   */
  push(items: HistoryItem[]): void {
    const merged = [...items, ...this.#subject.value];
    const capped = merged.length > MAX_REDO_STACK_SIZE ? merged.slice(0, MAX_REDO_STACK_SIZE) : merged;
    this.#subject.next(capped);
  }

  /**
   * 按稳定身份（`fingerprint`）移除已应用的项。
   *
   * @param items - 已经 redo 完成、需要出栈的项
   * @returns 实际被移除的项（按栈中原顺序）；不在栈中的项被忽略
   *
   * @remarks
   * **不能用「移除 N 项」代替身份匹配**：作用域 redo 会先按 scope 筛出本作用域的项再应用，
   * 这些项未必位于栈顶。按数量截栈顶会删掉栈头那些**未被 redo** 的项（它们从此丢失），
   * 而真正已 redo 的项仍留在栈里可以被重复执行。
   */
  remove(items: HistoryItem[]): HistoryItem[] {
    const targets = new Set(items.map(item => item.fingerprint));
    const current = this.#subject.value;
    const removed = current.filter(item => targets.has(item.fingerprint));
    if (removed.length === 0) return removed;
    this.#subject.next(current.filter(item => !targets.has(item.fingerprint)));
    return removed;
  }

  /**
   * 清空栈
   */
  clear(): void {
    this.#subject.next([]);
  }
}
