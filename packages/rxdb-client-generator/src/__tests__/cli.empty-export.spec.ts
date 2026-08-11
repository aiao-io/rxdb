import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('jiti', () => ({
  createJiti: () => ({
    import: async () => ({})
  })
}));

import { loadConfig } from '../cli/cli.js';

describe('cli loadConfig empty module export', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  it('throws when jiti returns a module with no usable export', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, 'empty.config.ts');
    await writeFile(configPath, 'export default null;');

    await expect(loadConfig(configPath)).rejects.toThrow(/No valid config export found/);
  });
});
