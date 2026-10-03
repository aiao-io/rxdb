/**
 * @fileoverview US-027 阶段 C — 实体级写能力派生
 *
 * UI 只读一份声明：`permissions` 的每个操作是 `'both'` 才算用户能做；没声明等于 `'both'`。
 */
import type { EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { deriveEntityCapabilities } from '../entity-capabilities.js';

const withPermissions = (permissions: EntityMetadata['permissions']): Pick<EntityMetadata, 'permissions'> => ({
  permissions
});

describe('deriveEntityCapabilities', () => {
  it('未声明 permissions：三个能力全开（AC#1）', () => {
    expect(deriveEntityCapabilities(withPermissions(undefined))).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true
    });
  });

  it.each([
    [
      'create',
      { create: 'system', update: 'both', delete: 'both' },
      { canCreate: false, canEdit: true, canDelete: true }
    ],
    [
      'update',
      { create: 'both', update: 'system', delete: 'both' },
      { canCreate: true, canEdit: false, canDelete: true }
    ],
    [
      'delete',
      { create: 'both', update: 'both', delete: 'system' },
      { canCreate: true, canEdit: true, canDelete: false }
    ]
  ] as const)('只收紧 %s：只关掉对应能力', (_operation, permissions, expected) => {
    expect(deriveEntityCapabilities(withPermissions(permissions))).toEqual(expected);
  });

  it('三操作都 system（系统表）：三个能力全关', () => {
    expect(deriveEntityCapabilities(withPermissions({ create: 'system', update: 'system', delete: 'system' }))).toEqual(
      { canCreate: false, canEdit: false, canDelete: false }
    );
  });
});
