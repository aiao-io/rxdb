/**
 * @fileoverview 实验 ③：同步文件系统的错误原文与 adapter VFS 判定的契合度。
 *
 * adapter 的文件 VFS 靠正则识别「文件不存在」与「目录已存在」；正则对不上抖音的 errMsg，
 * 就会把正常的探测当成 IO 错误。这里逐个 VFS 实际会碰到的场景制造错误，记原文并给出判定。
 */
import { adapterErrorText, describeError } from '../describe-error.js';
import type { DouyinFileSystemManager } from '../douyin-api.js';
import type { Probe } from '../probe.js';
import { VFS_ALREADY_EXISTS_PATTERN, VFS_MISSING_FILE_PATTERN } from '../vfs-classifiers.js';

/** 一条文件系统探测。 */
export interface FsProbe {
  readonly op: string;
  /** 这一步对 adapter 而言「正确」的表现。 */
  readonly expectation: string;
  readonly asExpected: boolean;
  /** 抛错时 adapter `isMissingFileError` 的判定。 */
  readonly vfsSaysMissing?: boolean;
  /** 抛错时 adapter `mkdirRecursive` 的判定。 */
  readonly vfsSaysExists?: boolean;
  readonly outcome: Probe<unknown>;
}

/** 实验 ③ 的结果。 */
export interface FileSystemReport {
  readonly directory: string;
  readonly probes: readonly FsProbe[];
}

/** 超过文档 10M 用户目录上限的写入量。 */
const OVER_QUOTA_BYTES = 11 * 1024 * 1024;

/** 往返样本：覆盖 0x00、0xFF 与高位字节；base64 期望值手算。 */
const ROUND_TRIP_BYTES = [0x00, 0xff, 0x10, 0x80, 0x7f, 0x41];
const ROUND_TRIP_BASE64 = 'AP8QgH9B';

type Expectation = 'missing' | 'exists-or-ok' | 'exists' | 'throws' | 'ok';

const EXPECTATION_TEXT: Record<Expectation, string> = {
  missing: '抛错，且 VFS 判定为「不存在」',
  'exists-or-ok': '不抛错，或抛错且 VFS 判定为「已存在」',
  exists: '抛错，且 VFS 判定为「已存在」',
  throws: '抛错',
  ok: '成功'
};

function judge(expectation: Expectation, error: unknown, threw: boolean): Omit<FsProbe, 'op' | 'outcome'> {
  const text = threw ? adapterErrorText(error) : undefined;
  const vfsSaysMissing = text === undefined ? undefined : VFS_MISSING_FILE_PATTERN.test(text);
  const vfsSaysExists = text === undefined ? undefined : VFS_ALREADY_EXISTS_PATTERN.test(text);
  const verdicts: Record<Expectation, boolean> = {
    missing: threw && vfsSaysMissing === true,
    'exists-or-ok': !threw || vfsSaysExists === true,
    exists: threw && vfsSaysExists === true,
    throws: threw,
    ok: !threw
  };
  return {
    expectation: EXPECTATION_TEXT[expectation],
    asExpected: verdicts[expectation],
    vfsSaysMissing,
    vfsSaysExists
  };
}

function fsProbe(op: string, expectation: Expectation, task: () => unknown): FsProbe {
  const startedAt = Date.now();
  try {
    const value = task();
    return {
      op,
      ...judge(expectation, undefined, false),
      outcome: { ok: true, ms: Date.now() - startedAt, value: value ?? null }
    };
  } catch (error) {
    const outcome = { ok: false, ms: Date.now() - startedAt, error: describeError(error) } as const;
    return { op, ...judge(expectation, error, true), outcome };
  }
}

function roundTrip(fileSystem: DouyinFileSystemManager, path: string): { base64: string; matches: boolean } {
  fileSystem.writeFileSync(path, Uint8Array.from(ROUND_TRIP_BYTES).buffer);
  const base64 = fileSystem.readFileSync(path, 'base64');
  fileSystem.unlinkSync(path);
  if (base64 !== ROUND_TRIP_BASE64) throw new Error(`读回 ${base64}，期望 ${ROUND_TRIP_BASE64}`);
  return { base64, matches: true };
}

function writeOverQuota(fileSystem: DouyinFileSystemManager, path: string): { written: number } {
  fileSystem.writeFileSync(path, new ArrayBuffer(OVER_QUOTA_BYTES));
  // 居然写进去了：立刻删掉，别让它占着配额干扰后面的实验 ④
  fileSystem.unlinkSync(path);
  return { written: OVER_QUOTA_BYTES };
}

/** 在 `directory`（调用方已建好的空目录）里逐条探测。 */
export function runFileSystemExperiment(fileSystem: DouyinFileSystemManager, directory: string): FileSystemReport {
  const missing = `${directory}/missing.bin`;
  const probes: FsProbe[] = [
    fsProbe('accessSync(不存在的文件)', 'missing', () => fileSystem.accessSync(missing)),
    fsProbe('readFileSync(不存在的文件)', 'missing', () => fileSystem.readFileSync(missing, 'base64')),
    fsProbe('unlinkSync(不存在的文件)', 'missing', () => fileSystem.unlinkSync(missing)),
    fsProbe('mkdirSync(已存在的目录, true)', 'exists-or-ok', () => fileSystem.mkdirSync(directory, true)),
    fsProbe('mkdirSync(已存在的目录, false)', 'exists', () => fileSystem.mkdirSync(directory, false)),
    fsProbe('mkdirSync(多级新目录, true)', 'ok', () => fileSystem.mkdirSync(`${directory}/a/b/c`, true)),
    fsProbe('writeFileSync(父目录不存在)', 'throws', () =>
      fileSystem.writeFileSync(`${directory}/no-such-dir/file.bin`, new ArrayBuffer(1))
    ),
    fsProbe('writeFileSync + readFileSync(base64) 往返', 'ok', () =>
      roundTrip(fileSystem, `${directory}/round-trip.bin`)
    ),
    fsProbe('writeFileSync(11 MiB)', 'throws', () => writeOverQuota(fileSystem, `${directory}/over-quota.bin`))
  ];
  return { directory, probes };
}
