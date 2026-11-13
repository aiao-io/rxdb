/**
 * 核对启动台的实际条目与冒烟声明的应用（ADESK-US-008「清单绑定」）：
 *
 * - `uncovered`：启动台有、冒烟没声明——登记表新增了应用而冒烟没覆盖；
 * - `unknown`：冒烟声明了、启动台没有——冒烟里多出了登记表没有的应用。
 *
 * 启动台由登记表渲染，所以这是登记表与冒烟之间的核对：任何一边漂移都使检查失败并指出应用 id。
 *
 * @param {readonly { id: string }[]} entries 启动台里的实际条目
 * @param {{ opened: readonly string[], elsewhere: readonly string[] }} declared
 *   `opened`：由本组逐个从启动台打开的应用；`elsewhere`：由别的检查组覆盖、本组不打开的应用
 */
export function compareApps(entries, { opened, elsewhere }) {
  const declared = new Set([...opened, ...elsewhere]);
  const present = new Set(entries.map(entry => entry.id));
  return {
    uncovered: [...present].filter(id => !declared.has(id)),
    unknown: [...declared].filter(id => !present.has(id))
  };
}

/**
 * 读启动台的全部条目：逐页翻（方向键），直到最后一页。启动台必须已经打开且搜索框拿到焦点。
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ id: string, name: string }[]>}
 */
export async function readLaunchpadEntries(page) {
  const entries = new Map();
  for (let turn = 0; turn < 20; turn++) {
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('#lpad .app[data-app]')].map(node => ({
        id: node.getAttribute('data-app'),
        name: node.querySelector('.nm')?.textContent?.trim() ?? ''
      }))
    );
    for (const entry of visible) if (!entries.has(entry.id)) entries.set(entry.id, entry);
    const lastPage = await page.evaluate(() => {
      const dots = [...document.querySelectorAll('#lpad [data-ldots] i')];
      return dots.length === 0 || dots.at(-1)?.classList.contains('on') === true;
    });
    if (lastPage) break;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
  }
  return [...entries.values()];
}
