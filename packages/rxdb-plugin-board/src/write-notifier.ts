import { Observable, Subject } from 'rxjs';

/**
 * @fileoverview 看板写入状态机（US-535 失败恢复）
 *
 * 移动与本列排序的落库结果经这里发布：成功发布已提交事件，失败发布原因并要求
 * 调用方重查已提交数据（UI 据此恢复显示，不复活已删除邻居、不静默重试）。
 */

/** 写入状态机事件：移动与本列排序的落库结果（成功已提交 / 失败带原因）。 */
export type BoardWriteEvent =
  | { readonly kind: 'move-committed'; readonly taskId: string }
  | { readonly kind: 'move-failed'; readonly taskId: string; readonly reason: string }
  | { readonly kind: 'column-move-committed'; readonly columnId: string }
  | { readonly kind: 'column-move-failed'; readonly columnId: string; readonly reason: string }
  | { readonly kind: 'sort-committed'; readonly columnId: string; readonly written: boolean }
  | { readonly kind: 'sort-failed'; readonly columnId: string; readonly reason: string };

/** 写入事件通知器：三端绑定与测试订阅同一份事件流。 */
export class BoardWriteNotifier {
  readonly #events = new Subject<BoardWriteEvent>();

  readonly events$: Observable<BoardWriteEvent> = this.#events.asObservable();

  next(event: BoardWriteEvent): void {
    this.#events.next(event);
  }

  complete(): void {
    this.#events.complete();
  }
}

/** 把任意错误归纳成可展示的原因：稳定错误码优先（`reason` / `code`），不解析 message 文本。 */
export const describeBoardFailure = (error: unknown): string => {
  if (error instanceof Error) {
    const code = (error as { readonly reason?: unknown }).reason ?? (error as { readonly code?: unknown }).code;
    if (typeof code === 'string' && code !== '') return code;
    return error.message;
  }
  return String(error);
};
