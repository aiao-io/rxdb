import type { EntityFieldConfig } from '../entity-field.utils.js';
import { formatEntityFieldValue, parseEntityFieldValue, validateEntityFieldValue } from '../entity-value.utils.js';

describe('parseEntityFieldValue', () => {
  it('should return null for null/empty', () => {
    expect(parseEntityFieldValue('string', null)).toBeNull();
    expect(parseEntityFieldValue('string', '')).toBeNull();
    expect(parseEntityFieldValue('number', undefined)).toBeNull();
  });

  it('should parse uuid', () => {
    expect(parseEntityFieldValue('uuid', '  ABC-DEF  ')).toBe('abc-def');
  });

  it('should parse number', () => {
    expect(parseEntityFieldValue('number', '3.14')).toBe(3.14);
    expect(parseEntityFieldValue('number', 'abc')).toBeNull();
  });

  it('should parse integer', () => {
    expect(parseEntityFieldValue('integer', '42')).toBe(42);
    expect(parseEntityFieldValue('integer', '3.7')).toBe(3);
    expect(parseEntityFieldValue('integer', 'abc')).toBeNull();
  });

  it('should parse boolean', () => {
    expect(parseEntityFieldValue('boolean', true)).toBe(true);
    expect(parseEntityFieldValue('boolean', 'true')).toBe(true);
    expect(parseEntityFieldValue('boolean', '1')).toBe(true);
    expect(parseEntityFieldValue('boolean', false)).toBe(false);
  });

  it('should parse date', () => {
    const result = parseEntityFieldValue('date', '2026-01-01T00:00:00.000Z');
    expect(result).toBe('2026-01-01T00:00:00.000Z');
    expect(parseEntityFieldValue('date', 'invalid')).toBeNull();
  });

  it('should parse stringArray from string', () => {
    expect(parseEntityFieldValue('stringArray', 'a, b, c')).toEqual(['a', 'b', 'c']);
  });

  it('should parse stringArray from array', () => {
    expect(parseEntityFieldValue('stringArray', ['x', 'y'])).toEqual(['x', 'y']);
  });

  it('should parse numberArray from string', () => {
    expect(parseEntityFieldValue('numberArray', '1, 2, 3')).toEqual([1, 2, 3]);
  });

  it('should parse json from string', () => {
    expect(parseEntityFieldValue('json', '{"a":1}')).toEqual({ a: 1 });
    expect(parseEntityFieldValue('json', 'invalid')).toBeNull();
  });

  it('should parse json from object', () => {
    const obj = { a: 1 };
    expect(parseEntityFieldValue('json', obj)).toBe(obj);
  });

  it('should parse enum', () => {
    expect(parseEntityFieldValue('enum', 'active')).toBe('active');
    expect(parseEntityFieldValue('enum', '')).toBeNull();
  });

  it('should parse relation FK', () => {
    expect(parseEntityFieldValue('oneToOne', 'some-uuid')).toBe('some-uuid');
    expect(parseEntityFieldValue('manyToOne', '')).toBeNull();
  });

  it('should pass computed through', () => {
    expect(parseEntityFieldValue('computed', 'value')).toBe('value');
  });

  it('should return raw for unknown types', () => {
    expect(parseEntityFieldValue('unknown', 'test')).toBe('test');
  });
});

describe('formatEntityFieldValue', () => {
  it('should format empty values', () => {
    expect(formatEntityFieldValue('string', null)).toBe('');
    expect(formatEntityFieldValue('string', '')).toBe('');
  });

  it('should format date', () => {
    const result = formatEntityFieldValue('date', '2026-01-01T00:00:00.000Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should format boolean', () => {
    expect(formatEntityFieldValue('boolean', true)).toBe('true');
    expect(formatEntityFieldValue('boolean', false)).toBe('false');
  });

  it('should format arrays', () => {
    expect(formatEntityFieldValue('stringArray', ['a', 'b'])).toBe('a, b');
    expect(formatEntityFieldValue('numberArray', [1, 2])).toBe('1, 2');
  });

  it('should format json', () => {
    expect(formatEntityFieldValue('json', { a: 1 })).toBe('{"a":1}');
  });

  it('should format string', () => {
    expect(formatEntityFieldValue('string', 'hello')).toBe('hello');
  });
});

describe('validateEntityFieldValue', () => {
  const makeField = (overrides: Partial<EntityFieldConfig> = {}): EntityFieldConfig => ({
    field: 'test',
    displayName: 'Test',
    type: 'string',
    ...overrides
  });

  it('should validate required field', () => {
    const field = makeField({ required: true });
    expect(validateEntityFieldValue(field, null)).toEqual({ field: 'test', message: 'Test 是必填项' });
    expect(validateEntityFieldValue(field, '')).toEqual({ field: 'test', message: 'Test 是必填项' });
    expect(validateEntityFieldValue(field, 'value')).toBeNull();
  });

  it('should validate required array field', () => {
    const field = makeField({ required: true, type: 'stringArray' });
    expect(validateEntityFieldValue(field, [])).toEqual({ field: 'test', message: 'Test 是必填项' });
  });

  it('should skip validation for optional empty', () => {
    const field = makeField({ type: 'uuid' });
    expect(validateEntityFieldValue(field, null)).toBeNull();
  });

  it('should validate uuid format', () => {
    const field = makeField({ type: 'uuid' });
    expect(validateEntityFieldValue(field, '12345')).not.toBeNull();
    expect(validateEntityFieldValue(field, '01234567-89ab-cdef-0123-456789abcdef')).toBeNull();
  });

  it('should validate number', () => {
    const field = makeField({ type: 'number' });
    expect(validateEntityFieldValue(field, 'abc')).not.toBeNull();
    expect(validateEntityFieldValue(field, 3.14)).toBeNull();
  });

  it('should validate integer', () => {
    const field = makeField({ type: 'integer' });
    expect(validateEntityFieldValue(field, 3.14)).not.toBeNull();
    expect(validateEntityFieldValue(field, 42)).toBeNull();
  });

  it('should validate date', () => {
    const field = makeField({ type: 'date' });
    expect(validateEntityFieldValue(field, 'invalid')).not.toBeNull();
    expect(validateEntityFieldValue(field, '2026-01-01')).toBeNull();
  });

  it('should validate enum values', () => {
    const field = makeField({ type: 'enum', enumValues: ['a', 'b'] });
    expect(validateEntityFieldValue(field, 'c')).not.toBeNull();
    expect(validateEntityFieldValue(field, 'a')).toBeNull();
  });

  it('should validate json string', () => {
    const field = makeField({ type: 'json' });
    expect(validateEntityFieldValue(field, 'invalid')).not.toBeNull();
    expect(validateEntityFieldValue(field, '{"a":1}')).toBeNull();
    expect(validateEntityFieldValue(field, { a: 1 })).toBeNull();
  });
});
