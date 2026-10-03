import { createFakeAlipay, FAKE_USER_DATA_PATH, type FakeAlipayOptions } from '../__tests__/fake-alipay.js';
import { wrapAlipayFileSystem } from '../alipay-fs.js';
import {
  DEFAULT_QUOTA_ACCOUNTING_PLAN,
  runQuotaAccountingExperiment,
  type QuotaAccountingPlan
} from './quota-accounting.js';

const MIB = 1024 * 1024;
const DIRECTORY = `${FAKE_USER_DATA_PATH}/accounting`;

async function run(options: FakeAlipayOptions, plan: QuotaAccountingPlan = DEFAULT_QUOTA_ACCOUNTING_PLAN) {
  const fake = createFakeAlipay(options);
  const fileSystem = wrapAlipayFileSystem(fake.my.getFileSystemManager(), fake.my);
  fileSystem.mkdirSync(DIRECTORY, true);
  const report = await runQuotaAccountingExperiment(fileSystem, DIRECTORY, FAKE_USER_DATA_PATH, plan);
  return { report, fake, fileSystem };
}

function leftovers(fake: ReturnType<typeof createFakeAlipay>): string[] {
  return [...fake.files.keys(), ...fake.directories].filter(path => path.startsWith(`${DIRECTORY}/`));
}

describe('runQuotaAccountingExperiment', () => {
  it('默认计划：单文件逐 MiB 探到 12 MiB，填满用 9 MiB 的文件最多 8 个', () => {
    expect(DEFAULT_QUOTA_ACCOUNTING_PLAN).toEqual({
      stepBytes: MIB,
      maxSingleBytes: 12 * MIB,
      fillFileBytes: 9 * MIB,
      maxFillFiles: 8
    });
  });

  it('文档限额（单个 10M、文件夹 50M）且文件夹按整个用户目录算：兄弟目录也写不进，判 ancestor-or-user-dir', async () => {
    const { report, fake } = await run({});
    expect(report.userDirBefore).toMatchObject({ ok: true, value: { files: 0, bytes: 0 } });
    expect(report.largestSingleWriteBytes).toBe(10 * MIB);
    expect(report.firstSingleFailure).toMatchObject({
      bytes: 11 * MIB,
      error: { message: expect.stringContaining('size limit exceeded'), cause: { codes: { error: 10028 } } }
    });
    expect(report.fill).toMatchObject({
      filesWritten: 5,
      bytesWritten: 45 * MIB,
      failure: { atFile: 6, error: { cause: { codes: { error: 10028 } } } },
      siblingWrite: { ok: false },
      scope: 'ancestor-or-user-dir'
    });
    expect(report.cleanup).toMatchObject({ ok: true });
    expect(leftovers(fake)).toEqual([]);
  });

  it('单文件上限比计划的填充文件小（模拟器实测约 7 MiB）：填充文件按实测上限缩小、总量不变，照样撞到文件夹上限', async () => {
    const { report, fake } = await run({ fileLimitBytes: 7 * MIB });
    expect(report.largestSingleWriteBytes).toBe(7 * MIB);
    expect(report.fill).toMatchObject({
      fileBytes: 7 * MIB,
      filesWritten: 7,
      bytesWritten: 49 * MIB,
      failure: { atFile: 8 },
      siblingWrite: { ok: false },
      scope: 'ancestor-or-user-dir'
    });
    expect(leftovers(fake)).toEqual([]);
  });

  it('单文件一次都没写成功：不做文件夹实验，范围判定为 null', async () => {
    const { report } = await run({ fileLimitBytes: MIB / 2 });
    expect(report.largestSingleWriteBytes).toBe(0);
    expect(report.fill).toEqual({
      fileBytes: 0,
      filesWritten: 0,
      bytesWritten: 0,
      siblingWrite: { skipped: '单文件一次都没写成功' },
      scope: null
    });
  });

  it('文件夹只按直接子文件算时：兄弟目录写得进，判 direct-folder', async () => {
    const { report, fake } = await run({ folderLimitScope: 'direct-folder' });
    expect(report.fill).toMatchObject({ filesWritten: 5, siblingWrite: { ok: true }, scope: 'direct-folder' });
    expect(leftovers(fake)).toEqual([]);
  });

  it('写满计划也没失败：不写兄弟目录，范围判定为 null', async () => {
    const { report } = await run({}, { stepBytes: MIB, maxSingleBytes: 2 * MIB, fillFileBytes: MIB, maxFillFiles: 3 });
    expect(report.largestSingleWriteBytes).toBe(2 * MIB);
    expect(report.firstSingleFailure).toBeUndefined();
    expect(report.fill).toMatchObject({ filesWritten: 3, bytesWritten: 3 * MIB, scope: null });
    expect(report.fill.failure).toBeUndefined();
    expect(report.fill.siblingWrite).toHaveProperty('skipped');
  });

  it('用户目录里已有的文件计入起始占用，并挤占填满的余量', async () => {
    const fake = createFakeAlipay({});
    const fileSystem = wrapAlipayFileSystem(fake.my.getFileSystemManager(), fake.my);
    fileSystem.mkdirSync(DIRECTORY, true);
    fileSystem.writeFileSync(`${FAKE_USER_DATA_PATH}/elsewhere.bin`, new ArrayBuffer(8 * MIB));
    const report = await runQuotaAccountingExperiment(
      fileSystem,
      DIRECTORY,
      FAKE_USER_DATA_PATH,
      DEFAULT_QUOTA_ACCOUNTING_PLAN
    );
    expect(report.userDirBefore).toMatchObject({ ok: true, value: { files: 1, bytes: 8 * MIB } });
    expect(report.fill.filesWritten).toBe(4);
    expect(fake.files.has(`${FAKE_USER_DATA_PATH}/elsewhere.bin`)).toBe(true);
  });
});
