import { expect as playwrightExpect } from 'playwright/test';

const expect = playwrightExpect.configure({ timeout: 5_000 });
const preview = '.finder-place-preview';
const placeholder = '.finder-place-placeholder';

/** 从条目中心开始拖动，越过目标条目的中心。 */
async function dragPlace(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, to.y + to.height / 2 + Math.sign(to.y - from.y) * 4, { steps: 12 });
}

export const finderSidebar = {
  name: 'finder-sidebar',
  description: 'Finder 侧栏拖动占位、让位动画、取消与顺序持久化',
  keys: ['finderSidebar.animatesWithPlaceholder', 'finderSidebar.reordersWithoutNavigating', 'finderSidebar.persists'],
  async run(session) {
    const { page, helpers } = session;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await session.openDesktop();
    const finder = helpers.win('finder');
    const favourites = finder.getByRole('group', { name: 'Favourites' });
    const places = favourites.locator('[data-place]');
    const airDrop = favourites.getByRole('button', { name: 'AirDrop' });
    const desktop = favourites.getByRole('button', { name: 'Desktop', exact: true });
    const title = finder.locator('[data-title]');
    const initialTitle = await title.textContent();
    const initialOrder = await places.allTextContents();
    const rowHeight = await airDrop.evaluate(node => getComputedStyle(node).height);
    const expected = ['Recents', 'Desktop', 'AirDrop', ...initialOrder.slice(3)];

    await dragPlace(page, airDrop, desktop);
    await expect(page.locator(preview)).toBeVisible();
    const slot = favourites.locator(placeholder);
    await expect(slot).toBeVisible();
    await expect(slot.locator('.nm')).toHaveText('AirDrop');
    await expect(slot.locator('svg.ico')).toBeVisible();
    await expect(slot).toHaveAttribute('aria-hidden', 'true');
    await expect(slot).toHaveCSS('height', rowHeight);
    await expect(desktop).toHaveCSS('transition-property', /transform/);
    await expect(desktop).not.toHaveCSS('transform', 'none');
    await page.mouse.up();
    await expect(page.locator(preview)).toHaveCount(0);
    await expect(places).toHaveText(expected);
    await expect(title).toHaveText(initialTitle);

    await dragPlace(page, airDrop, desktop);
    await expect(favourites.locator(placeholder)).toBeVisible();
    const outside = await finder.getByRole('toolbar', { name: 'Toolbar' }).boundingBox();
    await page.mouse.move(outside.x + outside.width / 2, outside.y + outside.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(preview)).toHaveCount(0);
    await expect(places).toHaveText(expected);
    await airDrop.click();
    await expect(title).toHaveText('AirDrop');
    await expect(airDrop).toHaveAttribute('aria-current', 'true');

    await dragPlace(page, desktop, favourites.getByRole('button', { name: 'Recents' }));
    await page.mouse.up();
    const finalOrder = ['Desktop', 'Recents', 'AirDrop', ...initialOrder.slice(3)];
    await expect(places).toHaveText(finalOrder);
    await expect(title).toHaveText('AirDrop');

    await session.reloadDesktop();
    await expect(places).toHaveText(finalOrder);
    return { finderSidebar: { animatesWithPlaceholder: true, reordersWithoutNavigating: true, persists: true } };
  }
};
