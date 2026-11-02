import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { productionSources } from './build-production-supabase-bundle.mjs';

const outputDefault = resolve(import.meta.dirname, '../tmp/supabase-autoinit.sql');
const boundary = /^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm;

/** 生成 OAuth 自动初始化 SQL；输出目录不存在时先创建，干净检出也能直接运行。 */
export async function buildAutoinitBundle(output = outputDefault) {
  const sources = await Promise.all(
    productionSources.map(async path => ({
      path,
      sql: (await readFile(resolve(import.meta.dirname, '../../../', path), 'utf8')).replace(boundary, '').trim()
    }))
  );
  const sql = `-- Aiao Media automatic Supabase onboarding bundle.\n-- Review before injecting as MEDIA_SUPABASE_AUTOINIT_SQL.\nBEGIN;\n${sources.map(source => `-- BEGIN ${source.path}\n${source.sql}\n-- END ${source.path}`).join('\n')}\nCOMMIT;\n`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, sql, { mode: 0o600 });
  return { output, sql };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { output } = await buildAutoinitBundle();
  console.log(`Generated reviewed-input bundle: ${output}`);
}
