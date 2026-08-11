import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';

describe('benchmark Vite config', () => {
  it('lets Vite crawl workspace source dependencies before the CI benchmark starts', async () => {
    const config = await resolveConfig(
      { configFile: resolve(import.meta.dirname, '../../vite.config.mts') },
      'serve'
    );

    expect(config.optimizeDeps.exclude).not.toContain('@aiao/rxdb');
    expect(config.optimizeDeps.exclude).not.toContain('@aiao/rxdb-plugin-search');
  });
});
