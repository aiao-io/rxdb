import { describe, expect, it } from 'vitest';
import { orderBy } from '../../array/orderBy.js';

describe('orderBy', () => {
  it('should sort by multiple properties with specified orders', () => {
    const users = [
      { user: 'fred', age: 48 },
      { user: 'barney', age: 34 },
      { user: 'fred', age: 40 },
      { user: 'barney', age: 36 }
    ];
    const result = orderBy(users, ['user', 'age'], ['asc', 'desc']);
    expect(result).toEqual([
      { user: 'barney', age: 36 },
      { user: 'barney', age: 34 },
      { user: 'fred', age: 48 },
      { user: 'fred', age: 40 }
    ]);
  });

  it('should handle ascending order sort', () => {
    const users = [
      { user: 'fred', age: 48 },
      { user: 'barney', age: 34 },
      { user: 'wilma', age: 40 }
    ];
    const result = orderBy(users, ['user'], ['asc']);
    expect(result).toEqual([
      { user: 'barney', age: 34 },
      { user: 'fred', age: 48 },
      { user: 'wilma', age: 40 }
    ]);
  });

  it('should handle descending order sort', () => {
    const users = [
      { user: 'fred', age: 48 },
      { user: 'barney', age: 34 },
      { user: 'wilma', age: 40 }
    ];
    const result = orderBy(users, ['age'], ['desc']);
    expect(result).toEqual([
      { user: 'fred', age: 48 },
      { user: 'wilma', age: 40 },
      { user: 'barney', age: 34 }
    ]);
  });

  it('should handle empty array', () => {
    const result = orderBy([], ['user'], ['asc']);
    expect(result).toEqual([]);
  });

  it('should handle array with one element', () => {
    const users = [{ user: 'fred', age: 48 }];
    const result = orderBy(users, ['user'], ['asc']);
    expect(result).toEqual([{ user: 'fred', age: 48 }]);
  });

  it('should handle null and undefined values', () => {
    const users = [
      { user: 'fred', age: 48 },
      { user: null, age: 34 },
      { user: 'barney', age: undefined },
      { user: 'wilma', age: 40 }
    ];
    const result = orderBy(users, ['user'], ['asc']);
    expect(result).toEqual([
      { user: null, age: 34 },
      { user: 'barney', age: undefined },
      { user: 'fred', age: 48 },
      { user: 'wilma', age: 40 }
    ]);
  });

  it('should handle missing properties', () => {
    const users = [
      { user: 'fred', age: 48 },
      { user: 'barney' }, // 缺少 age
      { name: 'wilma', age: 40 } // 缺少 user
    ];
    const result = orderBy(users, ['user'], ['asc']);
    expect(result).toEqual([
      { name: 'wilma', age: 40 }, // 缺少 user
      { user: 'barney' }, // 缺少 age
      { user: 'fred', age: 48 }
    ]);
  });

  it('should default to ascending order when order is not specified', () => {
    const users = [
      { user: 'fred', age: 48 },
      { user: 'barney', age: 34 },
      { user: 'wilma', age: 40 }
    ];
    const result = orderBy(users, ['user']);
    expect(result).toEqual([
      { user: 'barney', age: 34 },
      { user: 'fred', age: 48 },
      { user: 'wilma', age: 40 }
    ]);
  });
});
