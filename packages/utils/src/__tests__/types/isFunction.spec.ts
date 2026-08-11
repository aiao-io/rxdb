import { describe, expect, it } from 'vitest';
import { isFunction } from '../../types/isFunction.js';

describe('isFunction', () => {
  it('preserves the callable signature of a typed union', () => {
    const callIfFunction = (value: string | (() => number)): number | undefined => {
      if (!isFunction(value)) return undefined;
      const result: number = value();
      return result;
    };

    expect(callIfFunction(() => 42)).toBe(42);
    expect(callIfFunction('not callable')).toBeUndefined();
  });

  it('preserves function return types read from discriminated object unions', () => {
    type Property =
      | { type: 'text'; default?: string | (() => string) }
      | { type: 'count'; default?: number | (() => number) }
      | { type: 'json'; default?: object | (() => object) };

    const resolveDefault = (property: Property): Property['default'] => {
      if (!isFunction(property.default)) return property.default;
      const result: Property['default'] = property.default();
      return result;
    };

    expect(resolveDefault({ type: 'count', default: () => 42 })).toBe(42);
  });

  it('rejects objects that only imitate call and apply', () => {
    expect(isFunction({ call: () => undefined, apply: () => undefined })).toBe(false);
  });
});
