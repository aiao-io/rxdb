import { describe, expect, it } from 'vitest';
import {
  BUILTIN_VALIDATION_RULES,
  type ValidationContext
} from '../../../query-builder/models/validation.interface.js';

function rule(name: string) {
  const found = BUILTIN_VALIDATION_RULES.find(r => r.name === name);
  if (!found) throw new Error(`rule ${name} not found`);
  return found;
}

function ctx(partial: Partial<ValidationContext> = {}): ValidationContext {
  return { fieldType: 'string', operator: '=', value: undefined, ...partial };
}

describe('BUILTIN_VALIDATION_RULES', () => {
  it('registers six built-in rules', () => {
    expect(BUILTIN_VALIDATION_RULES.map(r => r.name)).toEqual([
      'stringType',
      'numberType',
      'booleanType',
      'dateType',
      'enumType',
      'patternType'
    ]);
  });

  it('declares appliesTo and message on every rule', () => {
    for (const r of BUILTIN_VALIDATION_RULES) {
      expect(r.appliesTo?.length ?? 0).toBeGreaterThan(0);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

describe('stringType rule', () => {
  it('accepts strings and skips nil / array values', () => {
    const validate = rule('stringType').validate;
    expect(validate(ctx({ value: 'hello' }))).toBe(true);
    expect(validate(ctx({ value: 123 }))).toBe(false);
    expect(validate(ctx({ value: null }))).toBe(true);
    expect(validate(ctx({ value: undefined }))).toBe(true);
    expect(validate(ctx({ value: ['a'] }))).toBe(true);
  });
});

describe('numberType rule', () => {
  it('accepts finite numbers only', () => {
    const validate = rule('numberType').validate;
    expect(validate(ctx({ value: 42 }))).toBe(true);
    expect(validate(ctx({ value: -1.5 }))).toBe(true);
    expect(validate(ctx({ value: NaN }))).toBe(false);
    expect(validate(ctx({ value: '42' }))).toBe(false);
    expect(validate(ctx({ value: null }))).toBe(true);
  });
});

describe('booleanType rule', () => {
  it('accepts booleans only', () => {
    const validate = rule('booleanType').validate;
    expect(validate(ctx({ value: true }))).toBe(true);
    expect(validate(ctx({ value: false }))).toBe(true);
    expect(validate(ctx({ value: 1 }))).toBe(false);
    expect(validate(ctx({ value: null }))).toBe(true);
  });
});

describe('dateType rule', () => {
  it('accepts valid Date instances', () => {
    const validate = rule('dateType').validate;
    expect(validate(ctx({ value: new Date('2024-01-01') }))).toBe(true);
    expect(validate(ctx({ value: new Date('invalid') }))).toBe(false);
  });

  it('accepts parseable strings', () => {
    const validate = rule('dateType').validate;
    expect(validate(ctx({ value: '2024-01-01' }))).toBe(true);
    expect(validate(ctx({ value: 'not-a-date' }))).toBe(false);
  });

  it('rejects numbers and skips nil / array values', () => {
    const validate = rule('dateType').validate;
    expect(validate(ctx({ value: 123 }))).toBe(false);
    expect(validate(ctx({ value: null }))).toBe(true);
    expect(validate(ctx({ value: undefined }))).toBe(true);
    expect(validate(ctx({ value: ['2024-01-01'] }))).toBe(true);
  });
});

describe('enumType rule', () => {
  it('skips nil values', () => {
    const validate = rule('enumType').validate;
    expect(validate(ctx({ value: null, enum: ['a'] }))).toBe(true);
    expect(validate(ctx({ value: undefined, enum: ['a'] }))).toBe(true);
  });

  it('passes when no enum options are provided', () => {
    const validate = rule('enumType').validate;
    expect(validate(ctx({ value: 'anything' }))).toBe(true);
    expect(validate(ctx({ value: 'x', enum: [] }))).toBe(true);
  });

  it('checks scalar values against the enum options', () => {
    const validate = rule('enumType').validate;
    expect(validate(ctx({ value: 'a', enum: ['a', 'b'] }))).toBe(true);
    expect(validate(ctx({ value: 'c', enum: ['a', 'b'] }))).toBe(false);
  });

  it('checks every element of an array value', () => {
    const validate = rule('enumType').validate;
    expect(validate(ctx({ value: ['a', 'b'], enum: ['a', 'b'] }))).toBe(true);
    expect(validate(ctx({ value: ['a', 'c'], enum: ['a', 'b'] }))).toBe(false);
  });
});

describe('patternType rule', () => {
  it('tests string values against the pattern', () => {
    const validate = rule('patternType').validate;
    expect(validate(ctx({ value: 'abc123', pattern: '^[a-z]+\\d+$' }))).toBe(true);
    expect(validate(ctx({ value: 'abc', pattern: '^[a-z]+\\d+$' }))).toBe(false);
  });

  it('passes when no pattern is given or the value is not a string', () => {
    const validate = rule('patternType').validate;
    expect(validate(ctx({ value: 'x' }))).toBe(true);
    expect(validate(ctx({ value: 123, pattern: '\\d+' }))).toBe(true);
  });

  it('skips nil and array values', () => {
    const validate = rule('patternType').validate;
    expect(validate(ctx({ value: null, pattern: 'x' }))).toBe(true);
    expect(validate(ctx({ value: undefined, pattern: 'x' }))).toBe(true);
    expect(validate(ctx({ value: ['a'], pattern: 'x' }))).toBe(true);
  });

  it('treats an invalid regex as a pass', () => {
    const validate = rule('patternType').validate;
    expect(validate(ctx({ value: 'x', pattern: '[' }))).toBe(true);
  });
});
