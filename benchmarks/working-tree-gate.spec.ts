import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  collectEnvironment,
  computeRatioProfile,
  computeRunnerProfileHash,
  decideFreeze,
  decideRelativeGate,
  ratioProfileFileName,
  readReferences
} from './working-tree-gate.ts';
import type { BenchMeasurement, BenchReference } from './working-tree-report.ts';
import { REFERENCE_DIR } from './working-tree-report.ts';

/** 三台真实机器的画像：M1 是冻结 reference 的开发机，后两种是 `ubuntu-latest` 随机分到的 CPU。 */
const M1 = 'Darwin darwin arm64 / Apple M1 Max / node 26';
const EPYC = 'Linux linux x64 / AMD EPYC 7763 64-Core Processor / node 26';
const XEON = 'Linux linux x64 / INTEL(R) XEON(R) PLATINUM 8573C / node 26';

/** M1 首次冻结（9e5ddc92）的四个 median，数字逐字取自当时签入的 reference。 */
const M1_MEDIANS = {
  status: 2.182196332248118,
  diff: 2.555241101149252,
  restore: 14.680941324859418,
  commit: 15.933321897335857
};

/** EPYC 7763 在 b1337e76 冻结（bench-freeze workflow）的四个 median，数字逐字取自当时签入的 reference。 */
const EPYC_MEDIANS = {
  status: 2.192780803185898,
  diff: 2.500296291303735,
  restore: 11.706411843864341,
  commit: 13.890424786205845
};

const makeReference = (ratioProfile: string, medianRatios: Record<string, number> = M1_MEDIANS): BenchReference => ({
  commit: '9e5ddc92cdca4c781d991a4332ef9a81aab7cf0b',
  runs: 10,
  medianRatios,
  frozenAbsolute: { commit: 550.53 },
  runnerProfileHash: 'a'.repeat(64),
  ratioProfile
});

const makeMeasurements = (ratios: Record<string, number>): BenchMeasurement[] =>
  Object.entries(ratios).map(([id, ratio]) => ({
    id,
    p50: 1,
    p95: ratio,
    max: 2,
    controlId: 'control',
    controlP95: 1,
    ratio
  }));

describe('computeRunnerProfileHash', () => {
  it('公式逐字节不变：签入 reference 的 runnerProfileHash 靠它与本机比对', () => {
    const hash = computeRunnerProfileHash({
      runtime: 'node 26.7.0',
      os: 'Darwin darwin arm64',
      cpuModel: 'Apple M1 Max',
      logicalCores: 10,
      memoryBytes: 68_719_476_736,
      runnerId: 'bench-host',
      concurrency: 10
    });

    expect(hash).toBe('0e72a1d89d4177e7940520b0a137f3252feb16a34ed7dd8a3cc8483828677b7a');
  });
});

describe('computeRatioProfile', () => {
  it('由「系统/架构 / CPU 型号 / Node 主版本」组成', () => {
    expect(computeRatioProfile({ runtime: 'node 26.7.0', os: 'Darwin darwin arm64', cpuModel: 'Apple M1 Max' })).toBe(
      M1
    );
  });

  it('同一主版本的小版本不同仍是同一画像，换主版本则不是', () => {
    const base = { os: 'Linux linux x64', cpuModel: 'AMD EPYC 7763 64-Core Processor' };

    expect(computeRatioProfile({ ...base, runtime: 'node 26.10.0' })).toBe(EPYC);
    expect(computeRatioProfile({ ...base, runtime: 'node 26.7.0' })).toBe(EPYC);
    expect(computeRatioProfile({ ...base, runtime: 'node 27.0.0' })).not.toBe(EPYC);
  });

  it('把型号里的连续空白与首尾空白折叠掉', () => {
    expect(
      computeRatioProfile({
        runtime: 'node 26.10.0',
        os: 'Linux linux x64',
        cpuModel: ' AMD EPYC 7763  64-Core Processor '
      })
    ).toBe(EPYC);
  });

  it('runtime 不是 `node X.Y.Z` 时抛错，而不是造出一个谁都匹配不上的画像', () => {
    expect(() => computeRatioProfile({ runtime: 'bun 1.2.0', os: 'Linux linux x64', cpuModel: 'x' })).toThrow(
      /runtime/
    );
  });
});

