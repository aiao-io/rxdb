import type { EntityFieldConfig } from '../entity-field.utils.js';
import {
  formatEntityFieldValue,
  parseEntityFieldValue,
  parseEntityFieldValueStrict,
  validateEntityFieldValue
} from '../entity-value.utils.js';

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

  it('should parse bigint', () => {
    expect(parseEntityFieldValue('bigint', '42')).toBe(42n);
    expect(parseEntityFieldValue('bigint', '-7')).toBe(-7n);
    expect(parseEntityFieldValue('bigint', 42n)).toBe(42n);
    expect(parseEntityFieldValue('bigint', '3.5')).toBeNull();
    expect(parseEntityFieldValue('bigint', 'abc')).toBeNull();
    expect(parseEntityFieldValue('bigint', 3.5)).toBeNull();
  });

  it('should parse binary from hex string', () => {
    expect(parseEntityFieldValue('binary', '0a0b')).toEqual(new Uint8Array([0x0a, 0x0b]));
    expect(parseEntityFieldValue('binary', 'DEADbeef')).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    expect(parseEntityFieldValue('binary', '0a0')).toBeNull();
    expect(parseEntityFieldValue('binary', 'zz')).toBeNull();
  });

  it('should pass binary Uint8Array through', () => {
    const bytes = new Uint8Array([1, 2]);
    expect(parseEntityFieldValue('binary', bytes)).toBe(bytes);
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

  it('should format bigint', () => {
    expect(formatEntityFieldValue('bigint', 42n)).toBe('42');
    expect(formatEntityFieldValue('bigint', -7n)).toBe('-7');
  });

  it('should format binary as hex preview', () => {
    expect(formatEntityFieldValue('binary', new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
    const long = new Uint8Array(32).fill(0xab);
    expect(formatEntityFieldValue('binary', long)).toBe('abababababababab… (32 bytes)');
    expect(formatEntityFieldValue('binary', new Uint8Array(0))).toBe('');
  });

  it('should format currency', () => {
    expect(formatEntityFieldValue('number', 3.14, { kind: 'currency', currency: 'CNY' })).toBe('3.14 CNY');
  });

  it('should format percentage by scale', () => {
    expect(formatEntityFieldValue('number', 0.5, { kind: 'percentage', scale: '0..1' })).toBe('50%');
    expect(formatEntityFieldValue('number', 50, { kind: 'percentage', scale: '0..100' })).toBe('50%');
  });

  it('should format rating', () => {
    expect(formatEntityFieldValue('number', 4.5, { kind: 'rating', min: 1, max: 5, step: 0.5 })).toBe('4.5 ★');
  });

  it('should format duration with unit', () => {
    expect(formatEntityFieldValue('integer', 120, { kind: 'duration', unit: 's' })).toBe('120 s');
  });

  it('should honor dateTime display mode', () => {
    const value = new Date('2026-01-02T03:04:05.000Z');
    expect(formatEntityFieldValue('date', value, { kind: 'dateTime', display: 'date' })).toBe(
      value.toLocaleDateString()
    );
    expect(formatEntityFieldValue('date', value, { kind: 'dateTime', display: 'time' })).toBe(
      value.toLocaleTimeString()
    );
    expect(formatEntityFieldValue('date', value, { kind: 'dateTime', display: 'datetime' })).toBe(
      value.toLocaleString()
    );
  });
});

describe('parseEntityFieldValueStrict', () => {
  it('拒绝非法整数、数字数组和 JSON', () => {
    expect(parseEntityFieldValueStrict('integer', '3.7').ok).toBe(false);
    expect(parseEntityFieldValueStrict('numberArray', '1, nope').ok).toBe(false);
    expect(parseEntityFieldValueStrict('json', '{bad').ok).toBe(false);
  });

  it('保留合法空值语义', () => {
    expect(parseEntityFieldValueStrict('json', '')).toEqual({ ok: true, value: null });
  });

  it('拒绝非法 bigint 与 binary', () => {
    expect(parseEntityFieldValueStrict('bigint', '3.5').ok).toBe(false);
    expect(parseEntityFieldValueStrict('bigint', '42')).toEqual({ ok: true, value: 42n });
    expect(parseEntityFieldValueStrict('binary', 'zz').ok).toBe(false);
    expect(parseEntityFieldValueStrict('binary', '0a0b')).toEqual({ ok: true, value: new Uint8Array([0x0a, 0x0b]) });
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

  it('should validate bigint', () => {
    const field = makeField({ type: 'bigint' });
    expect(validateEntityFieldValue(field, 42n)).toBeNull();
    expect(validateEntityFieldValue(field, '42')).toBeNull();
    expect(validateEntityFieldValue(field, 3.5)).not.toBeNull();
    expect(validateEntityFieldValue(field, 'abc')).not.toBeNull();
  });

  it('should validate binary', () => {
    const field = makeField({ type: 'binary' });
    expect(validateEntityFieldValue(field, new Uint8Array([1, 2]))).toBeNull();
    expect(validateEntityFieldValue(field, '0a0b')).toBeNull();
    expect(validateEntityFieldValue(field, 'zz')).not.toBeNull();
  });

  it('should validate url format', () => {
    const field = makeField({ type: 'string', format: { kind: 'url', schemes: ['HTTPS'] } });
    expect(validateEntityFieldValue(field, 'https://example.com/a')).toBeNull();
    expect(validateEntityFieldValue(field, 'example')).not.toBeNull();
    expect(validateEntityFieldValue(field, 'http://example.com/a')).not.toBeNull();
  });

  it('should validate email format', () => {
    const field = makeField({ type: 'string', format: { kind: 'email' } });
    expect(validateEntityFieldValue(field, 'a@example.com')).toBeNull();
    expect(validateEntityFieldValue(field, 'a@example')).not.toBeNull();
  });

  it('should validate phone format', () => {
    const field = makeField({ type: 'string', format: { kind: 'phone' } });
    expect(validateEntityFieldValue(field, '+86 138-0000-0000')).toBeNull();
    expect(validateEntityFieldValue(field, 'abc')).not.toBeNull();
  });

  it('should validate hex color format', () => {
    const field = makeField({ type: 'string', format: { kind: 'color', colorSpace: 'hex' } });
    expect(validateEntityFieldValue(field, '#22c55e')).toBeNull();
    expect(validateEntityFieldValue(field, '22c55e')).toBeNull();
    expect(validateEntityFieldValue(field, '#zzz')).not.toBeNull();
  });

  it('should validate rating range', () => {
    const field = makeField({ type: 'number', format: { kind: 'rating', min: 1, max: 5, step: 0.5 } });
    expect(validateEntityFieldValue(field, 3.5)).toBeNull();
    expect(validateEntityFieldValue(field, 3.25)).not.toBeNull();
    expect(validateEntityFieldValue(field, 9)).not.toBeNull();
  });

  it('should validate percentage domain', () => {
    const field = makeField({ type: 'number', format: { kind: 'percentage', scale: '0..1' } });
    expect(validateEntityFieldValue(field, 0.5)).toBeNull();
    expect(validateEntityFieldValue(field, 1.5)).not.toBeNull();
  });
});
