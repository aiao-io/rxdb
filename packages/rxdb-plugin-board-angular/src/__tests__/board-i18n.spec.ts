import { BOARD_I18N_NAMESPACE, boardCatalogs } from '@aiao/rxdb-plugin-board';
import { describe, expect, it } from 'vitest';

import { boardI18n, boardT } from '../board-i18n.js';

/**
 * 看板 Angular 文案适配器：`t` 必须固定走 board 命名空间——`createBoardI18n` 建的
 * 运行时默认命名空间是 app，不绑定会把键本身渲染给用户。
 * 运行时语言随宿主（happy-dom 为 en），断言对目录查表，不断言具体语言。
 */
describe('看板 Angular 文案适配器', () => {
  it('目录只含 board 命名空间；t 在运行时当前语言的 board 目录里命中', () => {
    expect(boardCatalogs.every(catalog => catalog.namespace === BOARD_I18N_NAMESPACE)).toBe(true);
    const messages = boardCatalogs.find(catalog => catalog.locale === boardI18n.locale)?.messages;
    expect(messages).toBeDefined();
    expect(boardT('common.cancel')).toBe(messages!['common.cancel']);
    expect(boardT('view.detail.statusSaved')).toBe(messages!['view.detail.statusSaved']);
    // 命名空间没绑定时会渲染键本身：这里必须不等于键
    expect(boardT('shell.loading')).not.toBe('shell.loading');
  });

  it('ICU 参数透传进模板', () => {
    const messages = boardCatalogs.find(catalog => catalog.locale === boardI18n.locale)?.messages;
    expect(boardT('view.column.count', { count: 4 })).toBe(messages!['view.column.count'].replace('{count}', '4'));
    expect(boardT('view.toast.sortedBy', { field: '截止日', column: 'To do' })).toBe(
      messages!['view.toast.sortedBy'].replace('{field}', '截止日').replace('{column}', 'To do')
    );
  });
});
