import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$contact';

export const contacts = {
  name: 'contacts',
  description: 'Contacts 搜索、联系人新增编辑删除与本地 SQLite 持久化',
  keys: [
    'contacts.searchFilters',
    'contacts.invalidDraftKeepsFields',
    'contacts.createPersists',
    'contacts.updatePersists',
    'contacts.deletePersists'
  ],
  async run(session) {
    const { closeAll, launch, win } = session.helpers;
    await session.openDesktop();
    await closeAll();
    await launch('Contacts');
    const window = win('contacts');
    await expect(window).toBeVisible();

    const search = window.getByRole('textbox', { name: 'Search contacts', exact: true });
    const rows = () => window.locator('[data-contact-id]');
    const result = traced('contacts');
    await expect(rows()).toHaveCount(10);
    await search.fill('photographer');
    result.searchFilters = (await rows().count()) === 1 && (await rows().first().textContent())?.trim() === 'Chris Lee';
    await search.fill('');

    await window.locator('[data-new-contact]').click();
    const form = window.locator('form');
    await form.locator('[data-contact-name]').fill('Grace Hopper');
    await form.locator('[data-contact-role]').fill('Compiler pioneer');
    await form.locator('[data-contact-email]').fill('invalid');
    await form.locator('[data-contact-address]').fill('Arlington, VA');
    await form.locator('[data-contact-save]').click();
    await expect(form.locator('[data-contact-error]')).toHaveText('Enter a valid email address.');
    result.invalidDraftKeepsFields =
      (await form.locator('[data-contact-name]').inputValue()) === 'Grace Hopper' &&
      (await form.locator('[data-contact-address]').inputValue()) === 'Arlington, VA';

    await form.locator('[data-contact-email]').fill('grace@example.com');
    await form.locator('[data-contact-save]').click();
    await expect(rows().filter({ hasText: 'Grace Hopper' })).toHaveCount(1);
    result.createPersists =
      (
        await surgery(session, db =>
          db.shell.rows(`SELECT name, email FROM "${TABLE}" WHERE name = ?`, ['Grace Hopper'])
        )
      )?.[0]?.join('|') === 'Grace Hopper|grace@example.com';

    await rows().filter({ hasText: 'Grace Hopper' }).click();
    await window.locator('[data-contact-edit]').click();
    await form.locator('[data-contact-role]').fill('Computer scientist');
    await form.locator('[data-contact-save]').click();
    await expect(window.locator('[data-contact-id]').filter({ hasText: 'Grace Hopper' })).toHaveCount(1);
    result.updatePersists =
      (
        await surgery(session, db => db.shell.rows(`SELECT role FROM "${TABLE}" WHERE name = ?`, ['Grace Hopper']))
      )?.[0]?.[0] === 'Computer scientist';

    await window.locator('[data-contact-delete]').click();
    await expect(rows().filter({ hasText: 'Grace Hopper' })).toHaveCount(0);
    result.deletePersists =
      (
        await surgery(session, db => db.shell.rows(`SELECT COUNT(*) FROM "${TABLE}" WHERE name = ?`, ['Grace Hopper']))
      )?.[0]?.[0] === 0;

    await closeAll();
    return { contacts: result };
  }
};
