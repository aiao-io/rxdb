import type { DevToolsProviderDescriptor } from '@aiao/rxdb-devtools';
import { DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT } from '@aiao/rxdb-devtools';
import { createFakeProviderGear } from './fake-provider-gear';

/** 把 descriptors 翻成按领域索引的表，断言不必依赖集合内的顺序。 */
const byDomain = (gear: ReturnType<typeof createFakeProviderGear>): Record<string, DevToolsProviderDescriptor> =>
  Object.fromEntries(gear.descriptors.map(descriptor => [descriptor.domain, descriptor]));

/** files.list 普通模式的响应形状。 */
interface FakeListEntries {
  readonly entries: readonly { readonly path: string; readonly size: number }[];
}

/** files.list 快照模式的响应形状。 */
interface FakeSnapshotPage {
  readonly snapshotId: string;
  readonly records: readonly unknown[];
  readonly offset: number;
  readonly complete: boolean;
}

/** 普通模式：断言用 `entries`，失败直接抛。 */
const listEntries = async (gear: ReturnType<typeof createFakeProviderGear>) => {
  const result = await gear.provider('files').invoke('list', undefined);
  if (result.outcome !== 'ok') throw new Error(`files.list failed: ${JSON.stringify(result)}`);
  return result.result as FakeListEntries;
};

/** 快照模式：断言用 page 字段，失败直接抛。 */
const listSnapshot = async (gear: ReturnType<typeof createFakeProviderGear>, params: unknown) => {
  const result = await gear.provider('files').invoke('list', params);
  if (result.outcome !== 'ok') throw new Error(`files.list snapshot failed: ${JSON.stringify(result)}`);
  return result.result as FakeSnapshotPage;
};

/** expired 档的时钟推进手柄；缺席即装配坏了，直接抛。 */
const advanceIdle = (gear: ReturnType<typeof createFakeProviderGear>): (() => void) => {
  if (gear.advanceScenarioIdle === undefined) throw new Error('expired gear 缺时钟推进手柄');
  return gear.advanceScenarioIdle;
};

describe('fake-provider-gear 镜像档', () => {
  it('三领域 descriptors 镜像真实档：kind、runtime 与限额', () => {
    const gear = createFakeProviderGear('ok');
    const descriptors = byDomain(gear);

    expect(descriptors['database']).toMatchObject({ kind: 'rxdb', runtime: 'tauri' });
    expect(descriptors['files']).toMatchObject({ kind: 'native-files', runtime: 'tauri' });
    expect(descriptors['settings']).toMatchObject({ kind: 'sqlite', runtime: 'tauri' });
    for (const descriptor of Object.values(descriptors)) {
      expect(descriptor.limits.maxTransferBytes).toBe(DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT);
    }
  });

  it('database.inspect 注入平台失败，映射成 provider_unavailable', async () => {
    const result = await createFakeProviderGear('ok').provider('database').invoke('inspect', undefined);
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.error.code).toBe('provider_unavailable');
  });

  it('files.list 播下 /db.sqlite、/notes/a.md 与 700 字节的 /drv-bytes.bin', async () => {
    const result = await listEntries(createFakeProviderGear('ok'));
    expect(result.entries).toEqual([
      { path: '/db.sqlite', size: 4096 },
      { path: '/notes/a.md', size: 12 },
      { path: '/drv-bytes.bin', size: 700 }
    ]);
  });

  it('/drv-bytes.bin 能三块上传，并可按 requestId 下载同一份 700 字节', async () => {
    const gear = createFakeProviderGear('ok');

    const sink = gear.createChunkSink('/drv-bytes.bin');
    await sink.write(new Uint8Array(256).fill(1));
    await sink.write(new Uint8Array(256).fill(2));
    await sink.write(new Uint8Array(188).fill(3));
    await sink.commit();
    expect(gear.committedFiles()).toEqual([['/drv-bytes.bin', 700]]);

    await gear.provider('files').invoke('download', { path: '/drv-bytes.bin', requestId: 'req-1' });
    const source = gear.createChunkSource('req-1');
    expect(source?.totalBytes).toBe(700);
    const bytes = await source?.read(0, 188);
    expect(bytes?.byteLength).toBe(188);
    await source?.close();
    expect(gear.openChunkSources()).toBe(0);
  });
});

