import { describe, expect, it } from 'vitest';
import { getDefaultValueForType, getInputType, parseCommaSeparatedInput } from './value-input.js';

describe('getInputType', () => {
  it('returns none for null/notNull operators', () => {
    expect(getInputType('string', 'null')).toBe('none');
    expect(getInputType('number', 'notNull')).toBe('none');
  });

  it('returns range for between/notBetween', () => {
    expect(getInputType('number', 'between')).toBe('range');
    expect(getInputType('date', 'notBetween')).toBe('range');
  });

  it('returns enum-array for in/notIn with enumOptions', () => {
    expect(getInputType('enum', 'in', ['a', 'b'])).toBe('enum-array');
  });

  it('returns array for in/notIn without enumOptions', () => {
    expect(getInputType('string', 'in')).toBe('array');
  });

  it('returns boolean for boolean fieldType', () => {
    expect(getInputType('boolean', '=')).toBe('boolean');
  });

  it('returns number for number/integer fieldType', () => {
    expect(getInputType('number', '=')).toBe('number');
    expect(getInputType('integer', '=')).toBe('number');
  });

  it('returns date for date fieldType', () => {
    expect(getInputType('date', '=')).toBe('date');
  });

  it('returns string as default', () => {
    expect(getInputType('string', '=')).toBe('string');
  });

  it('returns uuid for uuid fieldType', () => {
    expect(getInputType('uuid', '=')).toBe('uuid');
  });

  it('returns subquery for the exists operator', () => {
    expect(getInputType('relation', 'exists')).toBe('subquery');
  });

  it('returns enum when enumOptions are provided for a single-value operator', () => {
    expect(getInputType('string', '=', ['a', 'b'])).toBe('enum');
  });

  it('returns date for the date-time fieldType', () => {
    expect(getInputType('date-time', '=')).toBe('date');
  });

  it('falls back to string when the registry has no matching operator', () => {
    const registry = { getForType: () => [] };
    expect(getInputType('string', '=', undefined, registry as never)).toBe('string');
  });
});

describe('getDefaultValueForType', () => {
  it('returns null for none', () => {
    expect(getDefaultValueForType('none')).toBeNull();
  });

  it('returns false for boolean', () => {
    expect(getDefaultValueForType('boolean')).toBe(false);
  });

  it('returns empty array for range/array/enum-array', () => {
    expect(getDefaultValueForType('range')).toEqual([]);
    expect(getDefaultValueForType('array')).toEqual([]);
    expect(getDefaultValueForType('enum-array')).toEqual([]);
  });

  it('returns empty string as default', () => {
    expect(getDefaultValueForType('string')).toBe('');
  });

  it('returns null for number and date', () => {
    expect(getDefaultValueForType('number')).toBeNull();
    expect(getDefaultValueForType('date')).toBeNull();
  });

  it('returns undefined for subquery', () => {
    expect(getDefaultValueForType('subquery')).toBeUndefined();
  });
});

describe('parseCommaSeparatedInput', () => {
  it('parses comma-separated strings', () => {
    expect(parseCommaSeparatedInput('a, b, c', 'string')).toEqual(['a', 'b', 'c']);
  });

  it('filters empty entries', () => {
    expect(parseCommaSeparatedInput('a,, ,b', 'string')).toEqual(['a', 'b']);
  });

  it('parses numbers when fieldType is number', () => {
    expect(parseCommaSeparatedInput('1, 2, 3', 'number')).toEqual([1, 2, 3]);
  });

  it('filters NaN when fieldType is number', () => {
    expect(parseCommaSeparatedInput('1, abc, 3', 'number')).toEqual([1, 3]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCommaSeparatedInput('', 'string')).toEqual([]);
  });

  it('parses decimals when fieldType is number', () => {
    expect(parseCommaSeparatedInput('1.5, 2', 'number')).toEqual([1.5, 2]);
  });
});
