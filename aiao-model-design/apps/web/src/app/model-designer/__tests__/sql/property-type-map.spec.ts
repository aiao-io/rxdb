import { describe, expect, it } from 'vitest';
import { mapPropertyTypeToPg } from '../../sql/property-type-map';

describe('mapPropertyTypeToPg', () => {
  it('maps scalar types', () => {
    expect(mapPropertyTypeToPg('uuid')).toEqual({ type: 'uuid' });
    expect(mapPropertyTypeToPg('string')).toEqual({ type: 'text' });
    expect(mapPropertyTypeToPg('number')).toEqual({ type: 'double precision' });
    expect(mapPropertyTypeToPg('integer')).toEqual({ type: 'integer' });
    expect(mapPropertyTypeToPg('boolean')).toEqual({ type: 'boolean' });
    expect(mapPropertyTypeToPg('date')).toEqual({ type: 'timestamptz' });
  });

  it('maps arrays and json', () => {
    expect(mapPropertyTypeToPg('stringArray')).toEqual({ type: 'text[]' });
    expect(mapPropertyTypeToPg('numberArray')).toEqual({ type: 'double precision[]' });
    expect(mapPropertyTypeToPg('keyValue')).toEqual({ type: 'jsonb' });
    expect(mapPropertyTypeToPg('json')).toEqual({ type: 'jsonb' });
  });

  it('maps enum to text + CHECK', () => {
    const m = mapPropertyTypeToPg('enum', ['active', 'pending'], 'status');
    expect(m.type).toBe('text');
    expect(m.check).toBe("status IN ('active', 'pending')");
  });

  it('escapes single quotes in enum values', () => {
    const m = mapPropertyTypeToPg('enum', ["O'Brien"], '"label"');
    expect(m.check).toBe(`"label" IN ('O''Brien')`);
  });

  it('enum without values is plain text', () => {
    expect(mapPropertyTypeToPg('enum', [])).toEqual({ type: 'text' });
  });

  it('unknown type falls back to text', () => {
    expect(mapPropertyTypeToPg('mystery')).toEqual({ type: 'text' });
  });
});
