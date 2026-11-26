/**
 * 看板随包文案目录与静态运行时。
 *
 * @remarks
 * 目录以 `board` 命名空间发布简体中文（zh-Hans）与英文（en）两套，键集合由
 * {@link boardZhMessages} 唯一确定、{@link boardEnMessages} 以 `satisfies` 对齐。
 * 应用自带 `I18n` 运行时时把 {@link boardCatalogs} 加入 `catalogs`；没有时用
 * {@link createBoardI18n} 建静态运行时。翻译用 `i18n.t(key, params, BOARD_I18N_NAMESPACE)`。
 */
export {
  BOARD_I18N_NAMESPACE,
  boardCatalogs,
  boardEnMessages,
  boardZhMessages,
  type BoardMessageKey
} from './messages.js';
export { createBoardI18n } from './runtime.js';
