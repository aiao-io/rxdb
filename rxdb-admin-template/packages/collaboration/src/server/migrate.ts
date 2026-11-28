import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 一个迁移文件：文件名（决定执行顺序）与全部 SQL，每个文件自带事务且可重复执行。 */
export interface Migration {
  name: string;
  sql: string;
}

const isDirectory = async (directory: string) => {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * 迁移目录 `supabase/migrations`：从本模块所在目录向上逐级查找，直接运行源码（测试）与运行编译产物
 * （`dist/server/server`）都能找到同一个目录；一直找到文件系统根仍没有时抛错。
 */
export async function migrationsDirectory(
  from: string = path.dirname(fileURLToPath(import.meta.url))
): Promise<string> {
  for (let current = from; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'supabase', 'migrations');
    if (await isDirectory(candidate)) return candidate;
    if (path.dirname(current) === current) throw new Error(`Cannot find supabase/migrations above ${from}`);
  }
}

/** 按文件名顺序读取迁移目录下的全部 `.sql` 文件；新增迁移只要文件名排在已有文件之后，所有调用方自动执行。 */
export async function readMigrations(directory?: string): Promise<Migration[]> {
  const root = directory ?? (await migrationsDirectory());
  const names = (await readdir(root)).filter(name => name.endsWith('.sql')).sort();
  return Promise.all(names.map(async name => ({ name, sql: await readFile(path.join(root, name), 'utf8') })));
}

/** 按文件名顺序在数据库上执行全部迁移并返回已执行的文件名；每个迁移幂等，可重复执行。 */
export async function applyMigrations(
  database: { query: (sql: string) => Promise<unknown> },
  directory?: string
): Promise<string[]> {
  const migrations = await readMigrations(directory);
  for (const migration of migrations) await database.query(migration.sql);
  return migrations.map(migration => migration.name);
}
