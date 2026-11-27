import { expect as playwrightExpect } from 'playwright/test';

const expect = playwrightExpect.configure({ timeout: 5_000 });
const preview = '.finder-place-preview';
const placeholder = '.finder-place-placeholder';
const removeBadge = '.finder-place-remove';

async function pickUpPlace(page, source) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { x, y };
}

/** 从条目中心开始拖动，越过目标条目的中心。 */
async function dragPlace(page, source, target) {
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await pickUpPlace(page, source);
  const targetX = to.x + to.width / 2;
  const targetY = to.y + to.height / 2;
  await page.mouse.move(targetX, targetY, { steps: 12 });
}

export const finderSidebar = {
  name: 'finder-sidebar',
  description: 'Finder 侧栏自由拖动、组内排序、拖出移除收藏与持久化',
  keys: [
    'finderSidebar.animatesWithPlaceholder',
    'finderSidebar.reordersWithoutNavigating',
    'finderSidebar.persists',
    'finderSidebar.favouritesDragOut'
  ],
  async run(session) {
    const { page, helpers } = session;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await session.openDesktop();
    const finder = helpers.win('finder');
    const sidebar = finder.locator('[data-fsb]');
    const favourites = finder.getByRole('group', { name: 'Favourites' });
    const places = favourites.locator('[data-place]');
    const airDrop = favourites.getByRole('button', { name: 'AirDrop' });
    const desktop = favourites.getByRole('button', { name: 'Desktop', exact: true });
    const title = finder.locator('[data-title]');
    const initialTitle = await title.textContent();
    const initialOrder = await places.allTextContents();
    const rowHeight = await airDrop.evaluate(node => getComputedStyle(node).height);
    const expected = ['Recents', 'Desktop', 'AirDrop', ...initialOrder.slice(3)];
    const dragPreview = page.locator(preview);
    const badge = dragPreview.locator(removeBadge);

    await dragPlace(page, airDrop, desktop);
    await expect(dragPreview).toBeVisible();
    await expect(dragPreview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(dragPreview).toHaveCSS('border-top-width', '0px');
    await expect(badge).toBeHidden();
    const slot = favourites.locator(placeholder);
    await expect(slot).toBeVisible();
    await expect(slot.locator('.nm')).toHaveText('AirDrop');
    await expect(slot.locator('svg.ico')).toBeVisible();
    await expect(slot).toHaveAttribute('aria-hidden', 'true');
    await expect(slot).toHaveCSS('height', rowHeight);
    await expect(desktop).toHaveCSS('transition-property', /transform/);
    await expect(desktop).not.toHaveCSS('transform', 'none');
    await page.mouse.up();
    await expect(dragPreview).toHaveCount(0);
    await expect(places).toHaveText(expected);
    await expect(title).toHaveText(initialTitle);

    await dragPlace(page, airDrop, desktop);
    await expect(favourites.locator(placeholder)).toBeVisible();
    const inside = await dragPreview.boundingBox();
    const side = await sidebar.boundingBox();
    const outsideX = side.x + side.width + 40;
    await page.mouse.move(outsideX, inside.y + inside.height / 2, { steps: 8 });
    await expect(badge).toHaveText('×');
    expect((await dragPreview.boundingBox()).x).toBeGreaterThan(inside.x + 40);
    await page.mouse.move(side.x + side.width / 2, side.y + 30, { steps: 8 });
    await expect(badge).toBeHidden();
    await page.mouse.up();
    await expect(dragPreview).toHaveCount(0);
    await expect(places).toHaveText(expected);
    await airDrop.click();
    await expect(title).toHaveText('AirDrop');
    await expect(airDrop).toHaveAttribute('aria-current', 'true');

    await dragPlace(page, desktop, favourites.getByRole('button', { name: 'Recents' }));
    await page.mouse.up();
    const finalOrder = ['Desktop', 'Recents', 'AirDrop', ...initialOrder.slice(3)];
    await expect(places).toHaveText(finalOrder);
    await expect(title).toHaveText('AirDrop');

    const documents = favourites.getByRole('button', { name: 'Documents', exact: true });
    await documents.click();
    await expect(title).toHaveText('Documents');
    const { y } = await pickUpPlace(page, documents);
    await page.mouse.move(outsideX, y, { steps: 8 });
    await expect(badge).toHaveText('×');
    await page.mouse.up();
    await expect(dragPreview).toHaveCount(0);
    await expect(documents).toHaveCount(0);
    await expect(title).toHaveText('Documents');
    await favourites.getByRole('button', { name: initialTitle, exact: true }).click();
    await expect(finder.locator('[data-name="Documents"]')).toBeVisible();

    await session.reloadDesktop();
    await expect(places).toHaveText(finalOrder.filter(name => name !== 'Documents'));
    return {
      finderSidebar: {
        animatesWithPlaceholder: true,
        reordersWithoutNavigating: true,
        persists: true,
        favouritesDragOut: true
      }
    };
  }
};
