import { describe, expect, it } from 'vitest';
import { escapeCsvCell, sanitizeForFormula } from './export-results';

describe('sanitizeForFormula', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('prefixes a quote for dangerous lead char %j', value => {
    expect(sanitizeForFormula(value)).toBe(`'${value}`);
  });

  it('leaves benign values untouched', () => {
    expect(sanitizeForFormula('plain text')).toBe('plain text');
    expect(sanitizeForFormula('123')).toBe('123');
    expect(sanitizeForFormula('a=b')).toBe('a=b'); // '=' not at the start
  });
});

describe('escapeCsvCell', () => {
  it('neutralises formula injection AND quotes when needed', () => {
    expect(escapeCsvCell('=1+1')).toBe(`'=1+1`); // sanitized, no special chars → unquoted
    expect(escapeCsvCell('=cmd|calc,x')).toBe(`"'=cmd|calc,x"`); // comma forces quoting
  });

  it('escapes embedded double quotes by doubling them', () => {
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
  });

  it('quotes cells containing commas or newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('leaves plain values unquoted', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
  });
});
