/**
 * @vitest-environment node
 *
 * 纯函数只用 Web Streams，不碰 DOM；happy-dom 自带的 `WritableStream` 缺 `getWriter()`，换成 Node 的实现。
 */
import { RxDBBackupError } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import {
  businessTableNames,
  canOpenExisting,
  createCappedSink,
  dbNameFromManifest,
  fromBase64,
  toBase64,
  toFailureArchiveReason,
  toImportFailure,
  UnsupportedArchiveError
} from './failure-archive';

const liveSignal = () => new AbortController().signal;

async function writeAll(stream: WritableStream<Uint8Array>, chunks: Uint8Array[]): Promise<void> {
  const writer = stream.getWriter();
  for (const chunk of chunks) await writer.write(chunk);
  await writer.close();
}

describe('toFailureArchiveReason', () => {
  it('截止已到时一律归为 timeout，不看错误本身', () => {
    const signal = AbortSignal.abort(new DOMException('deadline', 'TimeoutError'));
    const error = new RxDBBackupError('aborted', 'Backup aborted');

    expect(toFailureArchiveReason('backup', error, signal)).toEqual({
      stage: 'backup',
      code: 'timeout',
      message: 'TimeoutError: deadline'
    });
  });

  it('截止之外的中止不算超时', () => {
    const signal = AbortSignal.abort(new Error('cancelled'));
    const error = new RxDBBackupError('aborted', 'Backup aborted');

    expect(toFailureArchiveReason('backup', error, signal).code).toBe('aborted');
  });

  it('RxDBBackupError 取其 code，message 拼上 cause', () => {
    const cause = new RangeError('failure archive exceeds maxBytes 1');
    const error = new RxDBBackupError('io_error', 'Backup sink write failed', { cause });

    expect(toFailureArchiveReason('backup', error, liveSignal())).toEqual({
      stage: 'backup',
      code: 'io_error',
      message: 'Backup sink write failed (RangeError: failure archive exceeds maxBytes 1)'
    });
  });

  it('其他 Error 归为 error，message 带 name', () => {
    expect(toFailureArchiveReason('connect', new TypeError('boom'), liveSignal())).toEqual({
      stage: 'connect',
      code: 'error',
      message: 'TypeError: boom'
    });
  });

  it('非 Error 的抛出值按字符串记录', () => {
    expect(toFailureArchiveReason('inspect', 'nope', liveSignal())).toEqual({
      stage: 'inspect',
      code: 'error',
      message: 'nope'
    });
  });
});

describe('createCappedSink', () => {
  it('上限之内按写入顺序拼出完整字节，且不受调用方复用缓冲区影响', async () => {
    const sink = createCappedSink(8);
    const reused = new Uint8Array([1, 2, 3]);
    const writer = sink.stream.getWriter();
    await writer.write(reused);
    reused.set([9, 9, 9]);
    await writer.write(new Uint8Array([4, 5]));
    await writer.close();

    expect(Array.from(sink.bytes())).toEqual([1, 2, 3, 4, 5]);
  });

  it('恰好等于上限可以写入', async () => {
    const sink = createCappedSink(3);
    await writeAll(sink.stream, [new Uint8Array([1, 2]), new Uint8Array([3])]);

    expect(sink.bytes().byteLength).toBe(3);
  });

  it('超过上限时 write 以 RangeError 拒绝', async () => {
    const sink = createCappedSink(3);

    await expect(writeAll(sink.stream, [new Uint8Array([1, 2]), new Uint8Array([3, 4])])).rejects.toThrow(
      new RangeError('failure archive exceeds maxBytes 3')
    );
  });
});

describe('toBase64 / fromBase64', () => {
  it('往返不丢字节（跨越 32 KiB 分块边界）', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, index) => (index * 31) % 256);

    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('空输入得到空串', () => {
    expect(toBase64(new Uint8Array())).toBe('');
    expect(fromBase64('').byteLength).toBe(0);
  });
});

describe('dbNameFromManifest', () => {
  it('取 authDomain 最后一个 @ 之前的部分', () => {
    expect(dbNameFromManifest({ encryption: { authDomain: 'aiao-e2e@x@0_1' } })).toBe('aiao-e2e@x');
  });

  it('没有加密认证域时抛错，不猜库名', () => {
    expect(() => dbNameFromManifest({ encryption: null })).toThrow('encryption.authDomain');
  });

  it('authDomain 没有 @ 或前缀为空时抛错', () => {
    expect(() => dbNameFromManifest({ encryption: { authDomain: 'aiao' } })).toThrow('aiao');
    expect(() => dbNameFromManifest({ encryption: { authDomain: '@0_1' } })).toThrow('@0_1');
  });

  it('抛出的是 UnsupportedArchiveError，导入页据此报 unsupported_archive', () => {
    expect(() => dbNameFromManifest({ encryption: null })).toThrow(UnsupportedArchiveError);
  });
});

describe('toImportFailure', () => {
  it('RxDBBackupError 取其 code，message 拼上 cause', () => {
    const cause = new TypeError('quota');
    const error = new RxDBBackupError('target_not_empty', 'SQLite storage "x" already contains a database', { cause });

    expect(toImportFailure(error)).toEqual({
      code: 'target_not_empty',
      message: 'SQLite storage "x" already contains a database (TypeError: quota)'
    });
  });

  it('认不出库名的归档归为 unsupported_archive', () => {
    expect(toImportFailure(new UnsupportedArchiveError('no authDomain'))).toEqual({
      code: 'unsupported_archive',
      message: 'no authDomain'
    });
  });

  it('其他抛出值归为 error', () => {
    expect(toImportFailure(new TypeError('boom'))).toEqual({ code: 'error', message: 'TypeError: boom' });
    expect(toImportFailure('nope')).toEqual({ code: 'error', message: 'nope' });
  });
});

describe('canOpenExisting', () => {
  it('目标已有库（非空或正被别处打开）时可以直接打开它', () => {
    expect(canOpenExisting('target_not_empty')).toBe(true);
    expect(canOpenExisting('target_busy')).toBe(true);
  });

  it('其他失败不提供打开', () => {
    for (const code of ['corrupt_archive', 'auth_domain_mismatch', 'unsupported_archive', 'error']) {
      expect(canOpenExisting(code)).toBe(false);
    }
  });
});

describe('businessTableNames', () => {
  it('按实体元数据给出表名，去重排序', () => {
    expect(businessTableNames([Todo, Todo])).toEqual(['public$todos']);
  });
});
