import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$freeform_stroke';

export const freeformWorkflow = {
  name: 'freeform-workflow',
  description: 'Freeform 笔迹保存、失败保留、重试、清空失败保护与刷新持久化',
  keys: [
    'freeformWorkflow.strokePersists',
    'freeformWorkflow.failedInsertKeepsStroke',
    'freeformWorkflow.retryPersistsStroke',
    'freeformWorkflow.failedClearKeepsStrokes',
    'freeformWorkflow.retryClearsStrokes',
    'freeformWorkflow.survivesReload'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('freeform-workflow');
    const sql = (statement, bindings) => surgery(session, db => db.shell.execute(statement, bindings));
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const count = () => rows(`SELECT COUNT(*) FROM "${TABLE}"`).then(found => found[0]?.[0] ?? 0);
    const waitForCount = expected => expect.poll(count).toBe(expected);
    const open = async () => {
      await helpers.launch('Freeform');
      const window = helpers.win('freeform');
      await expect(window).toBeVisible();
      await expect(window).not.toHaveClass(/opening/);
      await expect(window.locator('[data-ff]')).toBeVisible();
      return window;
    };
    const draw = async window => {
      const board = window.locator('[data-ff]');
      const box = await board.boundingBox();
      if (!box) throw new Error('Freeform canvas 没有布局尺寸');
      await page.mouse.move(box.x + 80, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 180, box.y + 120, { steps: 3 });
      await page.mouse.up();
    };

    await session.openDesktop();
    await helpers.closeAll();
    const window = await open();

    await draw(window);
    await waitForCount(1);
    result.strokePersists = true;

    await sql(`CREATE TRIGGER fail_freeform_insert BEFORE INSERT ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Freeform storage unavailable'); END`);
    await draw(window);
    await expect(window.locator('[data-fferror]')).toContainText('Local storage could not complete this change');
    await expect(window.locator('[data-retry]')).toBeVisible();
    await waitForCount(1);
    result.failedInsertKeepsStroke = true;

    await sql('DROP TRIGGER fail_freeform_insert');
    await window.locator('[data-retry]').click();
    await expect(window.locator('[data-fferror]')).toHaveCount(0);
    await waitForCount(2);
    result.retryPersistsStroke = true;

    await sql(`CREATE TRIGGER fail_freeform_delete BEFORE DELETE ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Freeform delete unavailable'); END`);
    await window.locator('[data-clear]').click();
    /* 清空是两步式：确认弹层（渲染在浮层里，不在窗口 DOM 内）里点 Clear 才真正擦除。 */
    await page.locator('[data-clear-confirm]').click();
    await expect(window.locator('[data-fferror]')).toContainText('Local storage could not complete this change');
    await expect(window.locator('[data-retry]')).toBeVisible();
    await waitForCount(2);
    result.failedClearKeepsStrokes = true;

    await sql('DROP TRIGGER fail_freeform_delete');
    await window.locator('[data-retry]').click();
    await expect(window.locator('[data-fferror]')).toHaveCount(0);
    await waitForCount(0);
    result.retryClearsStrokes = true;

    await draw(window);
    await waitForCount(1);
    await session.reloadDesktop(page, { finder: false });
    await open();
    await waitForCount(1);
    result.survivesReload = true;

    await helpers.closeAll();
    return { freeformWorkflow: result };
  }
};
