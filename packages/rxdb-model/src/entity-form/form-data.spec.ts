import { describe, expect, it } from 'vitest';
import { createDefaultFormData, entityToFormData, formDataToEntityChanges } from './form-data.js';
import type { FormFieldConfig } from './interfaces.js';

function field(name: string, overrides: Partial<FormFieldConfig> = {}): FormFieldConfig {
  return { field: name, type: 'string', ...overrides };
}

describe('entityToFormData', () => {
  it('copies entity values for each configured field', () => {
    const data = entityToFormData({ a: 1, b: 'x', c: null }, [field('a'), field('b'), field('missing')]);
    expect(data).toEqual({ a: 1, b: 'x', missing: null });
  });

  it('normalizes undefined entity values to null', () => {
    const data = entityToFormData({}, [field('a')]);
    expect(data).toEqual({ a: null });
  });
});

describe('formDataToEntityChanges', () => {
  it('skips readonly fields', () => {
    const changes = formDataToEntityChanges({}, { locked: 'new' }, [field('locked', { readonly: true })]);
    expect(changes).toEqual({});
  });

  it('detects primitive value changes', () => {
    const changes = formDataToEntityChanges({ a: 'old', b: 1 }, { a: 'new', b: 1 }, [field('a'), field('b')]);
    expect(changes).toEqual({ a: 'new' });
  });

  it('includes a field when either side becomes null', () => {
    const changes = formDataToEntityChanges({ a: 'old', b: { x: 1 } }, { a: null, b: null }, [
      field('a'),
      field('b', { type: 'json' })
    ]);
    expect(changes).toEqual({ a: null, b: null });
  });

  it('detects deep object changes', () => {
    const changes = formDataToEntityChanges({ a: { x: 1, y: [1, 2] } }, { a: { x: 2, y: [1, 2] } }, [
      field('a', { type: 'json' })
    ]);
    expect(changes).toEqual({ a: { x: 2, y: [1, 2] } });
  });

  it('ignores deeply-equal objects', () => {
    const original = { x: 1, y: [1, 2] };
    const changes = formDataToEntityChanges({ a: original }, { a: { x: 1, y: [1, 2] } }, [
      field('a', { type: 'json' })
    ]);
    expect(changes).toEqual({});
  });
});

describe('createDefaultFormData', () => {
  it('skips readonly fields', () => {
    const data = createDefaultFormData([field('locked', { readonly: true }), field('name')]);
    expect(data).toEqual({ name: null });
  });

  it('defaults boolean to false', () => {
    expect(createDefaultFormData([field('active', { type: 'boolean' })])).toEqual({ active: false });
  });

  it('defaults stringArray and numberArray to empty arrays', () => {
    expect(
      createDefaultFormData([field('tags', { type: 'stringArray' }), field('scores', { type: 'numberArray' })])
    ).toEqual({ tags: [], scores: [] });
  });

  it('defaults keyValue and json to null', () => {
    expect(createDefaultFormData([field('kv', { type: 'keyValue' }), field('meta', { type: 'json' })])).toEqual({
      kv: null,
      meta: null
    });
  });

  it('defaults other types to null', () => {
    expect(
      createDefaultFormData([field('name'), field('age', { type: 'integer' }), field('born', { type: 'date' })])
    ).toEqual({ name: null, age: null, born: null });
  });
});
