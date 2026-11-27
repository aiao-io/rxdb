/**
 * @fileoverview US-029 阶段 D — 规则形式写权限的界面能力派生（实体级、按行、写入口全关的原因）
 *
 * 1. 实体级：规则形式的操作看授权快照里**带该前缀**的作用域有没有所需权限，快照未取到或没传时关闭；
 * 2. 按行：作用域取这一行的作用域属性值，不能时给出原因；简写（'both' / 'system'）与实体级一致；
 * 3. 写入口全关的原因：只读实例，或有规则形式的操作而快照还没取到。
 */
import { RxDBGrantSnapshot, type EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  deriveEntityCapabilities,
  deriveRowCapabilities,
  deriveWriteBlockedReason
} from '../entity-capabilities.js';

type Declared = Pick<EntityMetadata, 'permissions' | 'access'>;

const EDIT = { requires: 'edit' } as const;
const ACCESS = { scope: { property: 'tenantId', prefix: 'tenant:' } } as const;

const scoped = (permissions: EntityMetadata['permissions']): Declared => ({ access: ACCESS, permissions });

const ALL_EDIT = scoped({ create: EDIT, update: EDIT, delete: EDIT });

/** a 可编辑、b 只读；另有调用者自己 user 区的 edit（Supabase 平台默认），它不该让 tenant 实体开新增 */
const GRANTS = RxDBGrantSnapshot.known(
  [
    { scope: 'tenant:a', permissions: ['read', 'edit'] },
    { scope: 'tenant:b', permissions: ['read'] },
    { scope: 'user:u1', permissions: ['read', 'edit'] }
  ],
  'app',
  new Date(0)
);

const ONLY_READ = RxDBGrantSnapshot.known(
  [
    { scope: 'tenant:a', permissions: ['read'] },
    { scope: 'user:u1', permissions: ['read', 'edit'] }
  ],
  'app',
  new Date(0)
);

describe('deriveEntityCapabilities：规则形式（US-029）', () => {
  it('快照里有带该前缀、且有所需权限的作用域：三项都开', () => {
    expect(deriveEntityCapabilities(ALL_EDIT, { grants: GRANTS })).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true
    });
  });

  it('只有别的前缀（user:）上有 edit：三项都关', () => {
    expect(deriveEntityCapabilities(ALL_EDIT, { grants: ONLY_READ })).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false
    });
  });

  it.each([
    ['快照未取到', RxDBGrantSnapshot.UNKNOWN],
    ['没传快照', undefined]
  ])('%s：规则形式的操作一律关闭', (_label, grants) => {
    expect(deriveEntityCapabilities(ALL_EDIT, { grants })).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false
    });
  });

  it('规则与简写混用：简写照旧，规则按快照', () => {
    const declared = scoped({ create: EDIT, update: 'system', delete: 'both' });

    expect(deriveEntityCapabilities(declared, { grants: ONLY_READ })).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: true
    });
  });

  it('只读实例：快照怎样都全关', () => {
    expect(deriveEntityCapabilities(ALL_EDIT, { grants: GRANTS, readOnly: true })).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false
    });
  });

  it('前缀为空串：任何作用域都算', () => {
    const declared: Declared = {
      access: { scope: { property: 'ownerKey' } },
      permissions: { create: EDIT, update: 'both', delete: 'both' }
    };

    expect(deriveEntityCapabilities(declared, { grants: ONLY_READ }).canCreate).toBe(true);
  });
});

describe('deriveRowCapabilities（US-029）', () => {
  it.each([
    ['a 可编辑', { id: '1', tenantId: 'a' }, { canEdit: true, canDelete: true }],
    [
      'b 只读',
      { id: '2', tenantId: 'b' },
      { canEdit: false, canDelete: false, editReason: 'missing-permission', deleteReason: 'missing-permission' }
    ],
    [
      '作用域属性没有值',
      { id: '3' },
      { canEdit: false, canDelete: false, editReason: 'missing-permission', deleteReason: 'missing-permission' }
    ]
  ])('%s', (_label, record, expected) => {
    expect(deriveRowCapabilities(ALL_EDIT, record, { grants: GRANTS })).toEqual(expected);
  });

  it('快照未取到：原因是授权未知', () => {
    expect(deriveRowCapabilities(ALL_EDIT, { id: '1', tenantId: 'a' }, { grants: RxDBGrantSnapshot.UNKNOWN })).toEqual({
      canEdit: false,
      canDelete: false,
      editReason: 'grants-unknown',
      deleteReason: 'grants-unknown'
    });
  });

  it('只读实例的原因排在最前', () => {
    expect(deriveRowCapabilities(ALL_EDIT, { id: '1', tenantId: 'a' }, { grants: GRANTS, readOnly: true })).toEqual({
      canEdit: false,
      canDelete: false,
      editReason: 'read-only-instance',
      deleteReason: 'read-only-instance'
    });
  });

  it('update 是规则、delete 是 system：编辑按行，删除恒关且原因是只许系统写', () => {
    const declared = scoped({ create: 'both', update: EDIT, delete: 'system' });

    expect(deriveRowCapabilities(declared, { id: '1', tenantId: 'a' }, { grants: GRANTS })).toEqual({
      canEdit: true,
      canDelete: false,
      deleteReason: 'system'
    });
  });

  it('没声明规则的实体：与实体级一致，与行无关', () => {
    expect(deriveRowCapabilities({ permissions: undefined }, { id: '1' }, {})).toEqual({
      canEdit: true,
      canDelete: true
    });
    expect(
      deriveRowCapabilities({ permissions: { create: 'both', update: 'system', delete: 'both' } }, { id: '1' }, {})
    ).toEqual({ canEdit: false, canDelete: true, editReason: 'system' });
  });
});

describe('deriveWriteBlockedReason（US-029 AC#20）', () => {
  it('只读实例：不论实体', () => {
    expect(deriveWriteBlockedReason({ permissions: undefined }, { readOnly: true })).toBe('read-only-instance');
    expect(deriveWriteBlockedReason(ALL_EDIT, { readOnly: true, grants: GRANTS })).toBe('read-only-instance');
  });

  it.each([
    ['快照未取到', RxDBGrantSnapshot.UNKNOWN],
    ['没传快照', undefined]
  ])('有规则形式的操作而%s：授权未知', (_label, grants) => {
    expect(deriveWriteBlockedReason(ALL_EDIT, { grants })).toBe('grants-unknown');
  });

  it('快照已取到、或实体没有规则：没有全关的原因', () => {
    expect(deriveWriteBlockedReason(ALL_EDIT, { grants: ONLY_READ })).toBeUndefined();
    expect(deriveWriteBlockedReason({ permissions: undefined }, { grants: RxDBGrantSnapshot.UNKNOWN })).toBeUndefined();
  });
});