describe('collectEnvironment', () => {
  it('ratioProfile 与 runnerProfileHash 都由本次采集的字段导出', () => {
    const { runnerProfileHash, ratioProfile, ...base } = collectEnvironment();

    expect(runnerProfileHash).toBe(computeRunnerProfileHash(base));
    expect(ratioProfile).toBe(computeRatioProfile(base));
  });

  it('GitHub 托管 runner 每个 job 主机名都不同：画像不变，profile hash 却变了', () => {
    const { runnerProfileHash, ratioProfile, ...base } = collectEnvironment();
    const otherJob = { ...base, runnerId: `${base.runnerId}-next`, memoryBytes: base.memoryBytes * 2 };

    expect(computeRatioProfile(otherJob)).toBe(ratioProfile);
    expect(computeRunnerProfileHash(otherJob)).not.toBe(runnerProfileHash);
  });
});

describe('ratioProfileFileName', () => {
  it.each([
    [M1, 'darwin-darwin-arm64-apple-m1-max-node-26.json'],
    [EPYC, 'linux-linux-x64-amd-epyc-7763-64-core-processor-node-26.json'],
    [XEON, 'linux-linux-x64-intel-r-xeon-r-platinum-8573c-node-26.json']
  ])('%s → %s', (profile, fileName) => {
    expect(ratioProfileFileName(profile)).toBe(fileName);
  });
});

describe('readReferences', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'working-tree-reference-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const put = (name: string, content: unknown): Promise<void> =>
    writeFile(join(directory, name), typeof content === 'string' ? content : JSON.stringify(content), 'utf8');

  it('目录不存在即「一份都没冻结」', async () => {
    await expect(readReferences(join(directory, 'missing'))).resolves.toEqual([]);
  });

  it('读出目录下全部 reference，忽略非 JSON 文件', async () => {
    await put(ratioProfileFileName(M1), makeReference(M1));
    await put(ratioProfileFileName(EPYC), makeReference(EPYC));
    await put('.DS_Store', 'binary');

    const references = await readReferences(directory);

    expect(references.map(reference => reference.ratioProfile).sort()).toEqual([M1, EPYC].sort());
  });

  it('文件名与自报的画像对不上时抛错，不按文件名或内容任选其一', async () => {
    await put(ratioProfileFileName(EPYC), makeReference(M1));

    await expect(readReferences(directory)).rejects.toThrow(ratioProfileFileName(EPYC));
  });

  it('缺 ratioProfile 字段时抛错', async () => {
    // 迁移前的旧格式：除了 ratioProfile 什么都有
    const legacy: Record<string, unknown> = { ...makeReference(M1) };
    delete legacy.ratioProfile;
    await put(ratioProfileFileName(M1), legacy);

    await expect(readReferences(directory)).rejects.toThrow(/ratioProfile/);
  });

  it('坏 JSON 抛错并点名文件：坏掉的 reference 必须让门禁变红', async () => {
    await put(ratioProfileFileName(M1), '{ not json');

    await expect(readReferences(directory)).rejects.toThrow(ratioProfileFileName(M1));
  });

  it('签入仓库的 reference 目录本身合法，且含冻结基线的那台 M1', async () => {
    const references = await readReferences(REFERENCE_DIR);

    expect(references.map(reference => reference.ratioProfile)).toContain(M1);
    for (const reference of references) expect(reference.runs).toBe(10);
  });
});

