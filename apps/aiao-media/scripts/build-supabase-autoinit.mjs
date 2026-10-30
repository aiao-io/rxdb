import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { productionSources } from './build-production-supabase-bundle.mjs';

const output = resolve(import.meta.dirname, '../tmp/supabase-autoinit.sql');
const boundary = /^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm;
const sources = await Promise.all(
  productionSources.map(async path => ({
    path,
    sql: (await readFile(resolve(import.meta.dirname, '../../../', path), 'utf8')).replace(boundary, '').trim()
  }))
);
const sql = `-- Aiao Media automatic Supabase onboarding bundle.\n-- Review before injecting as MEDIA_SUPABASE_AUTOINIT_SQL.\nBEGIN;\n${sources.map(source => `-- BEGIN ${source.path}\n${source.sql}\n-- END ${source.path}`).join('\n')}\nCOMMIT;\n`;
await writeFile(output, sql, { mode: 0o600 });
console.log(`Generated reviewed-input bundle: ${output}`);
