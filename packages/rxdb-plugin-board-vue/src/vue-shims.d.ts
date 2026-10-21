/**
 * Vue SFC 的 ambient 声明（api-surface 分析器经 tsconfig program 解析 `export { default as BoardView } from './board-view.vue'` 时使用；
 * vite 构建本身由 @vitejs/plugin-vue 处理，不读本文件）。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