describe('decideRelativeGate', () => {
  it('一份 reference 都没有时是 unfrozen：首个绿色实现得先跑出数字', () => {
    expect(decideRelativeGate([], M1, makeMeasurements({ status: 9 })).kind).toBe('unfrozen');
  });

  it('回归（CI run 36070569734）：EPYC runner 只有 M1 reference 可比时判 mismatch，不拿 M1 的数字判 FAIL', () => {
    const decision = decideRelativeGate(
      [makeReference(M1)],
      EPYC,
      makeMeasurements({ status: 2.515, diff: 2.796, restore: 11.89, commit: 13.35 })
    );

    expect(decision).toEqual({ kind: 'mismatch', profile: EPYC, known: [M1] });
  });

  it('同画像下全部在各自容差内时通过（M1 本机 HEAD 的实测）', () => {
    const decision = decideRelativeGate(
      [makeReference(M1)],
      M1,
      makeMeasurements({ status: 2.101, diff: 2.118, restore: 12.95, commit: 15.54 })
    );

    expect(decision.kind).toBe('evaluated');
    if (decision.kind !== 'evaluated') return;
    expect(decision.passed).toBe(true);
    expect(decision.reference.ratioProfile).toBe(M1);
  });

  it('读测点（status / diff）容差 130%：× 1.2 通过，× 1.31 失败', () => {
    const reference = makeReference(M1, { status: 2, diff: 2 });
    const decision = decideRelativeGate([reference], M1, makeMeasurements({ status: 2 * 1.2, diff: 2 * 1.31 }));

    expect(decision.kind).toBe('evaluated');
    if (decision.kind !== 'evaluated') return;
    expect(decision.verdicts).toMatchObject([
      { id: 'status', tolerance: 1.3, passed: true },
      { id: 'diff', tolerance: 1.3, passed: false }
    ]);
  });

  it('写测点（restore / commit）容差仍是 110%：× 1.2 失败', () => {
    const reference = makeReference(M1, { restore: 10, commit: 10 });
    const decision = decideRelativeGate([reference], M1, makeMeasurements({ restore: 10 * 1.05, commit: 10 * 1.2 }));

    expect(decision.kind).toBe('evaluated');
    if (decision.kind !== 'evaluated') return;
    expect(decision.verdicts).toMatchObject([
      { id: 'restore', tolerance: 1.1, passed: true },
      { id: 'commit', tolerance: 1.1, passed: false }
    ]);
  });

  it('恰好等于各自上限算通过', () => {
    const reference = makeReference(M1, { status: 2, diff: 2, restore: 10, commit: 10 });
    const decision = decideRelativeGate(
      [reference],
      M1,
      makeMeasurements({ status: 2 * 1.3, diff: 2 * 1.3, restore: 10 * 1.1, commit: 10 * 1.1 })
    );

    expect(decision.kind === 'evaluated' && decision.passed).toBe(true);
  });

  it('回归（CI run 36070569734 的实测对 EPYC 7763 reference）：读项 +15% / +12% 是噪声，不判 FAIL', () => {
    const decision = decideRelativeGate(
      [makeReference(EPYC, EPYC_MEDIANS)],
      EPYC,
      makeMeasurements({ status: 2.515, diff: 2.796, restore: 11.89, commit: 13.35 })
    );

    expect(decision.kind === 'evaluated' && decision.passed).toBe(true);
  });

  it('任一项超过上限即整体失败，其余项照常判定', () => {
    const decision = decideRelativeGate(
      [makeReference(M1)],
      M1,
      makeMeasurements({ status: 2.101, diff: 2.118, restore: 12.95, commit: 18 })
    );

    expect(decision.kind).toBe('evaluated');
    if (decision.kind !== 'evaluated') return;
    expect(decision.passed).toBe(false);
    expect(decision.verdicts.map(verdict => [verdict.id, verdict.passed])).toEqual([
      ['status', true],
      ['diff', true],
      ['restore', true],
      ['commit', false]
    ]);
  });

  it('reference 里没有的测点判失败：新增测点必须先重新冻结', () => {
    const decision = decideRelativeGate([makeReference(M1)], M1, makeMeasurements({ status: 2, merge: 1 }));

    expect(decision.kind).toBe('evaluated');
    if (decision.kind !== 'evaluated') return;
    expect(decision.passed).toBe(false);
    expect(decision.verdicts.find(verdict => verdict.id === 'merge')).toMatchObject({
      referenceRatio: null,
      budget: null,
      passed: false
    });
  });

  it('reference 里有、却没定过容差的测点判失败：新增测点还得先定读写归类', () => {
    const decision = decideRelativeGate(
      [makeReference(M1, { ...M1_MEDIANS, merge: 1 })],
      M1,
      makeMeasurements({ merge: 1 })
    );

    expect(decision.kind).toBe('evaluated');
    if (decision.kind !== 'evaluated') return;
    expect(decision.passed).toBe(false);
    expect(decision.verdicts).toEqual([
      { id: 'merge', ratio: 1, referenceRatio: 1, tolerance: null, budget: null, passed: false }
    ]);
  });

  it('多份 reference 时只拿同画像那一份比', () => {
    const decision = decideRelativeGate(
      [makeReference(M1), makeReference(EPYC, { ...M1_MEDIANS, status: 2.6 })],
      EPYC,
      makeMeasurements({ status: 2.515, diff: 2.118, restore: 12.95, commit: 15.54 })
    );

    expect(decision.kind === 'evaluated' && decision.reference.ratioProfile).toBe(EPYC);
    expect(decision.kind === 'evaluated' && decision.passed).toBe(true);
  });
});

