/**
 * @vitest-environment node
 *
 * 探针只用 Web Streams，不碰 DOM；happy-dom 自带的 `WritableStream` 缺 `getWriter()`，换成 Node 的实现。
 */
import type { RxDBBackupResult, RxDBRestoreResult } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import {
  ARCHIVE_CHUNK_BYTES,
  backupToArchive,
  restoreFromArchive,
  type BackupArchiveChannel,
  type BackupProbeArchiveOps,
  type BackupProbeDatabase
} from './backup-probe';

const DATABASE_ONLY = { database: 'included', externalFiles: 'excluded' } as const;

/** 结果里探针只读 `scope` 与 `manifest.scope`，其余字段与这里的断言无关。 */
const result = { scope: DATABASE_ONLY, manifest: { scope: DATABASE_ONLY } } as unknown as RxDBBackupResult &
  RxDBRestoreResult;

const database = {} as BackupProbeDatabase;

/** 一个落在内存里的归档通道：`append` 追加，`read` 按偏移切片，越过末尾给空块。 */
const memoryChannel = (initial: Uint8Array = new Uint8Array()) => {
  let archive = initial;
  const reads: [number, number][] = [];
  const channel: BackupArchiveChannel = {
    append: vi.fn(async (chunk: Uint8Array) => {
      const next = new Uint8Array(archive.byteLength + chunk.byteLength);
      next.set(archive);
      next.set(chunk, archive.byteLength);
      archive = next;
    }),
    read: vi.fn(async (offset: number, length: number) => {
      reads.push([offset, length]);
      return archive.slice(offset, offset + length);
    })
  };
  return { channel, reads, archive: () => archive };
};

const bytes = (length: number): Uint8Array => Uint8Array.from({ length }, (_, index) => (index * 31) % 256);

/** 把可读流整份读出来；只给恢复方向的 fake ops 用。 */
const drain = async (source: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  const total = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    total.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return total;
};

describe('backupToArchive', () => {
  /** 每一块都在 sink 的 `write` 里交给通道：逐块落盘，而不是攒成一整块再交（AC#9）。 */
  it('按块把归档交给通道，并报出范围声明与字节数', async () => {
    const { channel, archive } = memoryChannel();
    const written = [bytes(10), bytes(70_000), bytes(3)];
    const ops: BackupProbeArchiveOps = {
      backup: async (_database, sink) => {
        const writer = sink.getWriter();
        for (const chunk of written) await writer.write(chunk);
        await writer.close();
        return result;
      },
      restore: vi.fn()
    };

    await expect(backupToArchive(database, ops, channel)).resolves.toEqual({
      mode: 'backup',
      byteLength: 70_013,
      scope: DATABASE_ONLY,
      manifestScope: DATABASE_ONLY
    });
    expect(channel.append).toHaveBeenCalledTimes(3);
    expect(archive().byteLength).toBe(70_013);
  });

  /** 通道写失败必须让备份本身失败：吞掉的话报告写着 ok，而磁盘上是一份截断的归档。 */
  it('通道写失败时备份随之失败', async () => {
    const channel: BackupArchiveChannel = {
      append: async () => {
        throw new Error('disk full');
      },
      read: vi.fn()
    };
    const ops: BackupProbeArchiveOps = {
      backup: async (_database, sink) => {
        await sink.getWriter().write(bytes(4));
        return result;
      },
      restore: vi.fn()
    };

    await expect(backupToArchive(database, ops, channel)).rejects.toThrow('disk full');
  });

  it('备份失败原样向上抛', async () => {
    const failure = new Error('target_busy');
    const ops: BackupProbeArchiveOps = { backup: async () => Promise.reject(failure), restore: vi.fn() };
    await expect(backupToArchive(database, ops, memoryChannel().channel)).rejects.toBe(failure);
  });
});

describe('restoreFromArchive', () => {
  /** 读块大小有上限，偏移逐块推进，读到空块就关流——恢复看到的字节与归档逐字节相同。 */
  it('按偏移逐块读回整份归档', async () => {
    const archive = bytes(ARCHIVE_CHUNK_BYTES * 2 + 5);
    const { channel, reads } = memoryChannel(archive);
    let restored: Uint8Array = new Uint8Array();
    const ops: BackupProbeArchiveOps = {
      backup: vi.fn(),
      restore: async (_database, source) => {
        restored = await drain(source);
        return result;
      }
    };

    await expect(restoreFromArchive(database, ops, channel)).resolves.toEqual({
      mode: 'restore',
      byteLength: archive.byteLength,
      scope: DATABASE_ONLY,
      manifestScope: DATABASE_ONLY
    });
    expect(restored).toEqual(archive);
    expect(reads).toEqual([
      [0, ARCHIVE_CHUNK_BYTES],
      [ARCHIVE_CHUNK_BYTES, ARCHIVE_CHUNK_BYTES],
      [ARCHIVE_CHUNK_BYTES * 2, ARCHIVE_CHUNK_BYTES],
      [ARCHIVE_CHUNK_BYTES * 2 + 5, ARCHIVE_CHUNK_BYTES]
    ]);
  });

  /** 背压：消费者不读，通道就不再往下读——流不预取整份归档。 */
  it('消费者不拉取时不往下读', async () => {
    const { channel, reads } = memoryChannel(bytes(ARCHIVE_CHUNK_BYTES * 8));
    const ops: BackupProbeArchiveOps = {
      backup: vi.fn(),
      restore: async (_database, source) => {
        const reader = source.getReader();
        await reader.read();
        await new Promise(resolve => setTimeout(resolve, 10));
        await reader.cancel();
        return result;
      }
    };

    await restoreFromArchive(database, ops, channel);
    expect(reads.length).toBeLessThanOrEqual(2);
  });

  it('恢复失败原样向上抛', async () => {
    const failure = new Error('format_mismatch');
    const ops: BackupProbeArchiveOps = { backup: vi.fn(), restore: async () => Promise.reject(failure) };
    await expect(restoreFromArchive(database, ops, memoryChannel(bytes(3)).channel)).rejects.toBe(failure);
  });
});
