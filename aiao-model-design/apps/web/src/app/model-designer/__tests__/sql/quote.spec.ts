import { describe, expect, it } from 'vitest';
import { needsQuotes, quoteIdent, trackEscaped } from '../../sql/quote';

describe('quoteIdent / needsQuotes', () => {
  it('safe lowercase identifier stays unquoted', () => {
    expect(needsQuotes('users')).toBe(false);
    expect(quoteIdent('users')).toBe('users');
  });

  it('reserved word is double-quoted', () => {
    expect(needsQuotes('user')).toBe(true);
    expect(quoteIdent('user')).toBe('"user"');
    expect(quoteIdent('order')).toBe('"order"');
  });

  it('PascalCase / mixed case needs quotes', () => {
    expect(needsQuotes('User')).toBe(true);
    expect(quoteIdent('User')).toBe('"User"');
  });

  it('spaces and special chars need quotes', () => {
    expect(quoteIdent('my table')).toBe('"my table"');
    expect(quoteIdent('col-name')).toBe('"col-name"');
  });

  it('embeds double quotes by doubling', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });

  it('leading digit needs quotes', () => {
    expect(needsQuotes('1col')).toBe(true);
    expect(quoteIdent('1col')).toBe('"1col"');
  });

  it('empty string needs quotes', () => {
    expect(needsQuotes('')).toBe(true);
    expect(quoteIdent('')).toBe('""');
  });
});

describe('trackEscaped', () => {
  it('only records paths that need quotes', () => {
    const set = new Set<string>();
    trackEscaped(set, 'users', 'users');
    trackEscaped(set, 'user', 'user');
    trackEscaped(set, 't.UserId', 'UserId');
    expect([...set].sort()).toEqual(['t.UserId', 'user']);
  });
});
