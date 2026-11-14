import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const source = resolve(root, '../dist/aiao-media/apps/admin/browser');
const target = resolve(root, 'apps/web/dist/browser/admin');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
const index = resolve(target, 'index.html');
await writeFile(index, (await readFile(index, 'utf8')).replace(/<base href="\/"\s*\/?>/, '<base href="/admin/">'));
await cp(resolve(root, 'tmp/production-supabase-bundle.sql'), resolve(target, 'new-project.sql'));
await cp(resolve(root, 'infra/supabase/migrations/011-installation.sql'), resolve(target, 'upgrade-installation.sql'));
const creditsUpgrade = await Promise.all(
  ['012-credits.sql', '013-relay-credit-abandonment.sql'].map(name =>
    readFile(resolve(root, 'infra/supabase/migrations', name), 'utf8')
  )
);
await writeFile(
  resolve(target, 'upgrade-credits.sql'),
  [
    'BEGIN;',
    ...creditsUpgrade.map(sql => sql.replace(/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm, '').trim()),
    "COMMENT ON SCHEMA media_private IS 'aiao-media schema 13';",
    'COMMIT;',
    ''
  ].join('\n')
);
const imageUpgrade = await Promise.all(
  ['014-image-lifecycle.sql', '015-image-delete.sql', '016-image-reupload.sql'].map(name =>
    readFile(resolve(root, 'infra/supabase/migrations', name), 'utf8')
  )
);
await writeFile(
  resolve(target, 'upgrade-image-lifecycle.sql'),
  [
    'BEGIN;',
    ...imageUpgrade.map(sql => sql.replace(/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm, '').trim()),
    "COMMENT ON SCHEMA media_private IS 'aiao-media schema 16';",
    'COMMIT;',
    ''
  ].join('\n')
);
console.log('Packaged admin initialization and login at /admin/.');