describe('fake-provider-gear snapshot 场景', () => {
  it('ok：首页 100 条，翻页后 complete', async () => {
    const gear = createFakeProviderGear('ok');
    const first = await listSnapshot(gear, { snapshot: { pageSize: 100 } });
    expect(first.records).toHaveLength(100);
    expect(first.complete).toBe(false);

    const second = await listSnapshot(gear, {
      snapshot: { cursor: { snapshotId: first.snapshotId, offset: first.offset + 100 } }
    });
    expect(second.records).toHaveLength(20);
    expect(second.complete).toBe(true);
  });

  it('busy：物化恒 invalidated，epoch 重试耗尽后答 snapshot_busy', async () => {
    const result = await createFakeProviderGear('busy').provider('files').invoke('list', { snapshot: {} });
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.error.code).toBe('snapshot_busy');
  });

  it('too_large：超记录上限答 snapshot_too_large', async () => {
    const result = await createFakeProviderGear('too_large').provider('files').invoke('list', { snapshot: {} });
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.error.code).toBe('snapshot_too_large');
  });

  it('expired：双开之后旧 cursor 翻页答 snapshot_expired', async () => {
    const gear = createFakeProviderGear('expired');

    const first = await listSnapshot(gear, { snapshot: { pageSize: 100 } });
    const second = await listSnapshot(gear, { snapshot: { pageSize: 100 } });
    expect(second.snapshotId).not.toBe(first.snapshotId);

    const result = await gear.provider('files').invoke('list', {
      snapshot: { cursor: { snapshotId: first.snapshotId, offset: 0 } }
    });
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.error.code).toBe('snapshot_expired');
  });

  it('expired：推进时钟后 idle 立即到期，同 cursor 的下一次翻页答 snapshot_expired（不必双开）', async () => {
    // 这一档与 ok 的差别全在时钟：cursor idle 一挂上就到期。没有它的话，expired 与 ok
    // 在 wire 上逐字节相同，那一档的 env 值、Rust 校验和一整次 e2e 启动什么都没验到。
    const gear = createFakeProviderGear('expired');

    const first = await listSnapshot(gear, { snapshot: { pageSize: 100 } });
    expect(first.records).toHaveLength(100);
    // 显式推进场景时钟：idle 回调即刻到期，快照在交付首页后随即被释放。
    // 不赌真实 0 ms 计时器与下一次请求谁先到——那正是 e2e 在慢 runner 上偶发 timedOut 的根因。
    advanceIdle(gear)();

    const result = await gear.provider('files').invoke('list', {
      snapshot: { cursor: { snapshotId: first.snapshotId, offset: first.offset + 100 } }
    });
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.error.code).toBe('snapshot_expired');
  });

  it('expired：不推进时钟时 idle 不到期——同 cursor 的下一次翻页照常交付（不赌事件循环顺序）', async () => {
    const gear = createFakeProviderGear('expired');

    const first = await listSnapshot(gear, { snapshot: { pageSize: 100 } });
    // 让出一个宏任务：两次翻页之间若只有微任务，旧实现的真实 0 ms idle 计时器根本没机会触发，
    // 这条用例就钉不住「不推进就不到期」。让出之后，真实计时器必然已到期、快照已释放；
    // 显式推进版里没人推进，快照必须还活着，第二页照常交付。
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = await listSnapshot(gear, {
      snapshot: { cursor: { snapshotId: first.snapshotId, offset: first.offset + 100 } }
    });
    expect(second.records).toHaveLength(20);
    expect(second.complete).toBe(true);
  });

  it('参数形状探针：畸形 spec 答 invalid_path，越界 pageSize 答 invalid_message', async () => {
    const gear = createFakeProviderGear('ok');

    // 畸形 spec 在分派层就拒掉（invalid_path），根本不进 store；越界 pageSize 是形状合法、
    // 范围非法，由 store 的 guard 答控制面码 invalid_message —— 两码分属两条路径。
    for (const snapshot of [null, 'x', 3, { pageSize: '100' }, { cursor: 'x' }]) {
      const malformed = await gear.provider('files').invoke('list', { snapshot });
      expect(malformed.outcome).toBe('failed');
      if (malformed.outcome === 'failed') expect(malformed.error.code).toBe('invalid_path');
    }

    const ranged = await gear.provider('files').invoke('list', { snapshot: { pageSize: 0 } });
    expect(ranged.outcome).toBe('failed');
    if (ranged.outcome === 'failed') expect(ranged.error.code).toBe('invalid_message');
  });
});
