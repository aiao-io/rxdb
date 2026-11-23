import { BOARD_I18N_NAMESPACE, createBoardI18n } from '@aiao/rxdb-plugin-board';

/**
 * 看板文案静态运行时（Vue 绑定）：
 * 目录以 `board` 命名空间发布，`t(key, params)` 固定解析到该命名空间
 * （核心包约定：翻译用 `i18n.t(key, params, BOARD_I18N_NAMESPACE)`）。
 *
 * @remarks
 * 宿主自带 `I18n` 运行时时由宿主把 `boardCatalogs` 合入目录；本静态运行时只作缺省。
 * 测试可 `vi.mock` 本模块注入 zh-Hans 运行时（导出名保持 `boardI18n`）。
 */
const i18n = createBoardI18n();

export const boardI18n = {
  t: (key: string, params: Record<string, unknown> = {}): string => i18n.t(key, params, BOARD_I18N_NAMESPACE)
};
