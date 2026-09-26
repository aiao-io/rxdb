/**
 * @fileoverview US-217 归档编解码：分帧、摘要、截断 / 篡改 / 越界的分类。
 *
 * @remarks
 * 恢复在把任何字节写进目标之前只能靠这一层识别坏归档（AC#6），所以每类损坏都要落到稳定的
 * `code`，不能是 `JSON.parse` 或 `RangeError` 之类的偶然异常。
 */

import { describe, expect, it } from 'vitest';
import {
  RXDB_BACKUP_CHUNK_SIZE,
  RxDBBackupArchiveReader,
  RxDBBackupArchiveWriter,
  type RxDBBackupArchiveItem
} from '../../backup/backup-archive.js';
import { RxDBBackupError, type RxDBBackupErrorCode } from '../../backup/backup-error.js';
import {
  FRAME_DATA,
  FRAME_ENTRY,
  FRAME_MANIFEST,
  FRAME_TRAILER,
  MAGIC,
  buildArchive,
  collectingSink,
  concatBytes,
  frame,
  jsonFrame,
  patternBytes,
  sampleManifest,
  sha256Of,
  sourceOf
} from './fixtures/archive.js';

interface ReadBack {
  manifest: unknown;
  files: Map<string, Uint8Array>;
  directories: string[];
  trailer: unknown;
  maxDataFrame: number;
}

const readAll = async (source: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<ReadBack> => {
  const reader = new RxDBBackupArchiveReader(source.getReader(), signal);
  const result: ReadBack = {
    manifest: await reader.readManifest(),
    files: new Map(),
    directories: [],
    trailer: undefined,
    maxDataFrame: 0
  };
  const pending: Uint8Array[] = [];
  let current = '';
  const flush = () => {
    if (current) result.files.set(current, concatBytes(pending.splice(0)));
  };
  for (let item: RxDBBackupArchiveItem = await reader.next(); ; item = await reader.next()) {
    if (item.type === 'end') {
      flush();
      result.trailer = item.trailer;
      return result;
    }
    if (item.type === 'data') {
      pending.push(item.bytes.slice());
      result.maxDataFrame = Math.max(result.maxDataFrame, item.bytes.length);
      continue;
    }
    flush();
    current = '';
    if (item.header.kind === 'directory') result.directories.push(item.header.path);
    else current = item.header.path;
  }
};

const expectBackupError = async (promise: Promise<unknown>, code: RxDBBackupErrorCode, field?: string) => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(RxDBBackupError);
  expect((error as RxDBBackupError).code).toBe(code);
  if (field !== undefined) expect((error as RxDBBackupError).details.field).toBe(field);
  return error as RxDBBackupError;
};

const FILES: ReadonlyArray<[string, Uint8Array]> = [
  ['base/1/empty', new Uint8Array(0)],
  ['base/1/one', Uint8Array.of(42)],
  ['base/1/exact', patternBytes(RXDB_BACKUP_CHUNK_SIZE, 3)],
  ['base/1/over', patternBytes(RXDB_BACKUP_CHUNK_SIZE + 1, 5)],
  ['global/big', patternBytes(200_000, 11)]
];

const writeSample = async (sinkStream: WritableStream<Uint8Array>, pieceSize = 50_000) => {
  const writer = new RxDBBackupArchiveWriter(sinkStream.getWriter());
  await writer.writeManifest(sampleManifest());
  await writer.beginEntry({ path: 'base', kind: 'directory', size: 0 });
  await writer.beginEntry({ path: 'base/1', kind: 'directory', size: 0 });
  await writer.beginEntry({ path: 'global', kind: 'directory', size: 0 });
  for (const [path, bytes] of FILES) {
    await writer.beginEntry({ path, kind: 'file', size: bytes.length });
    for (let offset = 0; offset < bytes.length; offset += pieceSize) {
      await writer.writeData(bytes.subarray(offset, offset + pieceSize));
    }
  }
  return writer.finish();
};

const sampleArchive = async (): Promise<Uint8Array> => {
  const sink = collectingSink();
  await writeSample(sink.stream);
  return sink.bytes();
};

