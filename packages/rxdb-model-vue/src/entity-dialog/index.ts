/**
 * 对话框外壳组件导出。
 *
 * 与 Angular 侧 `entity-dialog/index.ts` 对齐：
 * - {@link EntityDialog} — 标题栏 + 缩放 + 全屏 + 关闭的对话框外壳（含投影内容）；
 * - 内置浮层宿主 {@link DialogPortal} 与对话框上下文为包内实现（CDK 替代），
 *   不随包公开 —— 宿主应用不直接打开它。
 */
export { default as EntityDialog } from './EntityDialog.vue';
