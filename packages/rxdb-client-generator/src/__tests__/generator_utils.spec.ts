import { PropertyType, transitionMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { getIdType } from '../generators/utils.js';

describe('generator_utils', () => {
  describe('get_id_type', () => {
    it('should return UUID for uuid type', () => {
      const metadata = transitionMetadata({
        name: 'UuidEntity',
        properties: [{ name: 'id', type: PropertyType.uuid }]
      });

      expect(getIdType(metadata)).toBe('UUID');
    });

    it('should return string for string type', () => {
      const metadata = transitionMetadata({
        name: 'StringEntity',
        properties: [{ name: 'id', type: PropertyType.string }]
      });

      expect(getIdType(metadata)).toBe('string');
    });

    it('should return number for integer type', () => {
      const metadata = transitionMetadata({
        name: 'IntegerEntity',
        properties: [{ name: 'id', type: PropertyType.integer }]
      });

      expect(getIdType(metadata)).toBe('number');
    });

    it('should return bigint for bigint type', () => {
      const metadata = transitionMetadata({
        name: 'BigIntEntity',
        properties: [{ name: 'id', type: PropertyType.bigint }]
      });

      expect(getIdType(metadata)).toBe('bigint');
    });

    it('should reject an unsupported id property type', () => {
      const metadata = transitionMetadata({
        name: 'BooleanEntity',
        properties: [{ name: 'id', type: PropertyType.boolean }]
      });

      expect(() => getIdType(metadata)).toThrow('Unsupported id property type: boolean');
    });
  });
});
