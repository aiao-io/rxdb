/**
 * @fileoverview 用户目录配额到底怎么计费。
 *
 * 文档只写了 10028「写入文件单个超过 10M 或者写入文件夹超过 50M」，没说「文件夹」指直接所在目录、
 * 还是整个用户目录。adapter 把数据库按 64 KiB 分块放在一个目录里，两种算法给出的数据库上限不同：
 * 直接所在目录时换个目录就能绕开，整个用户目录时 50M 是全部数据的总和。这里不经 SQLite，
 * 用裸文件把「单文件上限」与「文件夹上限的计费范围」分开测出来。
 *
 * 覆盖写是否计入旧大小（抖音实测会）这里测不出：单文件上限 10M，要区分两种计费需要大于 25M 的单个文件。
 */
import type { DescribedError } from '../describe-error.js';
import { listFiles, type AlipayProbeFileSystem } from '../alipay-fs.js';
import { probe, type Probe, type Skipped } from '../probe.js';

const MIB = 1024 * 1024;

/** 探测计划。 */
export interface QuotaAccountingPlan {
  /** 单文件写入从这个大小起步、每次递增这么多。 */
  readonly stepBytes: number;
  /** 单文件写入探到这个大小为止。 */
  readonly maxSingleBytes: number;
  /** 填满文件夹时每个文件的大小上限；实测单文件上限更小时按实测缩小（模拟器约 7 MiB）。 */
  readonly fillFileBytes: number;
  /** 按 `fillFileBytes` 填满文件夹最多写几个文件；文件缩小时个数按同样的总量重算。 */
  readonly maxFillFiles: number;
}

/** 按文档「单个 10M、文件夹 50M」设计的计划：9 MiB × 8 = 72 MiB 足够撞到 50M。 */
export const DEFAULT_QUOTA_ACCOUNTING_PLAN: QuotaAccountingPlan = {
  stepBytes: MIB,
  maxSingleBytes: 12 * MIB,
  fillFileBytes: 9 * MIB,
  maxFillFiles: 8
};

/** 用户目录里已有文件的占用。 */
export interface UserDirUsage {
  readonly files: number;
  readonly bytes: number;
}

/**
 * 文件夹上限的计费范围。
 *
 * - `direct-folder`：填满一个目录后，兄弟目录照样写得进，上限只算直接所在目录。
 * - `ancestor-or-user-dir`：兄弟目录也写不进，上限算在共同的上级（实验目录或整个用户目录）。
 */
export type FolderLimitScope = 'direct-folder' | 'ancestor-or-user-dir';

/** 往一个目录连续写文件直到失败。 */
export interface FillReport {
  /** 每个填充文件的大小：计划值与实测单文件上限取小；单文件一次都没写成功时为 0，不做文件夹实验。 */
  readonly fileBytes: number;
  readonly filesWritten: number;
  readonly bytesWritten: number;
  /** 第一次失败的写入（从 1 数）；写满计划都没失败时不存在。 */
  readonly failure?: { readonly atFile: number; readonly error: DescribedError };
  /** 填满之后往兄弟目录写一个同样大小的文件；没撞到上限时不写。 */
  readonly siblingWrite: Probe<null> | Skipped;
  /** 没撞到上限时为 `null`。 */
  readonly scope: FolderLimitScope | null;
}

/** 配额计费实验的结果。 */
export interface QuotaAccountingReport {
  readonly plan: QuotaAccountingPlan;
  /** 实验前整个用户目录（不只实验目录）的占用：别处占掉的配额也可能算在里面。 */
  readonly userDirBefore: Probe<UserDirUsage>;
  /** 写入后立即删除的单个文件，成功写入过的最大字节数；一次都没成功为 0。 */
  readonly largestSingleWriteBytes: number;
  /** 第一次失败的单文件写入；探到 `maxSingleBytes` 都成功时不存在。 */
  readonly firstSingleFailure?: { readonly bytes: number; readonly error: DescribedError };
  readonly fill: FillReport;
  /** 删掉填充与兄弟目录：后面的核心实验要用这些配额。 */
  readonly cleanup: Probe<null>;
}

function readUsage(fileSystem: AlipayProbeFileSystem, userDataPath: string): UserDirUsage {
  const files = listFiles(fileSystem, userDataPath);
  return { files: files.length, bytes: files.reduce((total, file) => total + file.size, 0) };
}

