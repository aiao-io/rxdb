/**
 * @fileoverview 浏览器特定 API 封装模块
 *
 * @module @browser
 */

/**
 * 广播频道池
 */
export * from './broadcast-channel-pool.js';

/**
 * 文档站 / 无界宿主主题协议
 */
export * from './host-theme.js';

/**
 * 空闲计时器
 */
export * from './IdleTimer.js';

/**
 * Leader 选举
 */
export * from './leader-election.js';

/**
 * OPFS 检测
 */
export * from './opfs-detection.js';

/**
 * OPFS 安全重命名
 */
export * from './opfs-rename.js';
export * from './opfs-route-sync.js';

/**
 * 分块执行
 */
export * from './perform-chunk.js';

/**
 * 命名空间持久化状态注册表
 * 三端 useState / usePersistedState 的框架无关内核
 */
export * from './persisted-state.js';

/**
 * requestIdleCallback 兼容实现。
 */
export * from './requestIdleCallbackPolyfill.js';

/**
 * 无界 Shadow DOM 的 daisyUI 样式改写
 */
export * from './shadow-css.js';
