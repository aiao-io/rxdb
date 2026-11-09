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
console.log('Packaged admin initialization and login at /admin/.');
