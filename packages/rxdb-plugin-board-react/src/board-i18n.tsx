import { BOARD_I18N_NAMESPACE, createBoardI18n, type BoardMessageKey } from '@aiao/rxdb-plugin-board';

/**
 * 看板文案静态运行时：宿主没有自己的 `I18n` 运行时（也未把 `boardCatalogs` 合入）时使用，
 * 缺省跟随宿主语言（`navigator.language`），无匹配时回退简体中文。
 *
 * @remarks
 * 组件一律经 {@link boardT} 取文案；测试可以 `vi.mock` 本模块注入指定语言的运行时。
 */
export const boardI18n = createBoardI18n();

/**
 * 绑定看板命名空间的翻译函数（目录键集合见核心包 {@link boardZhMessages}）。
 * @param key - 看板文案键。
 * @param params - ICU 插值参数（如 `{ title }`、`{ count }`）。
 * @returns 当前语言下的文案。
 */
export const boardT = (key: BoardMessageKey, params: Record<string, unknown> = {}): string =>
  boardI18n.t(key, params, BOARD_I18N_NAMESPACE);
