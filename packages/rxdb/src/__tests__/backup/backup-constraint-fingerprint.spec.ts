/**
 * 备份清单的约束指纹（RV-01a1ba404c6b）。
 *
 * 结构指纹 {@link computeRxDBSchemaFingerprint} 的键被已有归档钉死，不含实体级 CHECK / 区间排他；
 * 两份配置只差这些约束时，恢复在写目标之前判不出来，`connect()` 才报约束漂移。清单另记一份约束指纹：
 * 取漂移检查用的同一组确定性约束名做哈希，新归档恢复前就比它；没有这一项的旧归档照常恢复。
 */
import { describe, expect, it } from 'vitest';
import { RxDBBackupError } from '../../backup/backup-error.js';
import { assertRxDBBackupCompatible, parseRxDBBackupManifest } from '../../backup/backup-manifest.js';
import type { RxDBBackupCompatibility } from '../../backup/backup.interface.js';
import { computeRxDBConstraintFingerprint, computeRxDBSchemaFingerprint } from '../../backup/schema-fingerprint.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, type EntityMetadataOptions } from '../../entity/metadata-options.interface.js';
import { RxDBBranch } from '../../system/branch.js';
import { sampleManifest } from './fixtures/archive.js';

const POSITIVE_FROM = {
  name: 'unit_from_positive',
  rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '>=', value: 0 }] }
};
const NO_OVERLAP = {
  name: 'no_overlap',
  equal: ['line'],
  ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }]
};

/** 同名、同结构的实体，只有实体级约束可以不同。 */
const slot = (overrides: Partial<EntityMetadataOptions> = {}, name = 'FingerprintSlot'): EntityType => {
  @Entity({
    name,
    namespace: 'review',
    properties: [
      { name: 'line', type: PropertyType.string },
      { name: 'unitFrom', type: PropertyType.integer, nullable: true },
      { name: 'unitTo', type: PropertyType.integer, nullable: true }
    ],
    ...overrides
  } as EntityMetadataOptions)
  class Slot extends EntityBase {}
  return Slot;
};

const target = (overrides: Partial<RxDBBackupCompatibility> = {}): RxDBBackupCompatibility => ({
  adapterName: 'pglite',
  engine: 'postgres',
  engineCompatibility: 'postgres-17',
  extensions: ['vector'],
  systemSchemaVersion: 6,
  changeCodecVersion: 1,
  schemaFingerprint: 'f'.repeat(64),
  constraintFingerprint: 'c'.repeat(64),
  authDomain: null,
  ...overrides
});

const caught = (run: () => unknown): RxDBBackupError => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RxDBBackupError);
    return error as RxDBBackupError;
  }
  throw new Error('预期抛错，但调用正常返回了');
};

describe('computeRxDBConstraintFingerprint', () => {
  it('只差实体级 CHECK 或区间排他时，结构指纹相同、约束指纹不同', () => {
    const plain = slot();
    const checked = slot({ checks: [POSITIVE_FROM] } as Partial<EntityMetadataOptions>);
    const excluded = slot({ exclusions: [NO_OVERLAP] } as Partial<EntityMetadataOptions>);

    // 原发现的缺口：结构指纹看不见这两类约束（它的键不能动，见 FINGERPRINT_KEYS 的注释）
    expect(computeRxDBSchemaFingerprint([checked])).toBe(computeRxDBSchemaFingerprint([plain]));
    expect(computeRxDBSchemaFingerprint([excluded])).toBe(computeRxDBSchemaFingerprint([plain]));
    const fingerprints = [plain, checked, excluded].map(entity => computeRxDBConstraintFingerprint([entity]));
    expect(new Set(fingerprints).size).toBe(3);
    fingerprints.forEach(fingerprint => expect(fingerprint).toMatch(/^[0-9a-f]{64}$/));
  });

  it('继承来的显式约束同样计入（只看本层 checks 会漏掉它）', () => {
    const plainParent = slot({}, 'FingerprintBase');
    const checkedParent = slot({ checks: [POSITIVE_FROM] } as Partial<EntityMetadataOptions>, 'FingerprintBase');
    const childOf = (Parent: EntityType): EntityType => {
      @Entity({ name: 'FingerprintChild', namespace: 'review', properties: [] })
      class Child extends (Parent as unknown as typeof EntityBase) {}
      return Child;
    };

    expect(computeRxDBConstraintFingerprint([childOf(checkedParent)])).not.toBe(
      computeRxDBConstraintFingerprint([childOf(plainParent)])
    );
  });

  it('与声明顺序无关，系统实体不参与', () => {
    const left = slot({ checks: [POSITIVE_FROM] } as Partial<EntityMetadataOptions>, 'FingerprintLeft');
    const right = slot({ exclusions: [NO_OVERLAP] } as Partial<EntityMetadataOptions>, 'FingerprintRight');

    expect(computeRxDBConstraintFingerprint([left, right])).toBe(computeRxDBConstraintFingerprint([right, left]));
    expect(computeRxDBConstraintFingerprint([left, RxDBBranch])).toBe(computeRxDBConstraintFingerprint([left]));
  });
});

describe('清单的 constraintFingerprint', () => {
  it('旧格式（没有这一项）照常解析与比对：只比原有各项', () => {
    const legacy = parseRxDBBackupManifest(structuredClone(sampleManifest()));

    expect('constraintFingerprint' in legacy).toBe(false);
    expect(() => assertRxDBBackupCompatible(legacy, target())).not.toThrow();
  });

  it('新格式原样保留这一项，与目标相同时通过', () => {
    const manifest = parseRxDBBackupManifest({
      ...structuredClone(sampleManifest()),
      constraintFingerprint: 'c'.repeat(64)
    });

    expect(manifest.constraintFingerprint).toBe('c'.repeat(64));
    expect(() => assertRxDBBackupCompatible(manifest, target())).not.toThrow();
  });

  it('与目标不同时在写目标之前判为不兼容，点名这一项', () => {
    const manifest = parseRxDBBackupManifest({
      ...structuredClone(sampleManifest()),
      constraintFingerprint: 'd'.repeat(64)
    });
    const error = caught(() => assertRxDBBackupCompatible(manifest, target()));

    expect(error.code).toBe('incompatible_archive');
    expect(error.details).toMatchObject({
      field: 'constraintFingerprint',
      expected: 'c'.repeat(64),
      actual: 'd'.repeat(64)
    });
  });

  it.each([
    ['null', null],
    ['非十六进制', 'not-a-fingerprint'],
    ['大写', 'C'.repeat(64)]
  ])('这一项出现但格式非法（%s）时报 incompatible_archive', (_label, value) => {
    const error = caught(() =>
      parseRxDBBackupManifest({ ...structuredClone(sampleManifest()), constraintFingerprint: value })
    );

    expect(error.code).toBe('incompatible_archive');
    expect(error.details.field).toBe('constraintFingerprint');
  });
});
