import {
  RXDB_BACKUP_SCOPE,
  RxDBBackupError,
  type RxDB,
  type RxDBBackupManifest,
  type RxDBBackupResult,
  type RxDBRestoreResult
} from '@aiao/rxdb';
import {
  BACKUP_PROBE_KEY,
  backupProbeMode,
  installBackupProbe,
  type BackupProbe,
  type BackupProbeArchiveOps
} from './backup-probe';

/** 探针只转交结果，不解读 manifest 的内容；给一份形状对得上的即可。 */
const MANIFEST = { scope: RXDB_BACKUP_SCOPE } as unknown as RxDBBackupManifest;
const RESULT = { manifest: MANIFEST, scope: RXDB_BACKUP_SCOPE } as unknown as RxDBBackupResult & RxDBRestoreResult;
const DATABASE = {} as RxDB;

/** 跨过恢复读块大小的负载：解码后必须逐字节回到 `ops.restore` 手里。 */
const ARCHIVE = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256);

const probeOf = (runtime: Record<string, unknown>): BackupProbe => runtime[BACKUP_PROBE_KEY] as BackupProbe;

const readAll = async (source: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return Uint8Array.from(chunks.flatMap(chunk => [...chunk]));
};

/** 备份写三块、恢复把收到的字节记下来的假实现。 */
const recordingOps = () => {
  const restored: Uint8Array[] = [];
  const ops: BackupProbeArchiveOps = {
    backup: async (_rxdb, sink) => {
      const writer = sink.getWriter();
      for (const offset of [0, 70_000, 140_000]) await writer.write(ARCHIVE.subarray(offset, offset + 70_000));
      await writer.close();
      return RESULT;
    },
    restore: async (_rxdb, source) => {
      restored.push(await readAll(source));
      return RESULT;
    }
  };
  return { ops, restored };
};

const failingOps = (error: unknown): BackupProbeArchiveOps => ({
  backup: () => Promise.reject(error),
  restore: async (_rxdb, source) => {
    await source.cancel();
    throw error;
  }
});

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

describe('backupProbeMode', () => {
  it('没有 location 或查询参数时不开探针', () => {
    expect(backupProbeMode({})).toBeUndefined();
    expect(backupProbeMode(undefined)).toBeUndefined();
    expect(backupProbeMode({ location: { search: '' } })).toBeUndefined();
    expect(backupProbeMode({ location: { search: '?pglite=1' } })).toBeUndefined();
  });

  it.each(['backup', 'restore'] as const)('读出模式 %s，与 pglite=1 互不干扰', mode => {
    expect(backupProbeMode({ location: { search: `?backup-probe=${mode}` } })).toBe(mode);
    expect(backupProbeMode({ location: { search: `?pglite=1&backup-probe=${mode}` } })).toBe(mode);
  });

  // 拼错的模式不能静默当成「没开」：e2e 会一直等一个永远不会出现的全局。
  it('不认识的模式直接报错', () => {
    expect(() => backupProbeMode({ location: { search: '?backup-probe=restroe' } })).toThrow(RangeError);
  });
});

describe('installBackupProbe', () => {
  it('backup 模式：不拦连接，备份整份归档以 base64 交回并带上范围声明', async () => {
    const runtime: Record<string, unknown> = {};
    const { ops } = recordingOps();
    await installBackupProbe(runtime, 'backup', DATABASE, ops);

    const probe = probeOf(runtime);
    expect(probe.mode).toBe('backup');
    const outcome = await probe.backup();
    expect(outcome).toEqual({
      status: 'ok',
      archive: toBase64(ARCHIVE),
      byteLength: ARCHIVE.byteLength,
      scope: RXDB_BACKUP_SCOPE,
      manifest: MANIFEST
    });
  });

  it('backup 失败时交回可判别的错误码，而不是一句异常文本', async () => {
    const runtime: Record<string, unknown> = {};
    await installBackupProbe(
      runtime,
      'backup',
      DATABASE,
      failingOps(new RxDBBackupError('target_busy', 'busy', { details: { field: 'x' } }))
    );
    expect(await probeOf(runtime).backup()).toEqual({ status: 'failed', code: 'target_busy', message: 'busy' });
  });

  it('非备份错误以错误名作码', async () => {
    const runtime: Record<string, unknown> = {};
    await installBackupProbe(runtime, 'backup', DATABASE, failingOps(new TypeError('boom')));
    expect(await probeOf(runtime).backup()).toEqual({ status: 'failed', code: 'TypeError', message: 'boom' });
  });

  it('backup 模式下拒绝恢复：库已经连上了', async () => {
    const runtime: Record<string, unknown> = {};
    const { ops, restored } = recordingOps();
    await installBackupProbe(runtime, 'backup', DATABASE, ops);
    expect(await probeOf(runtime).restore(toBase64(ARCHIVE))).toMatchObject({
      status: 'failed',
      code: 'invalid_state'
    });
    expect(restored).toEqual([]);
  });

  it('restore 模式：连接等到一次成功恢复之后，归档逐字节交给恢复', async () => {
    const runtime: Record<string, unknown> = {};
    const { ops, restored } = recordingOps();
    let gateOpened = false;
    const gate = installBackupProbe(runtime, 'restore', DATABASE, ops).then(() => (gateOpened = true));

    await Promise.resolve();
    expect(gateOpened).toBe(false);

    const probe = probeOf(runtime);
    expect(probe.mode).toBe('restore');
    expect(await probe.restore(toBase64(ARCHIVE))).toEqual({
      status: 'ok',
      scope: RXDB_BACKUP_SCOPE,
      manifest: MANIFEST
    });
    await gate;
    expect(gateOpened).toBe(true);
    expect(restored).toEqual([ARCHIVE]);

    // 同一次启动只恢复一次：库此刻已经在连接了。
    expect(await probe.restore(toBase64(ARCHIVE))).toMatchObject({ status: 'failed', code: 'invalid_state' });
    expect(restored).toHaveLength(1);
  });

  it('restore 失败：探针交回错误码，连接闸门带着同一个错误拒绝', async () => {
    const runtime: Record<string, unknown> = {};
    const error = new RxDBBackupError('target_not_empty', 'not empty', { details: { field: 'x' } });
    const gate = installBackupProbe(runtime, 'restore', DATABASE, failingOps(error));
    const rejected = expect(gate).rejects.toBe(error);

    expect(await probeOf(runtime).restore(toBase64(ARCHIVE))).toEqual({
      status: 'failed',
      code: 'target_not_empty',
      message: 'not empty'
    });
    await rejected;
  });
});
