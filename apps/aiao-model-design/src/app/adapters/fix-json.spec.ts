import { describe, expect, it } from 'vitest';
import { fixJson } from './fix-json';

describe('fixJson', () => {
  it.each([
    ['{"name":"User"', '{"name":"User"}'],
    ['[1,2,3', '[1,2,3]'],
    ['{"items":[{"id":1}', '{"items":[{"id":1}]}'],
    ['{"items":[1,2,', '{"items":[1,2]}'],
    ['{"items":[1,2', '{"items":[1,2]}'],
    ['{"name":', '{}']
  ])('closes partial structures: %s', (input, expected) => {
    expect(fixJson(input)).toBe(expected);
  });

  it.each([
    ['"unterminated', '"unterminated"'],
    ['{"text":"a {b}', '{"text":"a {b}"}'],
    ['{"text":"line\\n', '{"text":"line\\n"}'],
    ['{"text":"\\u12', '{"text":""}'],
    ['{"text":"\\u12af', '{"text":"\\u12af"}']
  ])('preserves and closes partial strings: %s', (input, expected) => {
    expect(fixJson(input)).toBe(expected);
  });

  it.each([
    ['{"enabled":t', '{"enabled":true}'],
    ['{"enabled":tr', '{"enabled":true}'],
    ['{"enabled":fals', '{"enabled":false}'],
    ['{"value":n', '{"value":null}'],
    ['{"value":nul', '{"value":null}']
  ])('completes partial literals: %s', (input, expected) => {
    expect(fixJson(input)).toBe(expected);
  });

  it.each([
    ['{"count":42', '{"count":42}'],
    ['{"count":-42', '{"count":-42}'],
    ['{"count":1.5e', '{"count":1.5}'],
    ['[0,1e', '[0,1]'],
    ['[1,2]', '[1,2]']
  ])('keeps numeric prefixes and completed values: %s', (input, expected) => {
    expect(fixJson(input)).toBe(expected);
  });

  it('does not consume a trailing value after a completed literal', () => {
    expect(fixJson('{"enabled":true,"name":"User"')).toBe('{"enabled":true,"name":"User"}');
  });

  it('returns an empty string when no JSON value has started', () => {
    expect(fixJson('   ')).toBe('');
  });
});
