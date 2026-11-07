import { computed, Injectable, signal } from '@angular/core';

/**
 * AI 操作并发守卫
 *
 * 管理全局 AI 操作状态，存在未决子分支时禁用新的 AI 操作。
 * 通过 signal 向 UI 提供实时状态。
 */
@Injectable()
export class AiOperationGuardService {
  /** 当前未决的 AI 子分支 ID */
  readonly #pendingBranch = signal<string | null>(null);

  /** 未决分支 ID（只读） */
  readonly pendingBranchId = this.#pendingBranch.asReadonly();

  /** 是否可以开始新的 AI 操作 */
  readonly canStartAiOperation = computed(() => this.#pendingBranch() === null);

  /** 阻塞原因文案 */
  readonly blockingReason = computed(() => (this.#pendingBranch() !== null ? '请先处理当前变更' : null));

  /** 设置未决 AI 子分支 */
  setPendingBranch(branchId: string) {
    this.#pendingBranch.set(branchId);
  }

  /** 清除未决 AI 子分支 */
  clearPendingBranch() {
    this.#pendingBranch.set(null);
  }
}
