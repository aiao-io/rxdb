/**
 * CLI 入口：`serve` / `seed` / `reset`。
 *
 * @remarks
 * 直接用 `node apps/dev-rxdb-http-server/src/main.ts <命令>` 跑——Node 26 原生剥离类型，
 * 不需要构建产物，也就不会有 `dist/`。这正是故事 Out of Scope 里那条
 * 「不发 npm、不进 dist」的落地方式：本项目**没有** `build` target。
 *
 * 命令可以叠加：`reset seed` 先删库重建再写种子，`project.json` 的 `reset` target 用的就是它。
 */

import {
  resolveControlEnabled,
  resolveDatabasePath,
  resolveExposeEtag,
  resolvePort,
  SEED_ROW_COUNT
} from './config.ts';
import { openDatabase } from './db.ts';
import { resetDatabase, seedDatabase } from './seed.ts';
import { createDemoServer } from './server.ts';

const USAGE = `Usage: node src/main.ts <serve|seed|reset> [...]

  serve   启动 HTTP 服务（库为空时自动写一次种子）
  seed    往现有库写入 ${SEED_ROW_COUNT} 行确定性种子数据
  reset   删掉库文件并重建空表（不是 DELETE FROM）

环境变量：RXDB_HTTP_DEMO_PORT / RXDB_HTTP_DEMO_DB / RXDB_HTTP_DEMO_EXPOSE_ETAG`;

const countRows = (databasePath: string): number => {
  const db = openDatabase(databasePath);
  const row = db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as { n: number };
  db.close();
  return Number(row.n);
};

const runSeed = (databasePath: string): void => {
  const db = openDatabase(databasePath);
  const rows = seedDatabase(db, SEED_ROW_COUNT);
  db.close();
  console.log(`[seed] ${rows} rows -> ${databasePath}`);
};

const runReset = (databasePath: string): void => {
  resetDatabase(databasePath).close();
  console.log(`[reset] rebuilt ${databasePath}`);
};

const runServe = async (databasePath: string): Promise<void> => {
  // 空库直接起服务会得到一个「什么都对、就是没数据」的 demo，比报错更难排查。
  if (countRows(databasePath) === 0) runSeed(databasePath);

  const port = resolvePort();
  const demo = createDemoServer({
    databasePath,
    exposeEtag: resolveExposeEtag(),
    controlEnabled: resolveControlEnabled()
  });

  await new Promise<void>(resolve => demo.server.listen(port, '127.0.0.1', () => resolve()));
  console.log(`[serve] http://127.0.0.1:${port}/v1  (db: ${databasePath})`);
  console.log(`[serve] expose ETag: ${resolveExposeEtag()} | __control: ${resolveControlEnabled()}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void demo.close().then(() => process.exit(0));
    });
  }
};

const main = async (): Promise<void> => {
  const commands = process.argv.slice(2);
  if (commands.length === 0) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  const databasePath = resolveDatabasePath();
  for (const command of commands) {
    if (command === 'reset') runReset(databasePath);
    else if (command === 'seed') runSeed(databasePath);
    else if (command === 'serve') await runServe(databasePath);
    else throw new Error(`Unknown command '${command}'\n\n${USAGE}`);
  }
};

await main();
