/**
 * 默认 Dock 的入口与顺序（ADESK-US-205 AC#9 的对照基线）。清单的 `defaultPinned` 生成默认布局之前，Dock 是
 * 硬编码数组，这里逐项固化当时的顺序：改动 Dock 的实现不得改变首次使用时用户看到的入口与顺序。
 * 废纸篓在分隔线之后。
 */
export const DEFAULT_DOCK_APPS = [
  'finder',
  'launchpad',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'notes',
  'calendar',
  'music',
  'terminal',
  'vscode',
  'calculator',
  'settings'
];
export const DEFAULT_DOCK_TRAILING = ['trash'];

/** Dock 图标的 `data-app` 顺序（含临时图标），按屏幕上从左到右。 */
export const dockEntries = page =>
  page.evaluate(() => [...document.querySelectorAll('#dock .di')].map(node => node.getAttribute('data-app')));

/** 实际顺序与期望顺序的差异；一致时为空数组，失败时输出里直接看得到差在哪。 */
const orderDiff = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`实际 ${actual.join(',')}`, `期望 ${expected.join(',')}`];

/** Dock（ADESK-US-205 阶段 C、D）：默认布局、固定与取消固定、运行态、持久化与修复、拖放、键盘。 */
export const dock = {
  name: 'dock',
  description: 'Dock：默认入口与顺序',
  keys: ['dock.defaultOrder', 'dock.defaultDivider'],
  async run(session) {
    const { page } = session;
    await session.openDesktop();

    /* AC#9：没有已存布局时，入口与顺序和硬编码时期逐项一致。 */
    const expected = [...DEFAULT_DOCK_APPS, ...DEFAULT_DOCK_TRAILING];
    const defaultOrder = orderDiff(await dockEntries(page), expected);

    /* 分隔线恰好一条，夹在设置与废纸篓之间。 */
    const defaultDivider = await page.evaluate(() => {
      const dividers = [...document.querySelectorAll('#dock .divider')];
      const left = selector => document.querySelector(selector)?.getBoundingClientRect().left ?? NaN;
      const x = dividers[0]?.getBoundingClientRect().left ?? NaN;
      return (
        dividers.length === 1 && left('#dock .di[data-app="settings"]') < x && x < left('#dock .di[data-app="trash"]')
      );
    });

    return { dock: { defaultOrder, defaultDivider } };
  }
};
