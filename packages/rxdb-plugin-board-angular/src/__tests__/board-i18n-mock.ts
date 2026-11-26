import { BOARD_I18N_NAMESPACE, createBoardI18n } from '@aiao/rxdb-plugin-board';

/**
 * zh-Hans 看板运行时与 `board-i18n` 模块的 mock 工厂：组件文案迁入目录后，
 * 渲染用例经 `vi.mock('../board-i18n.js', async () => { const { boardI18nZhMock } = await import('./board-i18n-mock.js'); return boardI18nZhMock(); })`
 * 注入中文运行时，断言保持 zh 逐字文案（e2e 以 zh-CN 验收）。
 * 工厂里只动态导入本包相对模块，不动态导入懒加载库（module-boundaries 规则）。
 */
export const boardI18nZhMock = (): {
  readonly boardI18n: ReturnType<typeof createBoardI18n>;
  readonly boardT: (key: string, params?: Record<string, unknown>) => string;
} => {
  const i18n = createBoardI18n('zh-Hans');
  return {
    boardI18n: i18n,
    boardT: (key, params = {}) => i18n.t(key, params, BOARD_I18N_NAMESPACE)
  };
};
