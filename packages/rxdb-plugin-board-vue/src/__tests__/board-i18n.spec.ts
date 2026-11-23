import { describe, expect, it } from 'vitest';

import { boardI18n } from '../board-i18n.js';

/**
 * board-i18n 适配器（Vue 绑定）：目录以 `board` 命名空间发布，而 `I18n` 实例缺省命名空间是 `app`，
 * `t` 必须固定解析 board 命名空间——解析失败会原样返回键，这里断言目录键解析出真实文案
 * （具体语言随宿主语言，happy-dom 缺省 en-US、未知语言回退 zh-Hans）。
 */
describe('board-i18n（Vue 绑定文案适配器）', () => {
  it('目录键经 board 命名空间解析出文案而非键本身', () => {
    for (const key of [
      'common.cancel',
      'shell.startup.heading',
      'view.banner.retry',
      'view.header.selectBoard',
      'view.column.overdue'
    ]) {
      expect(boardI18n.t(key, { count: 1 }), key).not.toBe(key);
    }
    expect(boardI18n.t('common.cancel')).toMatch(/^(取消|Cancel)$/);
  });

  it('带参数键走 ICU 插值', () => {
    expect(boardI18n.t('view.toast.movedToColumn', { column: 'Doing' })).toMatch(
      /^(已移动到「Doing」|Moved to “Doing”)$/
    );
    expect(boardI18n.t('view.toolbar.count', { count: 4 })).toMatch(/^(4 项|4 items)$/);
  });
});
