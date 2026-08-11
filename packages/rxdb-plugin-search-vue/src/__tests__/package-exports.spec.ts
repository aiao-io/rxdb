import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('package exports', () => {
  it('only exposes executable runtime conditions', () => {
    const rootExport = packageJson.exports['.'];
    const runtimeEntries = Object.entries(rootExport).filter(([condition]) => condition !== 'types');

    expect(runtimeEntries).not.toContainEqual(['@aiao/source', './src/index.ts']);
    expect(runtimeEntries.every(([, target]) => !target.endsWith('.ts'))).toBe(true);
  });
});
