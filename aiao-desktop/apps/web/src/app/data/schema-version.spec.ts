import { describe, expect, it, vi } from 'vitest';

import {
  DESKTOP_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  SCHEMA_STEPS,
  SchemaProbe,
  SchemaRecord,
  SchemaStep,
  isSchemaRecord,
  planSchema,
  runUpgrade,
  stepsBetween
} from './schema-version';

const record = (version: number): SchemaRecord => ({ version, build: '', upgradedAt: 1 });
const probe = (overrides: Partial<SchemaProbe> = {}): SchemaProbe => ({
  hasPreferenceTable: true,
  recordValue: record(DESKTOP_SCHEMA_VERSION),
  missing: [],
  ...overrides
});

/** 假想的两版升级清单：1 是首版，2 只增不改，3 要迁移字段。 */
const steps: readonly SchemaStep[] = [
  { version: 20, summary: '首版' },
  { version: 21, summary: '新增一个数据域' },
  { version: 22, summary: '字段改名', migrate: async executor => void (await executor.execute('ALTER TABLE x')) }
];

describe('升级清单', () => {
  it('版本号是十位整数、升序、最后一行就是当前构建的版本', () => {
    for (const step of SCHEMA_STEPS) expect(String(step.version)).toMatch(/^\d{10}$/);
    expect(SCHEMA_STEPS.map(step => step.version)).toEqual(
      SCHEMA_STEPS.map(step => step.version).sort((a, b) => a - b)
    );
    expect(SCHEMA_STEPS.at(-1)?.version).toBe(DESKTOP_SCHEMA_VERSION);
  });

  it('每一行都写了做什么，没有重复的版本', () => {
    const versions = SCHEMA_STEPS.map(step => step.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const step of SCHEMA_STEPS) expect(step.summary.trim()).not.toBe('');
  });
});

describe('版本记录', () => {
  it('只认版本为正整数、构建为字符串、时刻为数字的对象', () => {
    expect(isSchemaRecord(record(5))).toBe(true);
    for (const bad of [
      null,
      undefined,
      'x',
      5,
      {},
      { version: 0, build: '', upgradedAt: 1 },
      { version: 1.5, build: '', upgradedAt: 1 }
    ])
      expect(isSchemaRecord(bad)).toBe(false);
    expect(isSchemaRecord({ version: 3, build: 1, upgradedAt: 1 })).toBe(false);
    expect(isSchemaRecord({ version: 3, build: '', upgradedAt: '1' })).toBe(false);
  });
});

describe('planSchema：对一个库该怎么办', () => {
  it('没有系统偏好表：全新的库', () => {
    expect(planSchema(probe({ hasPreferenceTable: false, recordValue: undefined }))).toEqual({ kind: 'fresh' });
  });

  it('有表没有版本记录（此前发布的构建建的库）：视为最旧的版本去升级，不按损坏处理，缺的表也不算损坏', () => {
    expect(planSchema(probe({ recordValue: undefined }))).toEqual({ kind: 'upgrade', from: LEGACY_SCHEMA_VERSION });
    expect(planSchema(probe({ recordValue: undefined, missing: ['clock_alarm', 'note.title'] }))).toEqual({
      kind: 'upgrade',
      from: LEGACY_SCHEMA_VERSION
    });
  });

  it('版本记录等于当前构建且结构完整：什么都不用做', () => {
    expect(planSchema(probe())).toEqual({ kind: 'current' });
  });

  it('版本记录等于当前构建但缺表或缺列：损坏，列出缺的东西，不静默修补', () => {
    expect(planSchema(probe({ missing: ['note', 'reminder.title'] }))).toEqual({
      kind: 'corrupt',
      reason: '库的版本与当前构建一致，但结构缺少应有的表或列',
      missing: ['note', 'reminder.title']
    });
  });

  it('版本记录存在却无法解析：损坏', () => {
    for (const recordValue of ['not json', 42, {}, { version: 'x' }, null])
      expect(planSchema(probe({ recordValue })).kind).toBe('corrupt');
  });

  it('版本记录高于当前构建：降级保护，报出库里的版本', () => {
    expect(planSchema(probe({ recordValue: record(DESKTOP_SCHEMA_VERSION + 1) }))).toEqual({
      kind: 'too-new',
      found: DESKTOP_SCHEMA_VERSION + 1
    });
  });

  it('更新的库即使缺表也先按降级保护拒绝：旧构建不去判断新结构', () => {
    expect(planSchema(probe({ recordValue: record(DESKTOP_SCHEMA_VERSION + 1), missing: ['x'] })).kind).toBe('too-new');
  });

  it('版本记录低于当前构建且在升级清单里：升级', () => {
    expect(planSchema(probe({ recordValue: record(20) }), 22, steps)).toEqual({ kind: 'upgrade', from: 20 });
    expect(planSchema(probe({ recordValue: record(21), missing: ['new_table'] }), 22, steps)).toEqual({
      kind: 'upgrade',
      from: 21
    });
  });

  it('版本记录低于当前构建但不在升级清单里：没有迁移路径，按不兼容处理', () => {
    expect(planSchema(probe({ recordValue: record(5) }), 22, steps)).toEqual({ kind: 'incompatible', from: 5 });
  });
});

describe('stepsBetween', () => {
  it('取 from（不含）到 to（含）之间的步骤，按版本升序', () => {
    expect(stepsBetween(0, 22, steps).map(step => step.version)).toEqual([20, 21, 22]);
    expect(stepsBetween(20, 22, steps).map(step => step.version)).toEqual([21, 22]);
    expect(stepsBetween(21, 21, steps)).toEqual([]);
    expect(stepsBetween(22, 22, steps)).toEqual([]);
  });

  it('不超过目标版本', () => {
    expect(stepsBetween(0, 21, steps).map(step => step.version)).toEqual([20, 21]);
  });

  it('清单乱序时仍按版本升序', () => {
    expect(stepsBetween(0, 22, [...steps].reverse()).map(step => step.version)).toEqual([20, 21, 22]);
  });
});

describe('runUpgrade：迁移在前，版本记录最后写', () => {
  const calls: string[] = [];
  const target = () => ({
    execute: vi.fn(async (sql: string) => void calls.push(`sql:${sql}`)),
    writeRecord: vi.fn(
      async (written: SchemaRecord) => void calls.push(`record:${written.version}@${written.upgradedAt}`)
    )
  });

  it('只增不改的升级只写版本记录', async () => {
    calls.length = 0;
    await runUpgrade(20, target(), () => 7, steps.slice(0, 2), 21);
    expect(calls).toEqual(['record:21@7']);
  });

  it('要迁移的升级先按顺序跑迁移，最后才写版本记录，记录是目标版本', async () => {
    calls.length = 0;
    await runUpgrade(0, target(), () => 9, steps, 22);
    expect(calls).toEqual(['sql:ALTER TABLE x', 'record:22@9']);
  });

  it('迁移失败时不写版本记录（事务回滚后库还是升级前）', async () => {
    const failing: readonly SchemaStep[] = [
      ...steps.slice(0, 2),
      {
        version: 22,
        summary: '会失败',
        migrate: async () => {
          throw new Error('boom');
        }
      }
    ];
    const upgraded = target();
    await expect(runUpgrade(0, upgraded, () => 1, failing, 22)).rejects.toThrow('boom');
    expect(upgraded.writeRecord).not.toHaveBeenCalled();
  });

  it('已是目标版本时只写记录，不重跑迁移（连升两级也可重复）', async () => {
    calls.length = 0;
    await runUpgrade(22, target(), () => 3, steps, 22);
    expect(calls).toEqual(['record:22@3']);
  });
});
