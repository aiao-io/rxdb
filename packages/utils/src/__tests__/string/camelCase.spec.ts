import { describe, expect, it } from 'vitest';
import { camelCase } from '../../string/camelCase.js';

describe('camelCase', () => {
  it('should change camel case to camel case', async () => {
    expect(camelCase('camelCase')).toEqual('camelCase');
  });

  it('should change space to underscore', async () => {
    expect(camelCase('some whitespace')).toEqual('someWhitespace');
  });

  it('should change hyphen to underscore', async () => {
    expect(camelCase('hyphen-text')).toEqual('hyphenText');
  });

  it('should change Acronyms to small letter', async () => {
    expect(camelCase('HTTPRequest')).toEqual('httpRequest');
  });

  it('should handle leading and trailing whitespace', async () => {
    expect(camelCase('    leading and trailing whitespace')).toEqual('leadingAndTrailingWhitespace');
  });

  it('should handle special characters correctly', async () => {
    expect(camelCase('special@characters!')).toEqual('specialCharacters');
  });

  it('should handle strings that are already in camel_case', async () => {
    expect(camelCase('camel_case')).toEqual('camelCase');
  });

  it('should work with an empty string', async () => {
    expect(camelCase('')).toEqual('');
  });

  it('should work with screaming camel case', async () => {
    expect(camelCase('FOO_BAR')).toEqual('fooBar');
  });

  it('should keep non-ASCII characters instead of returning an empty string', async () => {
    expect(camelCase('用户 名称')).toEqual('用户名称');
    expect(camelCase('用户ID')).toEqual('用户Id');
    expect(camelCase('héllo wörld')).toEqual('hélloWörld');
  });
});
