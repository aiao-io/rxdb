import { describe, expect, it } from 'vitest';
import { createDefaultFormData, entityToFormData, formDataToEntityChanges } from '../../entity-form/form-data.js';
import type { FormFieldConfig } from '../../entity-form/interfaces.js';

function field(name: string, overrides: Partial<FormFieldConfig> = {}): FormFieldConfig {
  return { field: name, displayName: name, type: 'string', ...overrides };
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

  it('treats an untouched date (entity Date, parsed to an ISO string) as unchanged', () => {
    const entity = { at: new Date('2026-01-02T03:04:05.678Z') };
    const fields = [field('at', { type: 'date' })];
    const changes = formDataToEntityChanges(entity, entityToFormData(entity, fields), fields);
    expect(changes).toEqual({});
  });

  it('treats the same instant given as an ISO string as unchanged', () => {
    const changes = formDataToEntityChanges(
      { at: new Date('2026-01-02T03:04:05.678Z') },
      { at: '2026-01-02T03:04:05.678Z' },
      [field('at', { type: 'date' })]
    );
    expect(changes).toEqual({});
  });

  it('reports a changed date as the parsed ISO string', () => {
    const changes = formDataToEntityChanges(
      { at: new Date('2026-01-02T03:04:05.678Z') },
      { at: '2026-02-03T00:00:00.000Z' },
      [field('at', { type: 'date' })]
    );
    expect(changes).toEqual({ at: '2026-02-03T00:00:00.000Z' });
  });

  it('treats an untouched empty string as unchanged (both sides normalize to null)', () => {
    const changes = formDataToEntityChanges({ a: '' }, { a: '' }, [field('a')]);
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
