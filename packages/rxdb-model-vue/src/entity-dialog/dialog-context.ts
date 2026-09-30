import type { InjectionKey } from 'vue';

/**
 * 对话框上下文：由内置 {@link DialogPortal}（CDK Dialog 的包内替代）提供给
 * 对话框内容组件（EntityDetail / EntityDialog），等价于 Angular 侧 CDK 的 `DialogRef`。
 *
 * 内容组件在 `close()` 时携带结果（如 `'saved'`），宿主据此决定是否刷新列表。
 */
export interface EntityDialogContext {
  /**
   * 关闭对话框。
   *
   * @param result - 关闭结果（如 `'saved'`）；省略为普通取消关闭
   */
  close(result?: unknown): void;
}

/**
 * 对话框上下文注入键。
 *
 * @internal 包内对话框编排用，不随包公开导出；宿主应用无需感知。
 */
export const ENTITY_DIALOG_CONTEXT: InjectionKey<EntityDialogContext> = Symbol('ENTITY_DIALOG_CONTEXT');
