/**
 * @fileoverview 文档站宿主与无界（wujie）演示子应用之间的共享协议。
 *
 * 宿主是 Docusaurus（React），子应用是 Angular / React / Vue 三端 —— 事件名、payload
 * 形状、路径归一化、竞态收敛若在四处各写一遍必然漂移，所以统一沉在这里。
 *
 * 刻意**不放进** `@aiao/utils`：那是对外发布的包，这套协议还在演进，进了公开面就得按
 * 公开 API 维护。等形态稳定再考虑上提。
 *
 * @module @modules/wujie
 */

/**
 * 宿主 ↔ 子应用的路由同步协议
 */
export * from './host-route.js';

/**
 * 宿主 ↔ 子应用的主题同步协议
 */
export * from './host-theme.js';

/**
 * 无界 Shadow DOM 的 daisyUI 样式改写
 */
export * from './shadow-css.js';
