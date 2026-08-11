/**
 * spec 004-local-field-encryption 用户故事 1（解耦 schema 定义与安全 CRUD）
 * 的跨 adapter 契约套件。
 *
 * runner 位于
 * `packages/rxdb-adapter-wa-sqlite/src/__tests__/encrypted-crud.spec.ts`
 * 与 `packages/rxdb-adapter-pglite/src/__tests__/encrypted-crud.spec.ts`，
 * 用各自的 adapter factory 和后端专有的 `readDatabaseFile` 读取器调用
 * `runCrudSuite` + `runQueryValidationSuite`。套件断言以下契约：
 * `specs/004-local-field-encryption/contracts/adapter-hooks.md`
 * （encrypt / decrypt hooks、patch walker、encryption 门面）
 * 与 `contracts/package-api.md`（信封形态）。
 *
 * 套件刻意保持实现无关：只触及面向开发者的 API（`adapter.encryption`、
 * repository statics）以及用于原始信封检视的 `adapter.query(...)`。
 */
import { getEntityMetadata } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectEncryptedRejection } from './error-contract.js';
import { ENCRYPTED_SENTINELS, EncryptedUser, SENTINEL_API, SENTINEL_CC, SENTINEL_JSON } from './fixtures.js';
import type { EncryptedCrudSuiteOptions, EncryptedSuiteOptions, EncryptedTestAdapter } from './types.js';

const DEFAULT_PASSPHRASE = 'test-passphrase-2025-encrypted-suite';

/** 与磁盘上当前 v2 AES-GCM-256 信封匹配的单元负载正则。 */
const ENVELOPE_REGEX = /^2\|AGCM256\|/;

function rowsAsObjects(result: {
  results: ReadonlyArray<{ columns: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<unknown>> }>;
}): Array<Record<string, unknown>> {
  if (result.results.length === 0) return [];
  const { columns, rows } = result.results[0];
  return rows.map(row => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
    return obj;
  });
}

async function scanRawFile(
  readDatabaseFile: (adapter: unknown) => Promise<Uint8Array>,
  adapter: unknown
): Promise<ReadonlyArray<string>> {
  const bytes = await readDatabaseFile(adapter);
  const hits: string[] = [];
  for (const sentinel of ENCRYPTED_SENTINELS) {
    const needle = new TextEncoder().encode(sentinel);
    const lastStart = bytes.length - needle.length;
    for (let start = 0; start <= lastStart; start += 1) {
      let offset = 0;
      while (offset < needle.length && bytes[start + offset] === needle[offset]) offset += 1;
      if (offset !== needle.length) continue;
      hits.push(sentinel);
      break;
    }
  }
  return hits;
}

function scanSerializedRows(value: unknown): ReadonlyArray<string> {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('Cannot scan storage rows: unsupported result value');
  return ENCRYPTED_SENTINELS.filter(sentinel => text.includes(sentinel));
}

/** 落盘形态与泄漏扫描两条用例共用的探针行标识。 */
const PROBE_NAME = 'crud_suite_probe';

/**
 * 断言 factory 兑现了 `EncryptedAdapterFactory.createAdapter` 声明的
 * **fresh / empty / isolated** 前置条件（RXT-029）。
 *
 * 套件里到处是「计数恰好等于 N」「扫描结果恰好为空」这类绝对断言 ——
 * 例如 `saveMany(1000)` 那条直接断言 `COUNT(*) WHERE name LIKE 'bulk_%'` 等于 1000。
 * 一旦某个 factory 改成复用持久化库，第二次运行会读到 2000，
 * 而失败信息只会说「expected 2000 to be 1000」，指向被测代码而不是真正的病因。
 * 这里在 `beforeAll` 里当场把契约违约喊出来，别让它伪装成加密层的缺陷。
 */
