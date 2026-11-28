/**
 * @fileoverview US-217 备份目标的两项身份：加密认证域与实体结构指纹，所有 adapter 共用同一个算法。
 */

import { describe, expect, it } from 'vitest';
import { isRxDBBackupError } from '../../backup/backup-error.js';
import {
  assertRxDBRestoreIdentity,
  getRxDBBackupAuthDomain,
  getRxDBBackupSchemaFingerprint
} from '../../backup/backup-target.js';
import { computeRxDBSchemaFingerprint } from '../../backup/schema-fingerprint.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { RxDB } from '../../RxDB.js';
import {
  getRxDBIdentityKey,
  identityClaimName,
  identityWatermarkName,
  type RxDBIdentity
} from '../../system/identity-binding.js';

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

describe('assertRxDBRestoreIdentity（US-040）', () => {
  const alice: RxDBIdentity = { scope: 'https://backup.test', subject: 'alice' };
  const bob: RxDBIdentity = { scope: 'https://backup.test', subject: 'bob' };
  const target = (identity?: RxDBIdentity): RxDB => ({ config: { dbName: 'notes', identity } }) as unknown as RxDB;
  const boundTo = (identity: RxDBIdentity) => [identityClaimName(), identityWatermarkName(getRxDBIdentityKey(identity))];
  const failure = (run: () => void): unknown => {
    try {
      run();
    } catch (error) {
      return error;
    }
    return undefined;
  };

  it('目标没有声明身份时放行，库绑定了谁都一样（与 US-035「不声明时行为不变」一致）', () => {
    expect(() => assertRxDBRestoreIdentity(target(), boundTo(alice))).not.toThrow();
  });

  it('库没有绑定、或绑定的正是目标的身份时放行', () => {
    expect(() => assertRxDBRestoreIdentity(target(bob), ['__rxdb_system_schema__:8'])).not.toThrow();
    expect(() => assertRxDBRestoreIdentity(target(alice), boundTo(alice))).not.toThrow();
  });

  it('库绑定的是别的身份时报 incompatible_archive，details.field 为 identity', () => {
    const error = failure(() => assertRxDBRestoreIdentity(target(bob), boundTo(alice)));
    expect(isRxDBBackupError(error) && error.code).toBe('incompatible_archive');
    expect(isRxDBBackupError(error) && error.details.field).toBe('identity');
  });

  it('库里的首次绑定没有完成（只有竞争行、没有水位行）时报 corrupt_archive', () => {
    const error = failure(() => assertRxDBRestoreIdentity(target(bob), [identityClaimName()]));
    expect(isRxDBBackupError(error) && error.code).toBe('corrupt_archive');
    expect(isRxDBBackupError(error) && error.details.field).toBe('identity');
  });
});
