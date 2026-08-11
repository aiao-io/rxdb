import { describe, expect, it } from 'vitest';
import { generateTestDbName } from '../../testing/generate-test-db-name.js';

describe('generateTestDbName', () => {
  it('uses the provided prefix', () => {
    const dbName = generateTestDbName('sqlite');

    expect(dbName.startsWith('sqlite_')).toBe(true);
  });

  it('generates unique names', () => {
    const left = generateTestDbName();
    const right = generateTestDbName();

    expect(left).not.toBe(right);
  });
});
