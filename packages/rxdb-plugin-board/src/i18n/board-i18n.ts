import { BOARD_I18N_NAMESPACE, type BoardMessageKey } from './messages.js';
import { createBoardI18n } from './runtime.js';

/**
 * 核心包内部共享的静态看板运行时。
 *
 * @remarks
 * 与三个框架绑定包的 `board-i18n` 同一口径：随浏览器语言一次性解析，没有运行时
 * 语言切换；确认框、错误说明与截止日文字等由核心产出的文案统一走这份运行时。
 */
export const boardI18n = createBoardI18n();

/** 绑定 board 命名空间的翻译函数；与三个框架绑定包的 `boardT` 同口径。 */
export const boardT = (key: BoardMessageKey, params?: Record<string, unknown>): string =>
  boardI18n.t(key, params ?? {}, BOARD_I18N_NAMESPACE);
