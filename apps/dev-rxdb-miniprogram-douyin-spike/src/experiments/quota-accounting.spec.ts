import { createFakeDouyin, FAKE_USER_DATA_PATH, type FakeDouyinOptions } from '../__tests__/fake-douyin.js';
import { DEFAULT_QUOTA_ACCOUNTING_PLAN, runQuotaAccountingExperiment } from './quota-accounting.js';

const MIB = 1024 * 1024;
const DIRECTORY = `${FAKE_USER_DATA_PATH}/accounting`;

async function run(options: FakeDouyinOptions) {
  const fake = createFakeDouyin(options);
  fake.tt.getFileSystemManager().mkdirSync(DIRECTORY, true);
  const report = await runQuotaAccountingExperiment(
    fake.tt.getFileSystemManager(),
    DIRECTORY,
    FAKE_USER_DATA_PATH,
    DEFAULT_QUOTA_ACCOUNTING_PLAN
  );
  return { report, fake };
}

describe('runQuotaAccountingExperiment', () => {
  it('默认计划：逐 MiB 探到 10 MiB，覆盖写 6 MiB', () => {
    expect(DEFAULT_QUOTA_ACCOUNTING_PLAN).toEqual({ stepBytes: MIB, maxBytes: 10 * MIB, overwriteBytes: 6 * MIB });
  });

  it('覆盖写只按新大小计费时：10 MiB 一次写得进，6 MiB 覆盖 6 MiB 成功，判定 false', async () => {
    const { report, fake } = await run({});
    expect(report.userDirBefore).toMatchObject({ ok: true, value: { files: 0, bytes: 0 } });
    expect(report.largestFreshWriteBytes).toBe(10 * MIB);
    expect(report.firstFreshFailure).toBeUndefined();
    expect(report.overwrite).toMatchObject({
      bytes: 6 * MIB,
      fresh: { ok: true },
      overwrite: { ok: true },
      sizeAfterOverwrite: { ok: true, value: 6 * MIB },
      cleanup: { ok: true },
      countsOldSize: false
    });
    expect([...fake.files.keys()].filter(path => path.startsWith(DIRECTORY))).toEqual([]);
  });

  it('覆盖写把旧大小也计入时：一次写 10 MiB 照样成功，6 MiB 覆盖 6 MiB 失败且旧文件原样保留，判定 true', async () => {
    const { report, fake } = await run({ overwriteCountsOldSize: true });
    expect(report.largestFreshWriteBytes).toBe(10 * MIB);
    expect(report.overwrite).toMatchObject({
      fresh: { ok: true },
      overwrite: { ok: false, error: { errMsg: expect.stringContaining('size limit exceeded') } },
      sizeAfterOverwrite: { ok: true, value: 6 * MIB },
      cleanup: { ok: true },
      countsOldSize: true
    });
    expect([...fake.files.keys()].filter(path => path.startsWith(DIRECTORY))).toEqual([]);
  });

  it('配额本身就小于覆盖写的大小时：记下第一次失败的写入量，覆盖写判定 null 且不清理', async () => {
    const { report } = await run({ quotaBytes: 3 * MIB });
    expect(report.largestFreshWriteBytes).toBe(3 * MIB);
    expect(report.firstFreshFailure).toMatchObject({
      bytes: 4 * MIB,
      error: { errMsg: expect.stringContaining('size limit exceeded') }
    });
    expect(report.overwrite).toMatchObject({ fresh: { ok: false }, countsOldSize: null });
    expect(report.overwrite.overwrite).toHaveProperty('skipped');
    expect(report.overwrite.cleanup).toHaveProperty('skipped');
  });

  it('用户目录里已有的文件计入起始占用：配额被别处占掉时一眼能看出来', async () => {
    const fake = createFakeDouyin({});
    const fileSystem = fake.tt.getFileSystemManager();
    fileSystem.mkdirSync(DIRECTORY, true);
    fileSystem.writeFileSync(`${FAKE_USER_DATA_PATH}/elsewhere.bin`, new ArrayBuffer(2 * MIB));
    const report = await runQuotaAccountingExperiment(
      fileSystem,
      DIRECTORY,
      FAKE_USER_DATA_PATH,
      DEFAULT_QUOTA_ACCOUNTING_PLAN
    );
    expect(report.userDirBefore).toMatchObject({ ok: true, value: { files: 1, bytes: 2 * MIB } });
    expect(report.largestFreshWriteBytes).toBe(8 * MIB);
  });
});
