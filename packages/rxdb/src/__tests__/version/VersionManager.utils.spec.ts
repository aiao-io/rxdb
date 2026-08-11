import { describe, expect, it } from 'vitest';
import type { RxDBEntityId } from '../../entity/entity.interface.js';
import type { IRxDBChange } from '../../system/system.interface.js';
import { getRxDBChangeKey, parseRxDBChangeKey } from '../../version/VersionManager.utils.js';

const createChangeIdentity = (namespace: string, entity: string, entityId: RxDBEntityId): IRxDBChange => ({
  id: 1,
  namespace,
  entity,
  entityId,
  type: 'UPDATE',
  createdAt: new Date(0),
  updatedAt: new Date(0)
});

describe('VersionManager.utils', () => {
  describe('getRxDBChangeKey', () => {
    it('should construct entity key from change object', () => {
      const change = createChangeIdentity('public', 'User', '123');
      expect(parseRxDBChangeKey(getRxDBChangeKey(change))).toEqual(['public', 'User', '123']);
    });

    it('should handle custom namespace', () => {
      const change = createChangeIdentity('admin', 'Role', 'role-001');
      expect(parseRxDBChangeKey(getRxDBChangeKey(change))).toEqual(['admin', 'Role', 'role-001']);
    });

    it('should handle uuid entityId', () => {
      const change = createChangeIdentity('public', 'Order', '550e8400-e29b-41d4-a716-446655440000');
      expect(parseRxDBChangeKey(getRxDBChangeKey(change))).toEqual([
        'public',
        'Order',
        '550e8400-e29b-41d4-a716-446655440000'
      ]);
    });

    it('does not collide number, bigint and string ids', () => {
      const keys = [1, 1n, '1'].map(id => getRxDBChangeKey(createChangeIdentity('public', 'Item', id)));
      expect(new Set(keys).size).toBe(3);
      expect(keys.map(parseRxDBChangeKey)).toEqual([
        ['public', 'Item', 1],
        ['public', 'Item', 1n],
        ['public', 'Item', '1']
      ]);
    });
  });

  describe('parseRxDBChangeKey', () => {
    it('should parse entity key to [namespace, entity, entityId]', () => {
      const result = parseRxDBChangeKey('public:User:123');
      expect(result).toEqual(['public', 'User', '123']);
    });

    it('should handle custom namespace', () => {
      const result = parseRxDBChangeKey('admin:Role:role-001');
      expect(result).toEqual(['admin', 'Role', 'role-001']);
    });

    it('should handle uuid entityId', () => {
      const result = parseRxDBChangeKey('public:Order:550e8400-e29b-41d4-a716-446655440000');
      expect(result).toEqual(['public', 'Order', '550e8400-e29b-41d4-a716-446655440000']);
    });
  });
});
