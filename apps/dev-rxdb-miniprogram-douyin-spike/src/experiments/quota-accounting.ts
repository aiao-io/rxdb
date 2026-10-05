/**
 * @fileoverview 实验 ④ 的旁证：用户目录配额到底怎么计费。
 *
 * adapter 的文件 VFS 每次 flush 都用 `writeFileSync` 整体覆盖数据库文件。模拟器 v5 报告里，
 * 10 MiB 配额下数据库写到约 5 MiB 就撞配额，之后关闭失败、重开 disk I/O。一种解释是覆盖写时
 * 旧文件大小仍计入配额（**推断**）：那样数据库的实际上限只有配额的一半。这里不经 SQLite，
 * 直接用裸文件把「一次能写多大」与「覆盖写是否计入旧大小」分开测出来。
 */
import type { DescribedError } from '../describe-error.js';
import type { DouyinFileSystemManager } from '../douyin-api.js';
import { probe, type Probe, type Skipped } from '../probe.js';

const MIB = 1024 * 1024;

/** 探测计划。 */
export interface QuotaAccountingPlan {
  /** 首次写入从这个大小起步、每次递增这么多。 */
  readonly stepBytes: number;
  /** 首次写入探到这个大小为止。 */
  readonly maxBytes: number;
  /** 覆盖写实验的文件大小：要大于配额的一半、小于配额，两种计费方式才会给出不同结果。 */
  readonly overwriteBytes: number;
}

/** 按文档 10 MiB 配额设计的计划。 */
export const DEFAULT_QUOTA_ACCOUNTING_PLAN: QuotaAccountingPlan = {
  stepBytes: MIB,
  maxBytes: 10 * MIB,
  overwriteBytes: 6 * MIB
};

/** 用户目录里已有文件的占用。 */
export interface UserDirUsage {
  readonly files: number;
  readonly bytes: number;
}

/** 同一路径写两次同样大小的文件。 */
export interface OverwriteProbe {
  readonly bytes: number;
  readonly fresh: Probe<null>;
  readonly overwrite: Probe<null> | Skipped;
  /** 覆盖写之后文件的大小：失败时看旧文件是否原样保留。 */
  readonly sizeAfterOverwrite: Probe<number> | Skipped;
  readonly cleanup: Probe<null> | Skipped;
  /** 首次写入成功而覆盖写失败为 `true`，两次都成功为 `false`，首次写入就失败为 `null`。 */
  readonly countsOldSize: boolean | null;
}

/** 配额计费实验的结果。 */
export interface QuotaAccountingReport {
  readonly plan: QuotaAccountingPlan;
  /** 实验前整个用户目录（不只实验目录）的占用：别处占掉的配额也算在里面。 */
  readonly userDirBefore: Probe<UserDirUsage>;
  /** 写入后立即删除的单个文件，成功写入过的最大字节数；一次都没成功为 0。 */
  readonly largestFreshWriteBytes: number;
  /** 第一次失败的写入；探到 `maxBytes` 都成功时不存在。 */
  readonly firstFreshFailure?: { readonly bytes: number; readonly error: DescribedError };
  readonly overwrite: OverwriteProbe;
}

function readUsage(fileSystem: DouyinFileSystemManager, userDataPath: string): UserDirUsage {
  const listing = fileSystem.statSync(userDataPath, true);
  if (!Array.isArray(listing)) throw new Error(`statSync(${userDataPath}, true) 没有返回列表`);
  const files = listing.filter(entry => entry.stat.isFile());
  return { files: files.length, bytes: files.reduce((total, entry) => total + entry.stat.size, 0) };
}

function writeThenUnlink(fileSystem: DouyinFileSystemManager, path: string, bytes: number): null {
  fileSystem.writeFileSync(path, new ArrayBuffer(bytes));
  fileSystem.unlinkSync(path);
  return null;
}

async function probeFreshWrites(
  fileSystem: DouyinFileSystemManager,
  path: string,
  plan: QuotaAccountingPlan
): Promise<Pick<QuotaAccountingReport, 'largestFreshWriteBytes' | 'firstFreshFailure'>> {
  let largestFreshWriteBytes = 0;
  for (let bytes = plan.stepBytes; bytes <= plan.maxBytes; bytes += plan.stepBytes) {
    const written = await probe(() => writeThenUnlink(fileSystem, path, bytes));
    if (!written.ok) return { largestFreshWriteBytes, firstFreshFailure: { bytes, error: written.error } };
    largestFreshWriteBytes = bytes;
  }
  return { largestFreshWriteBytes };
}

function readSize(fileSystem: DouyinFileSystemManager, path: string): number {
  const stat = fileSystem.statSync(path);
  if ('size' in stat) return stat.size;
  throw new Error(`statSync(${path}) 返回了列表`);
}

async function probeOverwrite(
  fileSystem: DouyinFileSystemManager,
  path: string,
  bytes: number
): Promise<OverwriteProbe> {
  const write = (): null => {
    fileSystem.writeFileSync(path, new ArrayBuffer(bytes));
    return null;
  };
  const fresh = await probe(write);
  if (!fresh.ok) {
    const skipped = { skipped: `首次写入 ${bytes} bytes 已失败` };
    return { bytes, fresh, overwrite: skipped, sizeAfterOverwrite: skipped, cleanup: skipped, countsOldSize: null };
  }
  const overwrite = await probe(write);
  const sizeAfterOverwrite = await probe(() => readSize(fileSystem, path));
  const cleanup = await probe((): null => {
    fileSystem.unlinkSync(path);
    return null;
  });
  return { bytes, fresh, overwrite, sizeAfterOverwrite, cleanup, countsOldSize: !overwrite.ok };
}

/** 在 `directory`（调用方已建好的空目录）里探测配额计费；`userDataPath` 用来统计整个用户目录的起始占用。 */
export async function runQuotaAccountingExperiment(
  fileSystem: DouyinFileSystemManager,
  directory: string,
  userDataPath: string,
  plan: QuotaAccountingPlan
): Promise<QuotaAccountingReport> {
  const userDirBefore = await probe(() => readUsage(fileSystem, userDataPath));
  const fresh = await probeFreshWrites(fileSystem, `${directory}/fresh.bin`, plan);
  const overwrite = await probeOverwrite(fileSystem, `${directory}/overwrite.bin`, plan.overwriteBytes);
  return { plan, userDirBefore, ...fresh, overwrite };
}
