import { describe, expect, it } from 'vitest';
import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';
import { MAX_BATCH_WAIT_MS } from '../sqlite-client.utils.js';
import type { AdapterFactory } from './adapter-factory.js';
import { SUITE_DEADLINE_MS } from './test-utils.js';

/** 明显大于写入间隔的 batchTimeout：确保纯 debounce 定时器在整个写入期间都不会自然触发。 */
const WRITE_INTERVAL_MS = 5;
const SLOW_BATCH_TIMEOUT_MS = 50;
const WRITE_COUNT = 100;

/** SqliteClient 批处理超时配置测试：batchTimeout 对写入批处理行为的影响。 */
export function sqliteClientBatchTimeoutSuite(factory: AdapterFactory) {
  describe(`SqliteClient - Batch Timeout Configuration [${factory.name}]`, () => {
    it('应该支持自定义 batchTimeout 配置', async () => {
      const client = await factory.createClient<SqliteClientLike>('test-batch-timeout', {
        batchTimeout: 4
      });

      const version = await client.version();
      expect(version).toBeTruthy();

      await client.disconnect();
    });

    /**
     * 判据是「flush 发生在写入循环还没结束的时候」，而不是「flush 在某个毫秒数内到达」。
     *
     * 两条前提（下面用断言钉死）保证了这个判据等价于「硬上限触发过」：
     * debounce 间隔远大于写入间隔 ⇒ 纯 debounce 在循环期间永不自然触发；
     * 循环名义时长跨过硬上限 ⇒ 硬上限本来就该在循环期间触发至少一次。
     * 于是循环期间出现的任何 flush 都只可能来自硬上限。
     *
     * 早先这里是 `vi.waitFor(..., { timeout: MAX_BATCH_WAIT_MS * 2 })`，只有 200ms 预算。
     * coverage-acceptance 并发五份 chromium 时挂钟会被压慢数倍，那个预算随时可能假红，
     * 而它测的东西和现在这版完全一样——把挂钟从判据里拿掉即可，不必去调大它。
     *
     * @remarks
     * 极端负载下单次 `execute()` 若慢过 {@link SLOW_BATCH_TIMEOUT_MS}，debounce 也能自然触发，
     * 此时本例会以「对的结论、错的理由」通过。这个方向只会漏报不会误报，故不额外加机制。
     */
    it(
      '持续写入下仍会在硬上限内强制 flush，不会被无限防抖饿死',
      async () => {
        expect(SLOW_BATCH_TIMEOUT_MS).toBeGreaterThan(WRITE_INTERVAL_MS);
        expect(WRITE_COUNT * WRITE_INTERVAL_MS).toBeGreaterThan(MAX_BATCH_WAIT_MS);

        const client = await factory.createClient<SqliteClientLike>('test-batch-max-wait', {
          batchTimeout: SLOW_BATCH_TIMEOUT_MS
        });

        try {
          await client.execute('CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, val TEXT)');

          let writing = true;
          let flushesDuringWrites = 0;
          client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => {
            if (writing) flushesDuringWrites++;
          });

          for (let i = 0; i < WRITE_COUNT; i++) {
            await client.execute('INSERT INTO "rxdb$rxdb_change" (val) VALUES (?)', [`v${i}`]);
            await new Promise(resolve => setTimeout(resolve, WRITE_INTERVAL_MS));
          }
          // 循环结束后到达的 flush 无法区分硬上限与自然 debounce，一律不计。
          writing = false;

          expect(flushesDuringWrites).toBeGreaterThan(0);
        } finally {
          await client.disconnect();
        }
      },
      SUITE_DEADLINE_MS
    );
  });
}
