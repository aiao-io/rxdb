import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * US-028 阶段 E（AC#18）：todo 页手动拖拽排序。
 *
 * @remarks
 * 三端同一份用例。列表是等高行虚拟滚动，拖拽按指针位置换算落点下标，
 * 所以这里用真实鼠标按住手柄移动，而不是 HTML5 dragTo；视口外的落点靠贴边自动滚动到达。
 * 顺序以「刷新后再读」为准——刷新后的列表只能来自数据库。
 */

const titleOf = (page: Page, title: string): Locator =>
  page.getByTestId('todo-title').getByText(title, { exact: true });

const todoRow = (page: Page, title: string): Locator =>
  page.getByTestId('todo-row').filter({ has: titleOf(page, title) });

const readTitles = async (page: Page): Promise<string[]> =>
  (await page.getByTestId('todo-title').allTextContents()).map(text => text.trim());

const expectOrder = async (page: Page, titles: string[]): Promise<void> => {
  await expect.poll(() => readTitles(page), { timeout: 15_000 }).toEqual(titles);
};

async function addTodo(page: Page, title: string): Promise<void> {
  const input = page.getByTestId('todo-title-input');
  await input.fill(title);
  await page.getByTestId('todo-add').click();
  await expect(todoRow(page, title)).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue('', { timeout: 15_000 });
}

async function complete(page: Page, title: string): Promise<void> {
  const checkbox = todoRow(page, title).getByTestId('todo-completed');
  await checkbox.click();
  await expect(checkbox).toBeChecked();
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('元素不可见，取不到坐标');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 按住 `from` 行的手柄拖到 `to` 行上松手，并等这次重排落库（手柄恢复可用） */
async function dragTo(page: Page, from: string, to: string): Promise<void> {
  const handle = todoRow(page, from).getByTestId('todo-drag-handle');
  await expect(handle).toBeEnabled();
  const start = await center(handle);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const end = await center(todoRow(page, to));
  await page.mouse.move(start.x, end.y, { steps: 8 });
  await expect(page.locator('[data-drop-target]').getByTestId('todo-title')).toHaveText(to);
  await page.mouse.up();
  await expect(page.getByTestId('todo-drag-handle').first()).toBeEnabled({ timeout: 15_000 });
}

const todoMain = (page: Page): Locator => page.locator('main').filter({ has: page.getByTestId('todo-title-input') });

/** 完整落在滚动区可视范围内的 `test-N` 行号（排除被拖的 test-0） */
const visibleTestNumbers = (page: Page): Promise<number[]> =>
  todoMain(page).evaluate(main => {
    const box = main.getBoundingClientRect();
    return [...main.querySelectorAll('[data-testid="todo-title"]')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.top >= box.top && rect.bottom <= box.bottom;
      })
      .map(element => Number(element.textContent?.trim().replace('test-', '')))
      .filter(value => Number.isInteger(value) && value > 0);
  });

async function reloadTodoPage(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15_000 });
}