function writeThenUnlink(fileSystem: AlipayProbeFileSystem, path: string, bytes: number): null {
  fileSystem.writeFileSync(path, new ArrayBuffer(bytes));
  fileSystem.unlinkSync(path);
  return null;
}

async function probeSingleWrites(
  fileSystem: AlipayProbeFileSystem,
  path: string,
  plan: QuotaAccountingPlan
): Promise<Pick<QuotaAccountingReport, 'largestSingleWriteBytes' | 'firstSingleFailure'>> {
  let largestSingleWriteBytes = 0;
  for (let bytes = plan.stepBytes; bytes <= plan.maxSingleBytes; bytes += plan.stepBytes) {
    const written = await probe(() => writeThenUnlink(fileSystem, path, bytes));
    if (!written.ok) return { largestSingleWriteBytes, firstSingleFailure: { bytes, error: written.error } };
    largestSingleWriteBytes = bytes;
  }
  return { largestSingleWriteBytes };
}

function writeFile(fileSystem: AlipayProbeFileSystem, path: string, bytes: number): null {
  fileSystem.writeFileSync(path, new ArrayBuffer(bytes));
  return null;
}

async function fillDirectory(
  fileSystem: AlipayProbeFileSystem,
  directory: string,
  fileBytes: number,
  maxFiles: number
): Promise<Pick<FillReport, 'filesWritten' | 'bytesWritten' | 'failure'>> {
  fileSystem.mkdirSync(`${directory}/fill`, true);
  for (let index = 1; index <= maxFiles; index++) {
    const written = await probe(() => writeFile(fileSystem, `${directory}/fill/${index}.bin`, fileBytes));
    const filesWritten = index - 1;
    const bytesWritten = filesWritten * fileBytes;
    if (!written.ok) return { filesWritten, bytesWritten, failure: { atFile: index, error: written.error } };
  }
  return { filesWritten: maxFiles, bytesWritten: maxFiles * fileBytes };
}

async function probeFill(
  fileSystem: AlipayProbeFileSystem,
  directory: string,
  plan: QuotaAccountingPlan,
  largestSingleWriteBytes: number
): Promise<FillReport> {
  // 填充文件超过单文件上限时，第一个文件就撞的是单文件上限（两者同为 10028），测不到文件夹上限
  const fileBytes = Math.min(plan.fillFileBytes, largestSingleWriteBytes);
  if (fileBytes === 0) {
    return { fileBytes, filesWritten: 0, bytesWritten: 0, siblingWrite: { skipped: '单文件一次都没写成功' }, scope: null };
  }
  const maxFiles = Math.ceil((plan.fillFileBytes * plan.maxFillFiles) / fileBytes);
  const fill = { fileBytes, ...(await fillDirectory(fileSystem, directory, fileBytes, maxFiles)) };
  if (!fill.failure) {
    return { ...fill, siblingWrite: { skipped: `写满 ${maxFiles} 个文件都没撞到上限` }, scope: null };
  }
  const siblingWrite = await probe(() => {
    fileSystem.mkdirSync(`${directory}/sibling`, true);
    return writeFile(fileSystem, `${directory}/sibling/1.bin`, fileBytes);
  });
  return { ...fill, siblingWrite, scope: siblingWrite.ok ? 'direct-folder' : 'ancestor-or-user-dir' };
}

function removeIfExists(fileSystem: AlipayProbeFileSystem, path: string): void {
  const slash = path.lastIndexOf('/');
  if (fileSystem.readdirSync(path.slice(0, slash)).includes(path.slice(slash + 1))) fileSystem.rmdirSync(path, true);
}

/** 在 `directory`（调用方已建好的空目录）里探测配额计费；`userDataPath` 用来统计整个用户目录的起始占用。 */
export async function runQuotaAccountingExperiment(
  fileSystem: AlipayProbeFileSystem,
  directory: string,
  userDataPath: string,
  plan: QuotaAccountingPlan
): Promise<QuotaAccountingReport> {
  const userDirBefore = await probe(() => readUsage(fileSystem, userDataPath));
  const single = await probeSingleWrites(fileSystem, `${directory}/single.bin`, plan);
  const fill = await probeFill(fileSystem, directory, plan, single.largestSingleWriteBytes);
  const cleanup = await probe((): null => {
    removeIfExists(fileSystem, `${directory}/fill`);
    removeIfExists(fileSystem, `${directory}/sibling`);
    return null;
  });
  return { plan, userDirBefore, ...single, fill, cleanup };
}