async function assertFreshDatabase(
  adapter: EncryptedTestAdapter,
  tableName: string,
  factoryName: string
): Promise<void> {
  const rows = rowsAsObjects(await adapter.query(`SELECT COUNT(*) AS c FROM ${tableName}`));
  expect(
    Number(rows[0]['c']),
    `${factoryName} 违反了 createAdapter 的 fresh/empty/isolated 契约：${tableName} 在套件开跑前就有数据（RXT-029）`
  ).toBe(0);
}

/**
 * CRUD 往返 + 磁盘泄漏契约（spec §FR-006、SC-001）。
 */
export function runCrudSuite(options: EncryptedCrudSuiteOptions): void {
  const { factory, readDatabaseFile } = options;
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  const meta = getEntityMetadata(EncryptedUser);
  // wa-sqlite 把实体表存为 `"${namespace}$${tableName}"`，
  // PGlite 则存为 `"${namespace}"."${tableName}"`。Factory 负责传入解析器。
  const tableName =
    options.resolveTableName?.({ namespace: meta.namespace, tableName: meta.tableName }) ??
    `"${meta.namespace}$${meta.tableName}"`;

  describe(`Encrypted CRUD round-trip [${factory.name}]`, () => {
    let adapter: EncryptedTestAdapter;

    beforeAll(async () => {
      adapter = await factory.createAdapter({ entities: [EncryptedUser] });
      await adapter.encryption.unlock({ passphrase });
      await assertFreshDatabase(adapter, tableName, factory.name);
      await seedProbeRow();
    });

    /**
     * 落盘形态与泄漏扫描这两条用例**自己不写数据**，只检视已经落在库里的东西。
     * 它们此前消费的是第一条往返用例留下的行 —— 于是单跑
     * `-t 'stores encrypted columns'` 得到 `expected 0 to be greater than 0`（假红），
     * 单跑 `-t 'leaks zero plaintext sentinels'` 扫一个空库、直接绿（假绿，更坏）。
     * arrange 属于 `beforeAll`，不属于前一条 `it`（RXT-023）。
     */
    async function seedProbeRow(): Promise<void> {
      const probe = new EncryptedUser();
      probe.name = PROBE_NAME;
      probe.creditCardInfo = SENTINEL_CC;
      probe.apiSecret = SENTINEL_API;
      probe.metadata = { hidden: SENTINEL_JSON };
      probe.loginCount = 1;
      probe.active = true;
      probe.lastSeenAt = new Date('2025-01-02T03:04:05.000Z');
      await probe.save();
    }

    /** 探针行必须在库里 —— 否则下面两条用例扫的是空气，会为了错误的理由通过。 */
    async function expectProbeRowPresent(): Promise<void> {
      const probe = rowsAsObjects(await adapter.query(`SELECT name FROM ${tableName} WHERE name = ?`, [PROBE_NAME]));
      expect(probe).toHaveLength(1);
    }

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('round-trips mixed JS types through the envelope', async () => {
      const user = new EncryptedUser();
      user.name = 'Alice';
      user.creditCardInfo = SENTINEL_CC;
      user.apiSecret = SENTINEL_API;
      user.metadata = { hidden: SENTINEL_JSON, nested: { deep: 7 } };
      user.loginCount = 42;
      user.active = true;
      user.lastSeenAt = new Date('2025-04-15T12:00:00.000Z');
      await user.save();

      const fetched = await firstValueFrom(EncryptedUser.get(user.id));
      expect(fetched.name).toBe('Alice');
      expect(fetched.creditCardInfo).toBe(SENTINEL_CC);
      expect(fetched.apiSecret).toBe(SENTINEL_API);
      expect(fetched.metadata).toEqual({ hidden: SENTINEL_JSON, nested: { deep: 7 } });
      expect(fetched.loginCount).toBe(42);
      expect(fetched.active).toBe(true);
      expect(fetched.lastSeenAt).toEqual(new Date('2025-04-15T12:00:00.000Z'));
    });

    it('stores encrypted columns as v2 AES-GCM-256 envelope strings on disk', async () => {
      await expectProbeRowPresent();
      const raw = await adapter.query(
        `SELECT name, creditCardInfo, apiSecret, metadata, loginCount, active, lastSeenAt FROM ${tableName}`
      );
      const rows = rowsAsObjects(raw);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        // 普通列直接透传。
        expect(typeof row['name']).toBe('string');
        // 加密列是信封字符串（跳过的场景下为 NULL）。
        for (const col of ['creditCardInfo', 'apiSecret', 'metadata', 'loginCount', 'active', 'lastSeenAt']) {
          const cell = row[col];
          if (cell === null) continue;
          expect(cell).toMatch(ENVELOPE_REGEX);
        }
      }
    });

    it('leaks zero plaintext sentinels across entity tables + change log + caches', async () => {
      await expectProbeRowPresent();
      const rawRows = await adapter.query(
        `SELECT creditCardInfo, apiSecret, metadata, loginCount, active, lastSeenAt FROM ${tableName} WHERE name = ?`,
        [PROBE_NAME]
      );
      expect(scanSerializedRows(rawRows.results)).toEqual([]);
      const leaks = await scanRawFile(readDatabaseFile, adapter);
      expect(leaks).toEqual([]);
    });

    it('keeps a large encrypted JSON value out of live overflow records and physical pages', async () => {
      const user = new EncryptedUser();
      user.name = 'OverflowCarrier';
      user.metadata = { hidden: SENTINEL_JSON, padding: 'x'.repeat(32_768) };
      await user.save();

      const rawRows = await adapter.query(`SELECT metadata FROM ${tableName} WHERE id = ?`, [user.id]);
      expect(scanSerializedRows(rawRows.results)).toEqual([]);
      expect(await scanRawFile(readDatabaseFile, adapter)).toEqual([]);

      const fetched = await firstValueFrom(EncryptedUser.get(user.id));
      expect(fetched.metadata).toEqual(user.metadata);
    });

    it('round-trips NULL encrypted columns without enveloping them', async () => {
      const user = new EncryptedUser();
      user.name = 'NullCarrier';
      user.creditCardInfo = null;
      user.apiSecret = null;
      user.metadata = null;
      user.loginCount = null;
      user.active = null;
      user.lastSeenAt = null;
      await user.save();

      const fetched = await firstValueFrom(EncryptedUser.get(user.id));
      expect(fetched.creditCardInfo).toBeNull();
      expect(fetched.apiSecret).toBeNull();
      expect(fetched.metadata).toBeNull();
      expect(fetched.loginCount).toBeNull();
      expect(fetched.active).toBeNull();
      expect(fetched.lastSeenAt).toBeNull();

      const raw = await adapter.query(
        `SELECT creditCardInfo, apiSecret, metadata, loginCount, active, lastSeenAt FROM ${tableName} WHERE id = ?`,
        [user.id]
      );
      const rows = rowsAsObjects(raw);
      expect(rows).toHaveLength(1);
      for (const cell of Object.values(rows[0])) {
        expect(cell).toBeNull();
      }
    });

    // RXT-025：往返用例此前只覆盖 truthy 值与 `null`。`if (!value)` 与 `if (value == null)`
    // 在这两类输入上**行为完全一致**，所以 adapter 只要写成前者（跳过加密、或把值写成 NULL），
    // 整套契约仍然全绿。下面两条把每种加密 PropertyType 的 falsy 非 null 值各钉一个：
    // `''`（string）/ `0`（integer）/ `false`（boolean）/ `new Date(0)`（date，`valueOf()` 为 0）。
    //
    // 两条必须分开：第一条证明值**回来了**，第二条证明它是以信封形态**落盘的** ——
    // 只有前者的话，一个「写 NULL、读回时按类型补默认值」的实现照样能骗过去。
    it('round-trips falsy non-null encrypted values (RXT-025)', async () => {
      const user = new EncryptedUser();
      user.name = 'FalsyCarrier';
      user.creditCardInfo = '';
      user.apiSecret = '';
      user.metadata = { zero: 0, empty: '', flag: false };
      user.loginCount = 0;
      user.active = false;
      user.lastSeenAt = new Date(0);
      await user.save();

      const fetched = await firstValueFrom(EncryptedUser.get(user.id));
      expect(fetched.creditCardInfo).toBe('');
      expect(fetched.apiSecret).toBe('');
      expect(fetched.metadata).toEqual({ zero: 0, empty: '', flag: false });
      expect(fetched.loginCount).toBe(0);
      expect(fetched.active).toBe(false);
      expect(fetched.lastSeenAt).toEqual(new Date(0));
    });

    // `-0` 单列一条。它对「falsy 短路」的检出力和 `0` 完全一样（两者都进 `!value`），
    // 所以钉的不是短路，而是**符号零不会把值整个吞掉**：`-0` 经 SQL INTEGER 与
    // `JSON.stringify`（`JSON.stringify(-0) === '0'`）都会归一成 `0`，这是存储层的既定语义，
    // 不是加密层的缺陷。因此断言写成数值相等而**不是** `Object.is(-0)` ——
    // 后者会红，但红的是 SQLite/PG 没有带符号零，与本 finding 无关。
    it('does not swallow negative zero on encrypted integer columns (RXT-025)', async () => {
      const user = new EncryptedUser();
      user.name = 'NegativeZero';
      user.loginCount = -0;
      await user.save();

      const fetched = await firstValueFrom(EncryptedUser.get(user.id));
      expect(fetched.loginCount).not.toBeNull();
      expect(fetched.loginCount === 0).toBe(true);
    });

    it('envelopes falsy encrypted cells instead of writing NULL (RXT-025)', async () => {
      const user = new EncryptedUser();
      user.name = 'FalsyOnDisk';
      user.creditCardInfo = '';
      user.apiSecret = '';
      user.metadata = { zero: 0 };
      user.loginCount = 0;
      user.active = false;
      user.lastSeenAt = new Date(0);
      await user.save();

      const raw = await adapter.query(
        `SELECT creditCardInfo, apiSecret, metadata, loginCount, active, lastSeenAt FROM ${tableName} WHERE id = ?`,
        [user.id]
      );
      const rows = rowsAsObjects(raw);
      expect(rows).toHaveLength(1);
      // 刻意**不**跳过 null：把「NULL 也算过」正是上面那条落盘用例的漏洞所在。
      for (const [column, cell] of Object.entries(rows[0])) {
        expect(`${column}=${String(cell)}`).toMatch(new RegExp(`^${column}=2\\|AGCM256\\|`));
      }
    });

    it('rebuilds the envelope on update so only the targeted cell rotates', async () => {
      const user = new EncryptedUser();
      user.name = 'Rotator';
      user.creditCardInfo = SENTINEL_CC;
      user.apiSecret = SENTINEL_API;
      user.metadata = null;
      user.loginCount = 1;
      user.active = true;
      user.lastSeenAt = new Date('2025-01-01T00:00:00.000Z');
      await user.save();

      const before = rowsAsObjects(
        await adapter.query(`SELECT creditCardInfo, apiSecret FROM ${tableName} WHERE id = ?`, [user.id])
      )[0];

      user.creditCardInfo = 'NEW-CARD-9999';
      await user.save();

      const after = rowsAsObjects(
        await adapter.query(`SELECT creditCardInfo, apiSecret FROM ${tableName} WHERE id = ?`, [user.id])
      )[0];

      // 只改目标列；未触及的列保持位级一致。
      expect(after['creditCardInfo']).not.toBe(before['creditCardInfo']);
      expect(after['apiSecret']).toBe(before['apiSecret']);

      const fetched = await firstValueFrom(EncryptedUser.get(user.id));
      expect(fetched.creditCardInfo).toBe('NEW-CARD-9999');
    });

    it('saveMany(1000 × 1 encrypted col) succeeds within SQLite 999-bind chunking', async () => {
      const batch: EncryptedUser[] = [];
      for (let i = 0; i < 1000; i++) {
        const u = new EncryptedUser();
        u.name = `bulk_${i}`;
        u.creditCardInfo = `card_${i}`;
        u.apiSecret = null;
        u.metadata = null;
        u.loginCount = null;
        u.active = null;
        u.lastSeenAt = null;
        batch.push(u);
      }
      await adapter.rxdb.entityManager.saveMany(batch);

      const countResult = await adapter.query(`SELECT COUNT(*) AS c FROM ${tableName} WHERE name LIKE 'bulk_%'`);
      const rows = rowsAsObjects(countResult);
      expect(Number(rows[0]['c'])).toBe(1000);
    });
  });
}

