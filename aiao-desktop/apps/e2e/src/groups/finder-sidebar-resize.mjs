import { expect as playwrightExpect } from 'playwright/test';

const expect = playwrightExpect.configure({ timeout: 5_000 });

async function checkSidebarDrag(page, finder) {
  const sidebar = finder.locator('[data-fsb]');
  const content = finder.locator('[data-body]');
  const splitter = finder.getByRole('separator', { name: 'Sidebar' });
  const title = finder.locator('[data-title]');
  const home = await title.textContent();
  await sidebar.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(title).toHaveText('Documents');
  await expect(finder).not.toHaveClass(/\bopening\b/);
  await expect(splitter).toBeVisible();

  const toolbar = await finder.getByRole('toolbar', { name: 'Toolbar' }).boundingBox();
  const controls = finder.locator('.tl');
  const initialControls = await controls.boundingBox();
  const dividerAppearance = () =>
    splitter.evaluate(node => {
      const marker = getComputedStyle(node, '::after');
      return [getComputedStyle(node).backgroundColor, marker.content, marker.backgroundColor, marker.opacity];
    });
  const initialAppearance = await dividerAppearance();
  const width = () => sidebar.evaluate(node => node.offsetWidth);
  const expectWidth = pixels => expect.poll(width).toBe(pixels);
  const startDrag = async atY => {
    const box = await splitter.boundingBox();
    const x = box.x + box.width / 2;
    const y = atY ?? box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    return (distance, vertical = 0) => page.mouse.move(x + distance, y + vertical);
  };
  const frame = await finder.boundingBox();
  const initial = await width();
  const initialContent = (await content.boundingBox()).width;
  const wider = initial + 64;
  const widen = await startDrag(toolbar.y + toolbar.height / 2);
  const max = Number(await splitter.getAttribute('aria-valuemax'));
  await widen(max - initial + 64);
  await expectWidth(max);
  expect((await content.boundingBox()).width).toBe(initial + initialContent - max);
  await widen(64);
  await expectWidth(wider);
  expect((await content.boundingBox()).width).toBe(initialContent - 64);
  await page.mouse.up();

  const min = 132;
  const snap = 24;
  const favourites = await sidebar.getByRole('group', { name: 'Favourites' }).boundingBox();
  expect(favourites.y).toBeCloseTo(toolbar.y + toolbar.height, 0);
  const narrow = await startDrag();
  expect(await dividerAppearance()).toEqual(initialAppearance);
  await narrow(min - wider);
  await expectWidth(min);
  await narrow(min - wider - snap + 1);
  await expectWidth(min);
  await narrow(min - wider - snap, -frame.height / 2);
  await expect(sidebar).toBeHidden();
  await narrow(min - wider);
  await expectWidth(min);
  await narrow(min - wider - snap);
  await page.mouse.up();
  await expect(sidebar).toBeHidden();
  expect((await content.boundingBox()).width).toBe(initial + initialContent);
  expect(await finder.boundingBox()).toEqual(frame);
  expect(await controls.boundingBox()).toEqual(initialControls);

  const back = finder.getByRole('button', { name: 'Back', exact: true });
  const forward = finder.getByRole('button', { name: 'Forward', exact: true });
  const zoom = await finder.getByRole('button', { name: 'Zoom', exact: true }).boundingBox();
  const backBox = await back.boundingBox();
  const forwardBox = await forward.boundingBox();
  expect(backBox.x).toBeGreaterThan(zoom.x + zoom.width);
  expect(forwardBox.x).toBeGreaterThan(backBox.x + backBox.width);
  expect(Math.abs(backBox.y + backBox.height / 2 - zoom.y - zoom.height / 2)).toBeLessThanOrEqual(1);
  await back.click();
  await expect(title).toHaveText(home);
  await forward.click();
  await expect(title).toHaveText('Documents');

  const view = page.locator('#menubar').getByRole('menuitem', { name: 'View', exact: true });
  await view.click();
  await page.getByRole('menuitem', { name: 'Show Sidebar', exact: true }).click();
  await expectWidth(wider);
  await view.click();
  await page.getByRole('menuitem', { name: 'Hide Sidebar', exact: true }).click();
  await expect(sidebar).toBeHidden();

  const reveal = await startDrag();
  await reveal(snap - 1);
  await expect(sidebar).toBeHidden();
  await reveal(snap + 1);
  await expectWidth(min);
  await reveal(175);
  await page.mouse.up();
  await expectWidth(175);
  expect(await controls.boundingBox()).toEqual(initialControls);
}

export const finderSidebarResize = {
  name: 'finder-sidebar-resize',
  description: 'Finder 侧栏拖拽调宽、越过最小宽度后隐藏、工具栏导航与恢复',
  keys: ['finderSidebarResize.dragAndNavigation'],
  async run(session) {
    await session.openDesktop();
    await checkSidebarDrag(session.page, session.helpers.win('finder'));
    return { finderSidebarResize: { dragAndNavigation: true } };
  }
};
