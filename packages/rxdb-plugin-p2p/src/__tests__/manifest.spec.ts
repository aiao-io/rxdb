import { afterEach, describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest } from '../chunking.js';
import {
  createAuthenticatedP2PFileManifest,
  createManifestRecord,
  deriveHolderId,
  findP2PFileHolders,
  isManifestOwnedBy,
  isP2PManifestRecord,
  manifestId,
  P2PManifestStore,
  type P2PManifestRecord
} from '../manifest.js';
import type { P2PPrincipal } from '../session/identity.js';

const laptop: P2PPrincipal = { principal: 'user-a', deviceId: 'laptop' };
const desktop: P2PPrincipal = { principal: 'user-a', deviceId: 'desktop' };

const recordFixture = (
  options: { readonly principal?: P2PPrincipal; readonly updatedAt?: number } = {}
): Promise<P2PManifestRecord> =>
  createAuthenticatedP2PFileManifest({
    principal: options.principal ?? laptop,
    fileName: 'x',
    size: 3,
    chunkSize: 2,
    updatedAt: options.updatedAt ?? 10,
    readChunk: async (offset, size) => Uint8Array.from({ length: size }, (_, index) => offset + index)
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('P2P 持有者身份', () => {
  it('holderId 由用户与设备共同派生：同一设备稳定，同一用户的不同设备互不相同', async () => {
    const [first, second] = await Promise.all([recordFixture(), recordFixture()]);
    expect(first.holderId).toBe(deriveHolderId(laptop));
    expect(first.holderId).toBe(second.holderId);
    expect(deriveHolderId(desktop)).not.toBe(first.holderId);
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isManifestOwnedBy(first, laptop)).toBe(true);
    expect(isManifestOwnedBy(first, desktop)).toBe(false);
  });

  it('拒绝空主体、空设备、非法时间戳和畸形清单 id', async () => {
    expect(() => deriveHolderId({ principal: ' ', deviceId: 'laptop' })).toThrow(TypeError);
    expect(() => deriveHolderId({ principal: 'user-a', deviceId: ' ' })).toThrow(TypeError);
    const manifest = await createP2PFileManifest({
      fileName: 'x',
      size: 0,
      chunkSize: 1024,
      readChunk: async () => new Uint8Array()
    });
    expect(() => createManifestRecord(manifest, { principal: laptop, now: -1 })).toThrow(RangeError);
    expect(() => manifestId('bad', 'holder')).toThrow(TypeError);
  });

  it('同一用户的两台设备各自登记、各自撤回持有声明', async () => {
    const [onLaptop, onDesktop] = await Promise.all([recordFixture(), recordFixture({ principal: desktop })]);
    const store = new P2PManifestStore();
    store.upsertForSubject(onLaptop, laptop);
    store.upsertForSubject(onDesktop, desktop);
    expect(store.findHolders(onLaptop.contentHash)).toHaveLength(2);

    expect(store.revoke(onLaptop.contentHash, onLaptop.holderId)).toBe(true);

    expect(store.findHolders(onLaptop.contentHash).map(record => record.holderId)).toEqual([onDesktop.holderId]);
  });
});

describe('持有声明的生命周期', () => {
  it('持有声明不带过期时间：时间流逝不会让声明从查询或仓库里消失', async () => {
    const record = await recordFixture();
    expect(record).not.toHaveProperty('expiresAt');
    const store = new P2PManifestStore();
    store.upsert(record);

    vi.useFakeTimers({ now: record.updatedAt + 24 * 60 * 60 * 1000 });

    expect(findP2PFileHolders([record], record.contentHash)).toEqual([record]);
    expect(store.findHolders(record.contentHash)).toEqual([record]);
    expect(store.size).toBe(1);
  });

  it('不拿本机时钟比较远端时间戳：持有方时钟更快时照样返回', async () => {
    const record = await recordFixture({ updatedAt: Date.now() + 60 * 60 * 1000 });
    const store = new P2PManifestStore();
    store.upsert(record);
    expect(findP2PFileHolders([record], record.contentHash)).toHaveLength(1);
    expect(store.findHolders(record.contentHash)).toHaveLength(1);
  });

  it('按 holder 保留最新一行，结果按 updatedAt 倒序，并过滤无关内容', async () => {
    const onLaptop = await recordFixture();
    const onDesktop = await recordFixture({ principal: desktop });
    const latest = { ...onLaptop, updatedAt: 90 };
    const other = { ...onDesktop, updatedAt: 50 };
    const unrelated = { ...onDesktop, contentHash: 'f'.repeat(64), id: manifestId('f'.repeat(64), onDesktop.holderId) };
    expect(
      findP2PFileHolders(
        [{ ...onLaptop, updatedAt: 80 }, latest, other, { ...onLaptop, updatedAt: 1 }, unrelated],
        onLaptop.contentHash
      )
    ).toEqual([latest, other]);
  });

  it('跳过结构畸形的同步行，一行坏数据不挡住同 holder 的有效声明', async () => {
    const record = await recordFixture();
    const forged = { ...record, updatedAt: 999, chunkHashes: [...record.chunkHashes, 'f'.repeat(64)] };
    expect(findP2PFileHolders([record, forged], record.contentHash)).toEqual([record]);
  });
});

describe('同步行的结构校验', () => {
  it('只接受与内容寻址规则一致的记录', async () => {
    const record = await recordFixture();
    expect(isP2PManifestRecord(record)).toBe(true);
    const malformed: unknown[] = [
      null,
      'record',
      { ...record, id: 'bad' },
      { ...record, contentHash: 'A'.repeat(64) },
      { ...record, fileName: '' },
      { ...record, size: -1 },
      { ...record, size: 1.5 },
      { ...record, chunkSize: 0 },
      { ...record, chunkSize: 2 * 1024 * 1024 },
      { ...record, chunkHashes: ['zz', record.chunkHashes[1]] },
      { ...record, chunkHashes: record.chunkHashes.slice(1) },
      { ...record, chunkHashes: 'not-an-array' },
      { ...record, sourceUrl: 42 },
      { ...record, holderId: 'holder_xyz' },
      { ...record, updatedAt: -1 }
    ];
    for (const value of malformed) expect(isP2PManifestRecord(value)).toBe(false);
    expect(isP2PManifestRecord({ ...record, sourceUrl: 'https://files.example/x' })).toBe(true);
  });
});

describe('P2PManifestStore', () => {
  it('拒绝伪造 holder 与畸形记录，忽略旧写入和同刻重放', async () => {
    const record = await recordFixture();
    const store = new P2PManifestStore();
    expect(() => store.upsert({ ...record, id: 'bad' })).toThrow(/manifest id/);
    expect(() => store.upsertForSubject(record, desktop)).toThrow(/holderId/);
    expect(() => store.upsert({ ...record, chunkHashes: ['zz', 'zz'] })).toThrow(/chunkHashes/);
    expect(() => store.revoke(record.contentHash, record.holderId, -1)).toThrow(RangeError);
    store.upsert(record);
    store.upsert({ ...record, updatedAt: 1 });
    expect(store.findHolders(record.contentHash)[0]?.updatedAt).toBe(10);
    store.upsert({ ...record, fileName: 'same-time-replay' });
    expect(store.findHolders(record.contentHash)[0]?.fileName).toBe('x');
  });

  it('撤回后挡住旧重放，并接受持有方时钟上更新的重新声明，不拿本机时钟当墓碑', async () => {
    vi.useFakeTimers({ now: 10_000_000 });
    const record = await recordFixture({ updatedAt: 10 });
    const store = new P2PManifestStore();
    store.upsert(record);

    expect(store.revoke(record.contentHash, record.holderId)).toBe(true);
    store.upsert(record);
    expect(store.findHolders(record.contentHash)).toEqual([]);

    store.upsert({ ...record, updatedAt: 11 });
    expect(store.findHolders(record.contentHash)).toHaveLength(1);
  });

  it('撤回本地还没见过的声明时，按调用方给的撤回时刻挡住旧重放', async () => {
    const record = await recordFixture({ updatedAt: 40 });
    const store = new P2PManifestStore();
    expect(store.revoke(record.contentHash, record.holderId, 50)).toBe(false);
    store.upsert(record);
    expect(store.findHolders(record.contentHash)).toEqual([]);
    store.upsert({ ...record, updatedAt: 60 });
    expect(store.findHolders(record.contentHash)).toHaveLength(1);
  });

  it('晚到的旧撤回删不掉持有方此后重新登记的声明', async () => {
    const record = await recordFixture({ updatedAt: 300 });
    const store = new P2PManifestStore();
    store.upsert(record);

    expect(store.revoke(record.contentHash, record.holderId, 100)).toBe(false);

    expect(store.findHolders(record.contentHash)).toEqual([record]);
  });

  it('撤回时刻与声明同刻也撤回：同刻重放随后被挡住', async () => {
    const record = await recordFixture({ updatedAt: 300 });
    const store = new P2PManifestStore();
    store.upsert(record);

    expect(store.revoke(record.contentHash, record.holderId, 300)).toBe(true);
    store.upsert(record);

    expect(store.findHolders(record.contentHash)).toEqual([]);
  });

  it('墓碑只升不降：乱序撤回与重复的无时刻撤回都不会让旧声明复活', async () => {
    const record = await recordFixture({ updatedAt: 50 });
    const store = new P2PManifestStore();

    expect(store.revoke(record.contentHash, record.holderId, 200)).toBe(false);
    expect(store.revoke(record.contentHash, record.holderId, 100)).toBe(false);
    expect(store.revoke(record.contentHash, record.holderId)).toBe(false);
    for (const updatedAt of [50, 100, 200]) store.upsert({ ...record, updatedAt });
    expect(store.findHolders(record.contentHash)).toEqual([]);

    store.upsert({ ...record, updatedAt: 201 });
    expect(store.findHolders(record.contentHash).map(found => found.updatedAt)).toEqual([201]);
  });

  it('声明与撤回乱序到达时，按持有方时钟以最新的一次为准', async () => {
    const record = await recordFixture({ updatedAt: 100 });
    const store = new P2PManifestStore();
    // 持有方时间线：100 登记 → 200 撤回 → 300 重新登记 → 400 撤回；同步按下面的顺序到达。
    store.upsert({ ...record, updatedAt: 300 });
    expect(store.revoke(record.contentHash, record.holderId, 200)).toBe(false);
    store.upsert(record);
    expect(store.findHolders(record.contentHash).map(found => found.updatedAt)).toEqual([300]);

    expect(store.revoke(record.contentHash, record.holderId, 400)).toBe(true);
    store.upsert({ ...record, updatedAt: 300 });
    expect(store.findHolders(record.contentHash)).toEqual([]);
  });

  it('查询返回副本，调用方改动不会写回仓库', async () => {
    const record = await recordFixture();
    const store = new P2PManifestStore();
    store.upsert(record);
    const [found] = store.findHolders(record.contentHash);
    (found.chunkHashes as string[]).length = 0;
    expect(store.findHolders(record.contentHash)[0]?.chunkHashes).toEqual(record.chunkHashes);
  });
});
