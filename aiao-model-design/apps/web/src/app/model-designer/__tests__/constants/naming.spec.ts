import { describe, expect, it } from 'vitest';
import {
  generateCopyName,
  generateUniqueName,
  isValidColumnName,
  isValidPropertyName,
  isValidTableName
} from '../../constants/naming';

describe('naming', () => {
  describe('isValidTableName', () => {
    it('MUST accept valid table names', () => {
      expect(isValidTableName('users')).toBe(true);
      expect(isValidTableName('User')).toBe(true);
      expect(isValidTableName('user_profiles')).toBe(true);
      expect(isValidTableName('a123')).toBe(true);
    });

    it('MUST reject invalid table names', () => {
      expect(isValidTableName('123abc')).toBe(false);
      expect(isValidTableName('_users')).toBe(false);
      expect(isValidTableName('user-profiles')).toBe(false);
      expect(isValidTableName('')).toBe(false);
    });
  });

  describe('isValidPropertyName', () => {
    it('MUST accept valid camelCase property names', () => {
      expect(isValidPropertyName('firstName')).toBe(true);
      expect(isValidPropertyName('name')).toBe(true);
      expect(isValidPropertyName('name_snake')).toBe(true);
    });

    it('MUST reject invalid property names', () => {
      expect(isValidPropertyName('FirstName')).toBe(false);
      expect(isValidPropertyName('123name')).toBe(false);
      expect(isValidPropertyName('_name')).toBe(false);
      expect(isValidPropertyName('')).toBe(false);
    });
  });

  describe('isValidColumnName', () => {
    it('MUST accept valid column names', () => {
      expect(isValidColumnName('first_name')).toBe(true);
      expect(isValidColumnName('id')).toBe(true);
    });

    it('MUST reject invalid column names', () => {
      expect(isValidColumnName('FirstName')).toBe(false);
      expect(isValidColumnName('123col')).toBe(false);
      expect(isValidColumnName('')).toBe(false);
    });
  });

  describe('generateUniqueName', () => {
    it('MUST return prefix when no duplicates', () => {
      expect(generateUniqueName('Entity', [])).toBe('Entity');
    });

    it('MUST append 2 when prefix exists', () => {
      expect(generateUniqueName('Entity', ['Entity'])).toBe('Entity2');
    });

    it('MUST keep incrementing until unique', () => {
      expect(generateUniqueName('Entity', ['Entity', 'Entity2', 'Entity3'])).toBe('Entity4');
    });

    it('MUST start from given counter when startCounter > 0', () => {
      expect(generateUniqueName('newRelation', [], 1)).toBe('newRelation1');
    });

    it('MUST skip existing names with startCounter', () => {
      expect(generateUniqueName('newRelation', ['newRelation1', 'newRelation2'], 1)).toBe('newRelation3');
    });
  });

  describe('generateCopyName', () => {
    it('MUST append "副本" suffix when no existing copy', () => {
      expect(generateCopyName('User', [])).toBe('User 副本');
    });

    it('MUST append "(2)" when "副本" already exists', () => {
      expect(generateCopyName('User', ['User', 'User 副本'])).toBe('User 副本 (2)');
    });

    it('MUST take max matching suffix + 1 when multiple numbered copies exist', () => {
      expect(generateCopyName('User', ['User', 'User 副本', 'User 副本 (2)', 'User 副本 (4)'])).toBe('User 副本 (5)');
    });

    it('MUST ignore unrelated names when computing the suffix', () => {
      expect(generateCopyName('User', ['User', 'Other 副本 (9)'])).toBe('User 副本');
    });

    it('MUST treat source names containing regex-special characters literally', () => {
      expect(generateCopyName('A.B+C', ['A.B+C', 'A.B+C 副本'])).toBe('A.B+C 副本 (2)');
    });
  });
});
