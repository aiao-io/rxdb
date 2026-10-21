import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';
import { loadParityGolden, normalizeParitySnapshot } from '../../../modules/e2e-parity/board-parity.mjs';

/**
 * 看板跨框架对拍（US-539 AC#1～3 的对拍半边）：装载 US-540 的同一份种子，
 * 采集板 / 列 / 任务 / 标签的语义输出；执行同一组真实拖拽与同一组详情编辑后再采一次，
 * 归一化后与三端共享的 golden（`modules/e2e-parity/board-parity.golden.json`）比较。
 * 三端都过同一 golden ⇒ 三端两两一致。
 *
 * 本文件与 dev-rxdb-react-e2e / dev-rxdb-vue-e2e 的副本内容一致，
 * 只允许一处差异：Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），
 * React / Vue 从 `@playwright/test` 取。其余内容必须保持同步，改一处改三处。
 */

/** 每个用例一个全新浏览器上下文（干净 IndexedDB / localStorage 初态）。 */
const test = base.extend<{ boardPage: Page }>({
  boardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/board');
    await expect(page.getByTestId('board-view')).toBeVisible();
    await use(page);
    await context.close();
  }
});

/** 从 DOM 采集看板语义快照（标题 / 标签 / 截止日；颜色经 getComputedStyle 归一为 rgb() 串）。 */
const collectBoardSnapshot = (page: Page) =>
  page.evaluate(() => {
    const text = (root: ParentNode, selector: string): string | null =>
      root.querySelector(selector)?.textContent?.trim() ?? null;
    const rgb = (element: Element): string => getComputedStyle(element).backgroundColor;

    const columns = [...document.querySelectorAll<HTMLElement>('[data-testid="column"]')].map(column => ({
      title: text(column, '[data-testid="column-title"]') ?? '',
      tasks: [...column.querySelectorAll<HTMLElement>('[data-testid="task-card"]')].map(card => ({
        title: text(card, '[data-testid="task-title"]') ?? '',
        labels: [...card.querySelectorAll<HTMLElement>('[data-testid="card-label"]')].map(
          chip => chip.textContent?.trim() ?? ''
        ),
        dueDate: text(card, '[data-testid="task-due"]')?.replace(/^(已逾期|今天到期)\s*/, '') ?? null
      })),
      taskTitles: [...column.querySelectorAll<HTMLElement>('[data-testid="task-card"]')].map(
        card => text(card, '[data-testid="task-title"]') ?? ''
      )
    }));

    const labels = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="label-strip"] [data-testid="label-chip"]')
    ].map(chip => ({ name: chip.querySelector('.label-name')?.textContent?.trim() ?? '', color: rgb(chip) }));

    return {
      boardTitle: text(document, '[data-testid="rename-board"]') ?? '',
      columns: columns.map(({ title, tasks }) => ({ title, tasks })),
      labels,
      afterDragColumns: columns.map(({ title, taskTitles }) => ({ title, taskTitles }))
    };
  });

test.describe('看板对拍（US-539 AC#1～3）', () => {
  test('种子语义 + 同一组拖拽 + 同一组详情编辑与 golden 一致', async ({ boardPage: page }, testInfo) => {
    await page.getByTestId('seed-demo').click();
    await expect(page.getByTestId('column')).toHaveCount(4);
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    const seedSnapshot = await collectBoardSnapshot(page);

    // 同一组真实拖拽：把「修复登录 bug」拖到 Doing 的「树拖拽落点修复」之上，刷新读回
    const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
    await source.dragTo(target, { targetPosition: { x: 10, y: 5 } });
    const doingColumn = page
      .getByTestId('column')
      .filter({ has: page.getByTestId('column-title').getByText('Doing', { exact: true }) });
    await expect(doingColumn.getByTestId('task-title').first()).toHaveText('修复登录 bug');
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    const afterDragSnapshot = await collectBoardSnapshot(page);

    // 同一组详情编辑：标题 / 描述 / 截止日 / 加「文档」标签，保存后重开读回
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    const detail = page.getByTestId('detail-panel');
    await card.getByTestId('task-title').click();
    await detail.getByTestId('detail-title').fill('修复登录 bug（回归）');
    await detail.getByTestId('detail-description').fill('回归修复验证');
    await detail.getByTestId('detail-due').fill('2026-11-20');
    await detail.locator('label', { hasText: '文档' }).locator('input').check();
    await detail.getByTestId('detail-save').click();
    await expect(detail).toBeHidden();
    await card.getByTestId('task-title').click();
    const afterEdit = {
      taskTitle: await detail.getByTestId('detail-title').inputValue(),
      description: await detail.getByTestId('detail-description').inputValue(),
      dueDate: await detail.getByTestId('detail-due').inputValue(),
      labels: await detail.locator('input[data-testid="detail-label-check"]:checked + span').allTextContents()
    };

    const normalized = normalizeParitySnapshot({
      seed: {
        boardTitle: seedSnapshot.boardTitle,
        columns: seedSnapshot.columns,
        labels: seedSnapshot.labels
      },
      afterDrag: { columns: afterDragSnapshot.afterDragColumns },
      afterEdit
    });
    expect(normalized).toEqual(loadParityGolden(testInfo.file));
  });
});