describe('RxDBBackupArchiveWriter / Reader 往返', () => {
  it('写出的归档逐字节读回，结束标记与实际内容一致', async () => {
    const sink = collectingSink();
    const trailer = await writeSample(sink.stream);
    const bytes = sink.bytes();

    const totalBytes = FILES.reduce((sum, [, data]) => sum + data.length, 0);
    expect(trailer).toEqual({ entries: 3 + FILES.length, bytes: totalBytes, sha256: expect.any(String) });

    const trailerFrameLength = 5 + trailerPayloadLength(bytes);
    expect(trailer.sha256).toBe(sha256Of(bytes.subarray(0, bytes.length - trailerFrameLength)));

    const back = await readAll(sourceOf(bytes, 4093));
    expect(back.manifest).toEqual(sampleManifest());
    expect(back.directories).toEqual(['base', 'base/1', 'global']);
    expect([...back.files.keys()]).toEqual(FILES.map(([path]) => path));
    for (const [path, data] of FILES) expect(back.files.get(path)).toEqual(data);
    expect(back.trailer).toEqual(trailer);
  });

  it('数据帧不超过 RXDB_BACKUP_CHUNK_SIZE，即便调用方一次写入更大的块', async () => {
    const sink = collectingSink();
    await writeSample(sink.stream, 300_000);
    const back = await readAll(sourceOf(sink.bytes()));
    expect(back.maxDataFrame).toBe(RXDB_BACKUP_CHUNK_SIZE);
    expect(Math.max(...sink.chunks.map(chunk => chunk.length))).toBeLessThanOrEqual(RXDB_BACKUP_CHUNK_SIZE + 5);
  });

  it.each([1, 7, RXDB_BACKUP_CHUNK_SIZE + 3])('输入流按 %i 字节切片不影响解析', async pieceSize => {
    const bytes = await sampleArchive();
    const back = await readAll(sourceOf(bytes, pieceSize));
    expect(back.files.get('global/big')).toEqual(FILES[4][1]);
  });

  it('写入方不改动调用方传入的缓冲区', async () => {
    const sink = collectingSink();
    const writer = new RxDBBackupArchiveWriter(sink.stream.getWriter());
    const data = patternBytes(100);
    const copy = data.slice();
    await writer.writeManifest(sampleManifest());
    await writer.beginEntry({ path: 'f', kind: 'file', size: 100 });
    await writer.writeData(data);
    data.fill(0);
    await writer.finish();
    const back = await readAll(sourceOf(sink.bytes()));
    expect(back.files.get('f')).toEqual(copy);
  });
});

/**
 * 最后一帧是结束标记：从尾部倒推它的 JSON 载荷长度。
 */
function trailerPayloadLength(bytes: Uint8Array): number {
  for (let length = 1; length < 4096; length += 1) {
    const start = bytes.length - length - 5;
    if (bytes[start] !== FRAME_TRAILER) continue;
    if (new DataView(bytes.buffer, start + 1, 4).getUint32(0) === length) return length;
  }
  throw new Error('trailer not found');
}

describe('RxDBBackupArchiveWriter 拒绝违反契约的调用', () => {
  const started = async () => {
    const sink = collectingSink();
    const writer = new RxDBBackupArchiveWriter(sink.stream.getWriter());
    await writer.writeManifest(sampleManifest());
    return writer;
  };

  it('没有文件条目就写数据', async () => {
    await expectBackupError((await started()).writeData(Uint8Array.of(1)), 'invalid_state');
  });

  it('数据超过条目声明的大小', async () => {
    const writer = await started();
    await writer.beginEntry({ path: 'f', kind: 'file', size: 1 });
    await expectBackupError(writer.writeData(Uint8Array.of(1, 2)), 'invalid_state');
  });

  it('上一个文件没写满就开始下一个条目或结束', async () => {
    const writer = await started();
    await writer.beginEntry({ path: 'f', kind: 'file', size: 2 });
    await writer.writeData(Uint8Array.of(1));
    await expectBackupError(writer.beginEntry({ path: 'g', kind: 'file', size: 0 }), 'invalid_state');
    await expectBackupError(writer.finish(), 'invalid_state');
  });

  it.each(['', '/abs', '../up', 'a/../b', 'a//b', './a', 'a/.', 'a\\b', 'nul\u0000'])('不安全路径 %j', async path => {
    await expectBackupError((await started()).beginEntry({ path, kind: 'file', size: 0 }), 'invalid_state');
  });

  it('重复路径', async () => {
    const writer = await started();
    await writer.beginEntry({ path: 'a', kind: 'directory', size: 0 });
    await expectBackupError(writer.beginEntry({ path: 'a', kind: 'file', size: 0 }), 'invalid_state');
  });

  it('目录条目声明了非零大小', async () => {
    await expectBackupError((await started()).beginEntry({ path: 'd', kind: 'directory', size: 1 }), 'invalid_state');
  });

  it('未写 manifest 就开始条目', async () => {
    const writer = new RxDBBackupArchiveWriter(collectingSink().stream.getWriter());
    await expectBackupError(writer.beginEntry({ path: 'a', kind: 'directory', size: 0 }), 'invalid_state');
  });

  it('输出流写失败归类为 io_error 并保留原因', async () => {
    const cause = new Error('disk gone');
    const stream = new WritableStream<Uint8Array>({
      write() {
        throw cause;
      }
    });
    const error = await expectBackupError(
      new RxDBBackupArchiveWriter(stream.getWriter()).writeManifest(sampleManifest()),
      'io_error'
    );
    expect(error.cause).toBe(cause);
  });

  it('输出流报 QuotaExceededError 归类为 storage_full', async () => {
    const stream = new WritableStream<Uint8Array>({
      write() {
        throw new DOMException('full', 'QuotaExceededError');
      }
    });
    await expectBackupError(
      new RxDBBackupArchiveWriter(stream.getWriter()).writeManifest(sampleManifest()),
      'storage_full'
    );
  });

  it('信号已取消时不再写出任何字节', async () => {
    const sink = collectingSink();
    const controller = new AbortController();
    const writer = new RxDBBackupArchiveWriter(sink.stream.getWriter(), controller.signal);
    await writer.writeManifest(sampleManifest());
    const written = sink.chunks.length;
    controller.abort(new Error('stop'));
    await expectBackupError(writer.beginEntry({ path: 'a', kind: 'directory', size: 0 }), 'aborted');
    expect(sink.chunks.length).toBe(written);
  });

  it('输出流卡住时取消也能返回', async () => {
    const stream = new WritableStream<Uint8Array>({ write: () => new Promise(() => undefined) });
    const controller = new AbortController();
    const pending = new RxDBBackupArchiveWriter(stream.getWriter(), controller.signal).writeManifest(sampleManifest());
    controller.abort();
    await expectBackupError(pending, 'aborted');
  });
});

