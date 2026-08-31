/**
 * CLI 入口：`serve` / `seed` / `reset`。
 *
 * @remarks
 * 直接用 `node apps/dev-rxdb-http-server/src/main.ts <命令>` 跑——Node 26 原生剥离类型，
 * 不需要构建产物，也就不会有 `dist/`。
 *
 * 命令可以叠加：`reset seed` 先删数据目录重建、再写种子，`project.json` 的 `reset` target
 * 用的就是它。阶段 B 起，`seed` / `reset` 也走 RxDB 引擎（pglite 文件落盘），不再有
 * `node:sqlite` 的直接路径。
 */

import {
  resolveControlEnabled,
  resolveDataDir,
  resolveExposeEtag,
  resolvePort,
  SEED_ROW_COUNT
} from './config.ts';
import { createRxdbRecipeStore, deleteRxdbDataDir, seedRxdbStore } from './rxdb-store.ts';
import { seedRows } from './seed.ts';
import { createDemoServer } from './server.ts';

const USAGE = `Usage: node src/main.ts <serve|seed|reset> [...]

  serve   启动 HTTP 服务（库为空时自动写一次种子）
  seed    往现有库写入 ${SEED_ROW_COUNT} 行确定性种子数据
  reset   删掉数据目录并重建空库（不是 DELETE FROM）

环境变量：RXDB_HTTP_DEMO_PORT / RXDB_HTTP_DEMO_DB / RXDB_HTTP_DEMO_EXPOSE_ETAG`;

const runSeed = async (dataDir: string): Promise<void> => {
  const store = await createRxdbRecipeStore(dataDir);
  const rows = await seedRxdbStore(store, seedRows(SEED_ROW_COUNT));
  await store.destroy();
  console.log(`[seed] ${rows} rows -> ${dataDir}`);
};

const runReset = async (dataDir: string): Promise<void> => {
  deleteRxdbDataDir(dataDir);
  // 删完再建一份空库（只建表、不写种子），语义对齐 node:sqlite 时代的「删文件 + 重建表」。
  const store = await createRxdbRecipeStore(dataDir);
  await store.destroy();
  console.log(`[reset] rebuilt ${dataDir}`);
};

const runServe = async (dataDir: string): Promise<void> => {
  const port = resolvePort();
  const demo = await createDemoServer({
    dataDir,
    exposeEtag: resolveExposeEtag(),
    controlEnabled: resolveControlEnabled()
  });

  await new Promise<void>(resolve => demo.server.listen(port, '127.0.0.1', () => resolve()));
  console.log(`[serve] http://127.0.0.1:${port}/v1  (dataDir: ${dataDir})`);
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

  const dataDir = resolveDataDir();
  for (const command of commands) {
    if (command === 'reset') await runReset(dataDir);
    else if (command === 'seed') await runSeed(dataDir);
    else if (command === 'serve') await runServe(dataDir);
    else throw new Error(`Unknown command '${command}'\n\n${USAGE}`);
  }
};

await main();
