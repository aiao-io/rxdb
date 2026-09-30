import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPERATORS,
  getOperatorsForType,
  type OperatorDefinition
} from '../../../query-builder/models/operator.interface.js';
import type { PropertyType } from '../../../query-builder/models/query-builder-state.js';

function keysOf(operators: OperatorDefinition[]): string[] {
  return operators.map(o => o.key);
}

describe('DEFAULT_OPERATORS', () => {
  it('contains one definition per operator key', () => {
    expect(DEFAULT_OPERATORS).toHaveLength(20);
    const keys = keysOf(DEFAULT_OPERATORS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every operator a label', () => {
    for (const op of DEFAULT_OPERATORS) {
      expect(op.label.length).toBeGreaterThan(0);
    }
  });

  it('gives every operator a value type', () => {
    for (const op of DEFAULT_OPERATORS) {
      expect(['single', 'array', 'range', 'none', 'subquery']).toContain(op.valueType);
    }
  });

  it('declares null / notNull with no applicable types', () => {
    const nullOp = DEFAULT_OPERATORS.find(o => o.key === 'null');
    const notNullOp = DEFAULT_OPERATORS.find(o => o.key === 'notNull');
    expect(nullOp?.applicableTypes).toEqual([]);
    expect(notNullOp?.applicableTypes).toEqual([]);
  });

  it('declares range operators for number and date', () => {
    const between = DEFAULT_OPERATORS.find(o => o.key === 'between');
    expect(between?.valueType).toBe('range');
    expect(between?.applicableTypes).toEqual(['number', 'date']);
  });

  it('declares the exists operators for relation fields', () => {
    const exists = DEFAULT_OPERATORS.find(o => o.key === 'exists');
    const notExists = DEFAULT_OPERATORS.find(o => o.key === 'notExists');
    expect(exists?.valueType).toBe('subquery');
    expect(exists?.applicableTypes).toEqual(['relation']);
    expect(notExists?.applicableTypes).toEqual(['relation']);
  });
});

describe('getOperatorsForType', () => {
  it('returns string operators for string fields', () => {
    const keys = keysOf(getOperatorsForType('string'));
    expect(keys).toContain('=');
    expect(keys).toContain('!=');
    expect(keys).toContain('contains');
    expect(keys).toContain('startsWith');
    expect(keys).toContain('endsWith');
    expect(keys).toContain('in');
    expect(keys).not.toContain('between');
    expect(keys).not.toContain('exists');
  });

  it('returns number operators for number fields', () => {
    const keys = keysOf(getOperatorsForType('number'));
    expect(keys).toContain('<');
    expect(keys).toContain('<=');
    expect(keys).toContain('>');
    expect(keys).toContain('>=');
    expect(keys).toContain('between');
    expect(keys).toContain('notBetween');
    expect(keys).not.toContain('startsWith');
  });

  it('returns date operators for date fields', () => {
    const keys = keysOf(getOperatorsForType('date'));
    expect(keys).toContain('between');
    expect(keys).toContain('<');
  });

  it('returns array operators for array fields', () => {
    const keys = keysOf(getOperatorsForType('array'));
    expect(keys).toContain('contains');
    expect(keys).toContain('notContains');
  });

  it('returns the relation operators for relation fields', () => {
    const keys = keysOf(getOperatorsForType('relation'));
    expect(keys).toEqual(['exists', 'notExists']);
  });

  it('returns an empty list for an unknown field type', () => {
    expect(getOperatorsForType('unknown' as PropertyType)).toEqual([]);
  });

  it('honors a custom operator list', () => {
    const custom: OperatorDefinition[] = [
      { key: '=', label: '等于', valueType: 'single', applicableTypes: ['string'] }
    ];
    expect(keysOf(getOperatorsForType('string', custom))).toEqual(['=']);
    expect(getOperatorsForType('number', custom)).toEqual([]);
  });
});