describe('RxDBBackupArchiveReader 损坏分类（AC#6）', () => {
  const manifestFrame = jsonFrame(FRAME_MANIFEST, sampleManifest());
  const fileBody = (path: string, bytes: Uint8Array) => [
    jsonFrame(FRAME_ENTRY, { path, kind: 'file', size: bytes.length }),
    frame(FRAME_DATA, bytes)
  ];

  const expectRead = (bytes: Uint8Array, code: RxDBBackupErrorCode, field?: string) =>
    expectBackupError(readAll(sourceOf(bytes, 97)), code, field);

  it('手工拼出的合法归档能被读回（夹具自检）', async () => {
    const back = await readAll(sourceOf(buildArchive([manifestFrame, ...fileBody('a', Uint8Array.of(1, 2, 3))])));
    expect(back.files.get('a')).toEqual(Uint8Array.of(1, 2, 3));
  });

  it('魔数不对', async () => {
    const bytes = await sampleArchive();
    bytes[3] ^= 0xff;
    await expectRead(bytes, 'corrupt_archive', 'magic');
  });

  it('在任意位置截断都报 truncated_archive', async () => {
    const bytes = await sampleArchive();
    const cuts = [
      0,
      3,
      MAGIC.length,
      MAGIC.length + 2,
      MAGIC.length + 5 + 10,
      100_000,
      bytes.length - 40,
      bytes.length - 1
    ];
    for (const cut of cuts) await expectRead(bytes.slice(0, cut), 'truncated_archive');
  });

  it('篡改数据字节导致摘要不符', async () => {
    const bytes = await sampleArchive();
    // 最后一个数据帧（global/big 的尾片，3392 字节）内部，避开任何帧头
    bytes[bytes.length - 5 - trailerPayloadLength(bytes) - 10] ^= 0x01;
    await expectRead(bytes, 'corrupt_archive', 'sha256');
  });

  it('结束标记声明的条目数或字节数与内容不符', async () => {
    const body = [manifestFrame, ...fileBody('a', Uint8Array.of(1, 2, 3))];
    await expectRead(
      buildArchive(body, t => ({ ...t, entries: 2 })),
      'corrupt_archive',
      'entries'
    );
    await expectRead(
      buildArchive(body, t => ({ ...t, bytes: 4 })),
      'corrupt_archive',
      'bytes'
    );
    await expectRead(
      buildArchive(body, t => ({ ...t, sha256: '0'.repeat(64) })),
      'corrupt_archive',
      'sha256'
    );
    await expectRead(
      buildArchive(body, () => ({ entries: 1 })),
      'corrupt_archive',
      'trailer'
    );
  });

  it('结束标记之后还有字节', async () => {
    await expectRead(concatBytes([await sampleArchive(), Uint8Array.of(0)]), 'corrupt_archive', 'trailer');
  });

  it('帧长度越界时立即拒绝，不等待也不分配', async () => {
    const huge = new Uint8Array(5);
    huge[0] = FRAME_DATA;
    new DataView(huge.buffer).setUint32(1, 0xffff_ffff);
    const bytes = concatBytes([
      MAGIC,
      manifestFrame,
      jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'file', size: 10 }),
      huge
    ]);
    await expectRead(bytes, 'corrupt_archive', 'frame');
    await expectRead(
      buildArchive([manifestFrame, ...fileBody('a', new Uint8Array(RXDB_BACKUP_CHUNK_SIZE + 1))]),
      'corrupt_archive',
      'frame'
    );
  });

  it('manifest 不是 JSON 或不是第一帧', async () => {
    await expectRead(buildArchive([frame(FRAME_MANIFEST, Uint8Array.of(0x7b))]), 'corrupt_archive', 'manifest');
    await expectRead(buildArchive([...fileBody('a', Uint8Array.of(1))]), 'corrupt_archive', 'frame');
  });

  it('manifest 出现两次', async () => {
    await expectRead(buildArchive([manifestFrame, manifestFrame]), 'corrupt_archive', 'frame');
  });

  it('未知帧类型', async () => {
    await expectRead(buildArchive([manifestFrame, frame(0x09, Uint8Array.of(1))]), 'corrupt_archive', 'frame');
  });

  it.each(['/abs', '../up', 'a//b', 'a\\b', '.', ''])('归档里的不安全路径 %j', async path => {
    await expectRead(buildArchive([manifestFrame, ...fileBody(path, Uint8Array.of(1))]), 'corrupt_archive', 'path');
  });

  it('条目头不是合法结构', async () => {
    await expectRead(
      buildArchive([manifestFrame, jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'link', size: 0 })]),
      'corrupt_archive',
      'entry'
    );
    await expectRead(
      buildArchive([manifestFrame, jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'file', size: -1 })]),
      'corrupt_archive',
      'entry'
    );
    await expectRead(
      buildArchive([manifestFrame, jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'directory', size: 1 })]),
      'corrupt_archive',
      'entry'
    );
  });

  it('重复路径', async () => {
    const body = [manifestFrame, ...fileBody('a', Uint8Array.of(1)), ...fileBody('a', Uint8Array.of(2))];
    await expectRead(buildArchive(body), 'corrupt_archive', 'path');
  });

  it('数据比声明的多或少', async () => {
    const more = [
      manifestFrame,
      jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'file', size: 1 }),
      frame(FRAME_DATA, Uint8Array.of(1, 2))
    ];
    await expectRead(buildArchive(more), 'corrupt_archive', 'size');
    const fewer = [
      manifestFrame,
      jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'file', size: 3 }),
      frame(FRAME_DATA, Uint8Array.of(1))
    ];
    await expectRead(buildArchive(fewer), 'corrupt_archive', 'size');
    const next = [...fewer, ...fileBody('b', Uint8Array.of(1))];
    await expectRead(buildArchive(next), 'corrupt_archive', 'size');
  });

  it('目录后面跟数据帧', async () => {
    const body = [
      manifestFrame,
      jsonFrame(FRAME_ENTRY, { path: 'd', kind: 'directory', size: 0 }),
      frame(FRAME_DATA, Uint8Array.of(1))
    ];
    await expectRead(buildArchive(body), 'corrupt_archive', 'frame');
  });

  it('空数据帧', async () => {
    const body = [
      manifestFrame,
      jsonFrame(FRAME_ENTRY, { path: 'a', kind: 'file', size: 1 }),
      frame(FRAME_DATA, new Uint8Array(0))
    ];
    await expectRead(buildArchive(body), 'corrupt_archive', 'frame');
  });
});

describe('RxDBBackupArchiveReader 输入流失败与取消', () => {
  it('输入流报错归类为 io_error', async () => {
    const cause = new Error('network reset');
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(MAGIC);
        controller.error(cause);
      }
    });
    const error = await expectBackupError(readAll(source), 'io_error');
    expect(error.cause).toBe(cause);
  });

  it('输入流卡住时取消也能返回', async () => {
    const controller = new AbortController();
    const source = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
    const pending = readAll(source, controller.signal);
    controller.abort();
    await expectBackupError(pending, 'aborted');
  });

  it('readManifest 之前调用 next 属于误用', async () => {
    const reader = new RxDBBackupArchiveReader(sourceOf(await sampleArchive()).getReader());
    await expectBackupError(reader.next(), 'invalid_state');
  });

  it('manifest 结构不合格时报 incompatible_archive', async () => {
    const bytes = buildArchive([jsonFrame(FRAME_MANIFEST, { ...sampleManifest(), formatVersion: 2 })]);
    await expectBackupError(
      new RxDBBackupArchiveReader(sourceOf(bytes).getReader()).readManifest(),
      'incompatible_archive',
      'formatVersion'
    );
  });
});
