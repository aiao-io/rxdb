/**
 * 真实键盘验收清单（ADESK-US-107 AC#8）：能力矩阵「快捷键」表里的每个组合，按下后页面要收到什么、行为要怎样。
 * 纯数据加格式化，由 `verify-keyboard.mjs` 在本机真实键盘上驱动；`checklist.spec.mjs` 校验它覆盖了能力矩阵里的全部组合。
 *
 * @typedef {{
 *   id: string,
 *   combo: string,
 *   press: string,
 *   description: string,
 *   prepare: 'clean' | 'window' | 'two-windows' | 'finder' | 'spotlight' | 'launchpad',
 *   effect: 'spotlight-open' | 'launchpad-open' | 'overlay-closed' | 'window-closed' | 'window-minimized' | 'app-quit' | 'window-cycled' | 'new-window'
 * }} Shortcut
 */

/** @type {readonly Shortcut[]} */
export const SHORTCUTS = [
  {
    id: 'cmd-k',
    combo: '⌘K',
    press: 'Command + K',
    description: '打开聚焦搜索',
    prepare: 'clean',
    effect: 'spotlight-open'
  },
  {
    id: 'cmd-space',
    combo: '⌘Space',
    press: 'Command + 空格（macOS 默认留给系统聚焦搜索，到不了页面属预期，需在能力矩阵标注）',
    description: '打开聚焦搜索',
    prepare: 'clean',
    effect: 'spotlight-open'
  },
  {
    id: 'f4',
    combo: 'F4',
    press: 'F4（笔记本键盘可能要按 fn + F4）',
    description: '打开启动台',
    prepare: 'clean',
    effect: 'launchpad-open'
  },
  {
    id: 'esc',
    combo: 'Esc',
    press: 'Esc（此刻聚焦搜索已替你打开）',
    description: '关闭聚焦搜索',
    prepare: 'spotlight',
    effect: 'overlay-closed'
  },
  {
    id: 'cmd-w',
    combo: '⌘W',
    press: 'Command + W（浏览器通常占用它来关标签页）',
    description: '关闭前台窗口',
    prepare: 'window',
    effect: 'window-closed'
  },
  {
    id: 'cmd-m',
    combo: '⌘M',
    press: 'Command + M（浏览器可能占用它来最小化浏览器窗口）',
    description: '最小化前台窗口',
    prepare: 'window',
    effect: 'window-minimized'
  },
  {
    id: 'cmd-q',
    combo: '⌘Q',
    press: 'Command + Q（浏览器通常占用它来退出浏览器；如退出了，脚本会重新打开）',
    description: '退出前台应用',
    prepare: 'window',
    effect: 'app-quit'
  },
  {
    id: 'cmd-backtick',
    combo: '⌘`',
    press: 'Command + `（反引号键，macOS 默认用它在同一应用的窗口之间切换）',
    description: '循环切换窗口',
    prepare: 'two-windows',
    effect: 'window-cycled'
  },
  {
    id: 'cmd-n',
    combo: '⌘N',
    press: 'Command + N（浏览器通常占用它来新开浏览器窗口）',
    description: '为前台应用新开一个窗口',
    prepare: 'finder',
    effect: 'new-window'
  }
];

/**
 * 一次按键的结果：`reached` 页面是否收到了按键；`works` 收到后行为是否正确（没收到时为 `null`）；
 * `note` 是脚本观察到的补充（例如标签页被关闭）。
 *
 * @typedef {{ id: string, combo: string, reached: boolean, works: boolean | null, note?: string }} KeyResult
 */

/**
 * 把一组结果整理成能力矩阵与验收台账要的结论：每个组合落在三类之一。
 *
 * @param {readonly KeyResult[]} results
 */
export function classify(results) {
  return results.map(result => {
    if (!result.reached) return { ...result, verdict: '没到达页面（被浏览器或系统占用）' };
    return { ...result, verdict: result.works ? '到达且行为正确' : '到达但行为不对' };
  });
}

/** 验收失败的组合：到达了却没有正确的行为。没到达的不算失败，要在能力矩阵里标注并给出替代入口。 */
export const brokenOnes = results => classify(results).filter(result => result.reached && !result.works);

/**
 * 整理成 Markdown 表（贴进验收台账）。
 *
 * @param {readonly KeyResult[]} results
 * @param {{ browser: string, platform: string, date: string }} environment
 */
export function formatReport(results, environment) {
  const rows = classify(results).map(result => `| ${result.combo} | ${result.verdict} | ${result.note ?? ''} |`);
  return [
    `真实键盘实测：${environment.browser}，${environment.platform}，${environment.date}`,
    '',
    '| 组合 | 结论 | 备注 |',
    '| --- | --- | --- |',
    ...rows
  ].join('\n');
}
