import { BOARD_I18N_NAMESPACE, createBoardI18n, type BoardMessageKey } from '@aiao/rxdb-plugin-board';

/**
 * 看板静态文案运行时（board 命名空间目录，缺省跟随宿主语言、缺目录回退 zh-Hans）。
 *
 * @remarks
 * `BoardShellComponent` / `BoardViewComponent` 经本模块取翻译函数，
 * 测试可 `vi.mock` 本模块注入固定语言的 `I18n` 运行时（见 `__tests__`）。
 */
export const boardI18n = createBoardI18n();

/**
 * 绑定 board 命名空间的翻译函数：组件与模板直接用 `boardT('key')` / `boardT('key', { title })`。
 *
 * @remarks
 * `createBoardI18n` 建的运行时默认命名空间是 app，直接 `boardI18n.t('key')` 会渲染键本身；
 * 这里固定传 {@link BOARD_I18N_NAMESPACE}。
 * @param key - 看板文案目录键（{@link BoardMessageKey}）。
 * @param params - ICU 参数（如 `{ title }`、`{ count }`）。
 * @returns 当前语言下的纯文本文案。
 */
export const boardT = (key: BoardMessageKey, params?: Record<string, unknown>): string =>
  boardI18n.t(key, params ?? {}, BOARD_I18N_NAMESPACE);
