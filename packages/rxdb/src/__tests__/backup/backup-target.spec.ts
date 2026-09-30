/**
 * @fileoverview US-217 备份目标的两项身份：加密认证域与实体结构指纹，所有 adapter 共用同一个算法。
 */

import { describe, expect, it } from 'vitest';
import { getRxDBBackupAuthDomain, getRxDBBackupSchemaFingerprint } from '../../backup/backup-target.js';
import { computeRxDBSchemaFingerprint } from '../../backup/schema-fingerprint.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { RxDB } from '../../RxDB.js';

@Entity({
  name: 'TargetPlain',
  namespace: 'bt',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class TargetPlain extends EntityBase {}

@Entity({
  name: 'TargetSecret',
  namespace: 'bt',
  properties: [{ name: 'secret', type: PropertyType.string, encrypted: true }]
})
class TargetSecret extends EntityBase {}

const fakeRxDB = (entities: EntityType[]): RxDB => ({ config: { dbName: 'notes', entities } }) as unknown as RxDB;

describe('getRxDBBackupAuthDomain', () => {
  it('没有加密列时为 null', () => {
    expect(getRxDBBackupAuthDomain(fakeRxDB([TargetPlain]))).toBeNull();
  });

  it('任一实体声明加密列时为库名', () => {
    expect(getRxDBBackupAuthDomain(fakeRxDB([TargetPlain, TargetSecret]))).toBe('notes');
  });
});

describe('getRxDBBackupSchemaFingerprint', () => {
  it('等于实体集合的结构指纹', () => {
    const entities = [TargetPlain, TargetSecret];
    expect(getRxDBBackupSchemaFingerprint(fakeRxDB(entities))).toBe(computeRxDBSchemaFingerprint(entities));
  });
});
