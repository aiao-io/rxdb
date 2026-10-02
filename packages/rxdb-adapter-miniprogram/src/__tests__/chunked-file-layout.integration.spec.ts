/**
 * US-211 AC#12：真实 wa-sqlite 在抖音配额语义下写到撞配额，不清理任何文件直接重开，
 * 已提交的数据必须完整可读。同一流程在单文件布局下重开失败，证明分块布局是修复的因。
 */
import { describe, expect, it } from 'vitest';
import { createWaSqliteMiniProgramClient, type WaSqliteMiniProgramClient } from '../create-client.js';
import { createWechatMiniProgramHost } from '../host.js';
import type { MiniProgramFileLayout } from '../mini-program.interface.js';
import { QuotaFileSystem } from './quota-file-system.js';
import { moduleFactory, wasmRuntime } from './subframe-wasm-factory.js';

const QUOTA_BYTES = 1024 * 1024;
const QUOTA_MESSAGE = 'writeFileSync:fail user dir saved file size limit exceeded';
const ROWS_PER_BATCH = 8;
const INSERT_BATCH = `
  WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${ROWS_PER_BATCH})
  INSERT INTO blobs (payload) SELECT randomblob(2048) FROM n;
`;

function openClient(
  dbName: string,
  fileSystem: QuotaFileSystem,
  fileLayout: MiniProgramFileLayout
): Promise<WaSqliteMiniProgramClient> {
  const host = {
    ...createWechatMiniProgramHost({ env: { USER_DATA_PATH: '/user' }, getFileSystemManager: () => fileSystem }),
    fileLayout
  };
  return createWaSqliteMiniProgramClient(dbName, { host, moduleFactory, wasmRuntime });
}

/** 一批一批写到失败为止，返回失败前已提交的批数与失败本身。 */
async function fillUntilFull(client: WaSqliteMiniProgramClient): Promise<{ committed: number; failure: unknown }> {
  for (let committed = 0; committed < 10_000; committed++) {
    const failure: unknown = await client.execute(INSERT_BATCH).then(
      () => undefined,
      (error: unknown) => error ?? new Error('rejected without reason')
    );
    if (failure !== undefined) return { committed, failure };
  }
  throw new Error('写满 10000 批仍未撞配额');
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let current = error; current instanceof Error; current = current.cause) chain.push(current);
  return chain;
}

/** 建表后写到撞配额，断言平台原文顺着 cause 链带出。 */
async function writeUntilFull(dbName: string, fileLayout: MiniProgramFileLayout) {
  const fileSystem = new QuotaFileSystem(QUOTA_BYTES);
  const client = await openClient(dbName, fileSystem, fileLayout);
  await client.execute('CREATE TABLE blobs (id INTEGER PRIMARY KEY, payload BLOB NOT NULL);');
  const { committed, failure } = await fillUntilFull(client);
  expect(causeChain(failure)).toContain(fileSystem.lastQuotaError);
  return { fileSystem, client, committed, reopen: () => openClient(dbName, fileSystem, fileLayout) };
}

async function expectIntact(client: WaSqliteMiniProgramClient, rows: number): Promise<void> {
  const count = await client.execute('SELECT count(*) FROM blobs;');
  expect(count.results[0].rows).toEqual([[rows]]);
  const integrity = await client.execute('PRAGMA integrity_check;');
  expect(integrity.results[0].rows).toEqual([['ok']]);
}

describe('撞配额后不清理直接重开', () => {
  it.each([4096, 65536])('分块布局 chunkBytes=%i：已提交数据完整；满着再写仍失败但不坏，腾出空间后可写', async chunkBytes => {
    const { fileSystem, client, committed, reopen } = await writeUntilFull(`chunked-${chunkBytes}`, {
      kind: 'chunked',
      chunkBytes
    });
    expect(committed).toBeGreaterThan(0);
    await client.disconnect();

    const full = await reopen();
    await expectIntact(full, committed * ROWS_PER_BATCH);
    // 余量已让给上次回滚、配额仍满，这次占不回来：写失败，但已提交数据不动
    const failure = await full.execute('DELETE FROM blobs WHERE id % 2 = 0;').catch((error: unknown) => error);
    expect(causeChain(failure)).toContain(fileSystem.lastQuotaError);
    await expectIntact(full, committed * ROWS_PER_BATCH);
    await full.disconnect();

    fileSystem.quotaBytes += 256 * 1024;
    const freed = await reopen();
    await freed.execute(INSERT_BATCH);
    await expectIntact(freed, (committed + 1) * ROWS_PER_BATCH);
    await freed.disconnect();
  });

  it('单文件布局：整文件覆盖写只用到一半配额，撞配额后重开即失败（现状）', async () => {
    const { fileSystem, client, reopen } = await writeUntilFull('single', { kind: 'single' });
    expect(fileSystem.usedBytes).toBeLessThan(QUOTA_BYTES * 0.6);
    await client.disconnect();

    // 重开失败后的清理还会再撞一次配额，lastQuotaError 是那一次的；这里只认链尾的平台原文
    const failure = await reopen().catch((error: unknown) => error);
    expect(causeChain(failure).at(-1)).toHaveProperty('message', QUOTA_MESSAGE);
  });
});