describe('decideFreeze', () => {
  const none = { regenerate: null, newProfile: null };

  it('一份都没有、不带参数：首次冻结', () => {
    expect(decideFreeze([], M1, none)).toEqual({ kind: 'freeze', reason: null });
  });

  it('一份都没有时 --new-profile 同样冻结，理由照记', () => {
    expect(decideFreeze([], EPYC, { ...none, newProfile: '理由' })).toEqual({ kind: 'freeze', reason: '理由' });
  });

  it('本画像已有、不带参数：拒绝（契约 §3.1）', () => {
    const decision = decideFreeze([makeReference(M1)], M1, none);

    expect(decision.kind).toBe('refuse');
    expect(decision.kind === 'refuse' && decision.message).toMatch(/§3\.1/);
  });

  it('本画像已有、--regenerate：按理由重冻', () => {
    expect(decideFreeze([makeReference(M1)], M1, { ...none, regenerate: '测点变了' })).toEqual({
      kind: 'freeze',
      reason: '测点变了'
    });
  });

  it('本画像已有、--new-profile：跳过，不跑也不覆盖（CI 多个槽位分到同一种 CPU）', () => {
    expect(decideFreeze([makeReference(M1)], M1, { ...none, newProfile: '理由' })).toEqual({ kind: 'skip' });
  });

  it('只有别的画像、不带参数：拒绝并点名 --new-profile 与已有画像', () => {
    const decision = decideFreeze([makeReference(M1)], EPYC, none);

    expect(decision.kind).toBe('refuse');
    expect(decision.kind === 'refuse' && decision.message).toContain('--new-profile');
    expect(decision.kind === 'refuse' && decision.message).toContain(M1);
  });

  it('只有别的画像、--new-profile：冻结新画像', () => {
    expect(decideFreeze([makeReference(M1)], EPYC, { ...none, newProfile: '理由' })).toEqual({
      kind: 'freeze',
      reason: '理由'
    });
  });

  it('--regenerate 只能覆盖本画像已有的那份', () => {
    expect(decideFreeze([makeReference(M1)], EPYC, { ...none, regenerate: '理由' }).kind).toBe('refuse');
    expect(decideFreeze([], EPYC, { ...none, regenerate: '理由' }).kind).toBe('refuse');
  });

  it('两个参数同时给时抛错：语义互斥', () => {
    expect(() => decideFreeze([], M1, { regenerate: 'a', newProfile: 'b' })).toThrow(/--regenerate/);
  });
});
