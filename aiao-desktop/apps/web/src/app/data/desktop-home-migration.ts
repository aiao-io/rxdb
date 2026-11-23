import { MailMessage } from '../apps/mail/mail.entities';
import { DesktopFile } from '../disk/desktop-file.entity';
import { VOLUME_NAME } from '../disk/disk-path';
import type { SchemaExecutor } from './schema-version';
import { SystemPreference } from './system-preference.entity';

const OLD_NAME = 'prasenjit';
const NEW_NAME = 'stevejobs';
const PATH_PREFERENCES = new Set(['finder:recents', 'disk:pending-batch', 'github:repositories', 'windows:resume']);
const ALL = { combinator: 'and' as const, rules: [] };

function renamePath<T>(value: T): T | readonly string[] {
  if (!Array.isArray(value) || !value.every((part): part is string => typeof part === 'string')) return value;
  const offset = value[0] === VOLUME_NAME ? 1 : 0;
  if (value[offset] !== 'Users' || value[offset + 1] !== OLD_NAME) return value;
  return [...value.slice(0, offset + 1), NEW_NAME, ...value.slice(offset + 2)];
}

function renamePreferencePaths(value: unknown): unknown {
  if (Array.isArray(value)) {
    const renamed = renamePath(value);
    return renamed === value ? value.map(renamePreferencePaths) : renamed;
  }
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renamePreferencePaths(item)]));
}

/** 只改目录树与系统引用；目录 ID、子项和文件体仍是原来的记录。 */
export async function migrateDesktopHome(executor: SchemaExecutor): Promise<void> {
  const files = executor.getRepository(DesktopFile);
  const rows = await files.find({ where: ALL });
  const users = rows.find(row => (row.parentId ?? null) === null && row.type === 'folder' && row.name === 'Users');
  const children = users ? rows.filter(row => row.parentId === users.id) : [];
  const home = children.find(row => row.type === 'folder' && row.name === OLD_NAME);
  if (home) {
    if (children.some(row => row.name.toLowerCase() === NEW_NAME))
      throw new Error(`Cannot rename the home folder: /Users/${NEW_NAME} already exists.`);
    await files.update(home, { name: NEW_NAME });
  }
  for (const row of rows) {
    const originalPath = renamePath(row.originalPath);
    if (originalPath !== row.originalPath) await files.update(row, { originalPath });
  }

  const preferences = executor.getRepository(SystemPreference);
  for (const row of await preferences.find({ where: ALL })) {
    if (!PATH_PREFERENCES.has(row.key) && !row.key.startsWith('windows:layout:')) continue;
    const value = renamePreferencePaths(row.value);
    if (JSON.stringify(value) !== JSON.stringify(row.value)) await preferences.update(row, { value });
  }

  const messages = executor.getRepository(MailMessage);
  const inbox = await messages.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'mailbox', operator: '=', value: 'Inbox' },
        { field: 'recipient', operator: '=', value: 'Prasenjit' }
      ]
    }
  });
  for (const message of inbox) await messages.update(message, { recipient: 'Steve Jobs' });
}