/**
 * Repository 级查询校验契约（T034a）。
 * 涉及加密列的每种查询形态必须**在** SQL 生成之前抛
 * `EncryptedQueryError`（带文档化的 `code`）——从 Repository 入口拦截，
 * 保证泄漏永远进不到 adapter。
 */
export function runQueryValidationSuite(options: Pick<EncryptedSuiteOptions, 'factory' | 'passphrase'>): void {
  const { factory } = options;
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;

  describe(`Encrypted query validation [${factory.name}]`, () => {
    let adapter: EncryptedTestAdapter;

    const expectRejectedBeforeQuery = async (run: () => Promise<unknown>, code: string): Promise<void> => {
      const before = factory.getQueryCount(adapter);
      await expectEncryptedRejection(run, code);
      expect(factory.getQueryCount(adapter)).toBe(before);
    };

    beforeAll(async () => {
      adapter = await factory.createAdapter({ entities: [EncryptedUser] });
      await adapter.encryption.unlock({ passphrase });
    });

    afterAll(async () => {
      if (adapter) await adapter.rxdb.disconnectAll();
    });

    it('observes SQL executed by the repository path', async () => {
      const before = factory.getQueryCount(adapter);
      await firstValueFrom(
        EncryptedUser.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'name', operator: '=', value: '__rxt019_query_probe__' }]
          }
        })
      );
      expect(factory.getQueryCount(adapter)).toBeGreaterThan(before);
    });

    it('rejects where on encrypted column (code: where_on_encrypted)', async () => {
      await expectRejectedBeforeQuery(
        () =>
          firstValueFrom(
            EncryptedUser.find({
              where: {
                combinator: 'and',
                rules: [{ field: 'creditCardInfo', operator: '=', value: 'x' }]
              }
            })
          ),
        'where_on_encrypted'
      );
    });

    it('rejects order on encrypted column (code: order_on_encrypted)', async () => {
      await expectRejectedBeforeQuery(
        () =>
          firstValueFrom(
            EncryptedUser.find({
              where: { combinator: 'and', rules: [] },
              orderBy: [{ field: 'creditCardInfo', sort: 'asc' }]
            })
          ),
        'order_on_encrypted'
      );
    });

    it('rejects group on encrypted column (code: group_on_encrypted)', async () => {
      await expectRejectedBeforeQuery(
        () =>
          firstValueFrom(
            EncryptedUser.find({
              where: { combinator: 'and', rules: [] },
              groupBy: ['creditCardInfo']
            })
          ),
        'group_on_encrypted'
      );
    });

    it('rejects projection on encrypted column (code: projection_on_encrypted)', async () => {
      await expectRejectedBeforeQuery(
        () =>
          firstValueFrom(
            EncryptedUser.find({
              where: { combinator: 'and', rules: [] },
              projection: ['creditCardInfo']
            })
          ),
        'projection_on_encrypted'
      );
    });
  });
}