test.describe('Todo 手动排序', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/todo');
    await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15_000 });
  });

  test('「全部」页没有拖拽手柄，进行中页拖动后顺序落库，可撤销 / 重做', async ({ page }) => {
    for (const title of ['甲', '乙', '丙']) await addTodo(page, title);
    await expectOrder(page, ['甲', '乙', '丙']);
    await expect(page.getByTestId('todo-drag-handle')).toHaveCount(0);

    await page.getByTestId('todo-tab-active').click();
    await expect(page.getByTestId('todo-drag-handle')).toHaveCount(3);
    await dragTo(page, '丙', '甲');
    await expectOrder(page, ['丙', '甲', '乙']);

    await page.getByTestId('todo-undo').click();
    await expectOrder(page, ['甲', '乙', '丙']);
    await page.getByTestId('todo-redo').click();
    await expectOrder(page, ['丙', '甲', '乙']);

    await reloadTodoPage(page);
    await expectOrder(page, ['丙', '甲', '乙']);
  });

  test('完成的行追加到已完成组末尾，已完成页可拖，「全部」页跟随排序方向', async ({ page }) => {
    for (const title of ['甲', '乙', '丙', '丁']) await addTodo(page, title);
    await complete(page, '甲');
    await complete(page, '丙');
    await complete(page, '乙');

    await page.getByTestId('todo-tab-completed').click();
    await expectOrder(page, ['甲', '丙', '乙']);
    await dragTo(page, '乙', '甲');
    await expectOrder(page, ['乙', '甲', '丙']);

    await page.getByTestId('todo-tab-all').click();
    await expectOrder(page, ['丁', '乙', '甲', '丙']);
    await page.getByTestId('todo-sort').click();
    await expectOrder(page, ['乙', '甲', '丙', '丁']);

    await reloadTodoPage(page);
    await expectOrder(page, ['丁', '乙', '甲', '丙']);
  });

  test('全选把整组按当前顺序追加到已完成组', async ({ page }) => {
    for (const title of ['甲', '乙', '丙']) await addTodo(page, title);
    await page.getByTestId('todo-tab-active').click();
    await dragTo(page, '甲', '丙');
    await expectOrder(page, ['乙', '丙', '甲']);

    await page.getByTestId('todo-toggle-all').click();
    await page.getByTestId('todo-tab-completed').click();
    await expectOrder(page, ['乙', '丙', '甲']);
  });

  test('贴着视口下沿拖动会自动滚动，落到视口外的位置', async ({ page }) => {
    await page.getByTestId('todo-batch-add').click();
    await page.getByTestId('todo-batch-option-100').click();
    await page.getByTestId('todo-tab-active').click();
    await expect(todoRow(page, 'test-0')).toBeVisible({ timeout: 30_000 });
    await expect(todoRow(page, 'test-60')).toHaveCount(0);

    const handle = todoRow(page, 'test-0').getByTestId('todo-drag-handle');
    await expect(handle).toBeEnabled();
    const start = await center(handle);
    const main = await todoMain(page).boundingBox();
    if (!main) throw new Error('main 不可见');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, main.y + main.height - 4, { steps: 8 });
    // 贴边滚动的速度跟帧率走，负载高时一次轮询就可能冲过头：按视口里能看到的行号决定往哪边贴，
    // 看到目标行后移到中部停下滚动，再对准目标行，对不准就下一轮重来
    await expect(async () => {
      const visible = await visibleTestNumbers(page);
      if (!visible.includes(60)) {
        const below = Math.max(...visible) < 60;
        await page.mouse.move(start.x, below ? main.y + main.height - 4 : main.y + 4, { steps: 2 });
        throw new Error(`test-60 不在视口内：${visible.join(',')}`);
      }
      await page.mouse.move(start.x, main.y + main.height / 2, { steps: 2 });
      // 目标行可能停在贴边区（一行高）里，直接对准会重新触发滚动、松手前就冲过头：先把它居中再对准
      await todoRow(page, 'test-60').evaluate(element => element.scrollIntoView({ block: 'center' }));
      const end = await center(todoRow(page, 'test-60'));
      await page.mouse.move(start.x, end.y, { steps: 2 });
      await expect(page.locator('[data-drop-target]').getByTestId('todo-title')).toHaveText('test-60', {
        timeout: 1_000
      });
    }).toPass({ timeout: 30_000, intervals: [200] });
    await page.mouse.up();
    await expect(handle).toBeEnabled({ timeout: 15_000 });

    await reloadTodoPage(page);
    await page.getByTestId('todo-tab-active').click();
    await expect(todoRow(page, 'test-1')).toBeVisible({ timeout: 30_000 });
    // 被拖行现在在第 60 行（视口外）：把它滚进渲染范围后读它的前后邻居
    await todoMain(page).evaluate(element => (element.scrollTop = 55 * 48));
    await expect(todoRow(page, 'test-0')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const titles = await readTitles(page);
        const index = titles.indexOf('test-0');
        return titles.slice(index - 1, index + 2);
      })
      .toEqual(['test-60', 'test-0', 'test-61']);
  });
});
