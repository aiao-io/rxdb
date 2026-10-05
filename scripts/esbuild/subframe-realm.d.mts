import type { Plugin } from 'esbuild';

/**
 * 将 Emscripten glue 的全局对象绑定到探针已确认的真实 realm。
 *
 * @param binding - banner 声明的真实全局对象变量名
 * @returns 仅改写 Emscripten glue 的 esbuild 插件
 */
export function subframeRealmPlugin(binding: string): Plugin;
