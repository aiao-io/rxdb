import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { globMock } = vi.hoisted(() => ({
  globMock: vi.fn()
}));

vi.mock('glob', () => ({
  glob: globMock
}));

import findFiles from '../../cli/find-files.js';

describe('find-files', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
    globMock.mockReset();
  });

  it('resolves non-glob paths to absolute normalized paths', async () => {
    const files = await findFiles(['./src/cli/find-files.ts']);
    expect(files).toHaveLength(1);
    expect(path.isAbsolute(files[0]!)).toBe(true);
    expect(files[0]!.endsWith(`${path.sep}find-files.ts`)).toBe(true);
    expect(globMock).not.toHaveBeenCalled();
  });

  it('expands glob patterns and deduplicates', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'find-files-'));
    tempDirs.push(tempDir);
    const a = path.join(tempDir, 'a.ts');
    const b = path.join(tempDir, 'b.ts');
    await writeFile(a, 'export const a = 1;');
    await writeFile(b, 'export const b = 1;');

    globMock.mockResolvedValue([a, b]);
    const pattern = path.join(tempDir, '*.ts');
    const files = await findFiles([pattern, pattern]);
    expect(files).toEqual([path.normalize(a), path.normalize(b)]);
    expect(globMock).toHaveBeenCalled();
  });

  it('rethrows when glob processing fails', async () => {
    globMock.mockRejectedValue(new Error('glob boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(findFiles(['*.ts'])).rejects.toThrow('glob boom');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
