import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$note';

export const notesActions = {
  name: 'notes-actions',
  description: 'Notes 置顶与取消置顶写入本地 SQLite',
  keys: ['notesActions.pinPersists', 'notesActions.unpinPersists'],
  async run(session) {
    const { closeAll, launch, win } = session.helpers;
    await session.openDesktop();
    await closeAll();
    await launch('Notes');
    const window = win('notes');
    const rows = () => window.locator('[data-id]');
    await expect(window).toBeVisible();
    const result = traced('notes-actions');
    const note = rows().filter({ hasText: 'Window shadow recipe' });
    await expect(note).toHaveCount(1);
    await note.click();
    await window.locator('[data-pin]').click();
    result.pinPersists = (await surgery(session, db => db.shell.rows(`SELECT pinned FROM "${TABLE}" WHERE title = ?`, ['Window shadow recipe'])))?.[0]?.[0] === 1;
    await expect(rows().filter({ hasText: 'Window shadow recipe' })).toHaveCount(1);
    await window.locator('[data-pin]').click();
    result.unpinPersists = (await surgery(session, db => db.shell.rows(`SELECT pinned FROM "${TABLE}" WHERE title = ?`, ['Window shadow recipe'])))?.[0]?.[0] === 0;
    await closeAll();
    return { notesActions: result };
  }
};
