/**
 * 检测当前运行环境是否为浏览器环境
 * 通过检查全局 window 对象是否存在来判断
 *
 * **Constant:**  {boolean} IS_BROWSER - 是否运行在浏览器环境中
 * @example
 * if (IS_BROWSER) {
 *   // 浏览器环境下的代码
 *   console.log('在浏览器中运行');
 * } else {
 *   // Node.js 或其他环境
 *   console.log('不在浏览器中运行');
 * }
 * **注意：** 该检测基于 window 对象的存在性，在某些特殊环境中可能不准确
 * **注意：** 在 SSR (服务端渲染) 环境中，此值在服务端为 false，在客户端为 true
 */
export const IS_BROWSER: boolean = typeof window === 'object';
