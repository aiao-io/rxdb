import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

describe('package subpath declarations', () => {
  it.each([
    ['./cli', 'src/cli/cli.ts'],
    ['./vite', 'src/plugins/vite.ts']
  ])('maps %s types to the source-preserving declaration path', async (subpath, sourcePath) => {
    const packageRoot = path.resolve(import.meta.dirname, '../../..');
    const packageJson: unknown = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    if (!isRecord(packageJson) || !isRecord(packageJson.exports)) {
      throw new Error('Invalid package exports');
    }
    const conditionalExport = packageJson.exports[subpath];
    if (!isRecord(conditionalExport)) {
      throw new Error(`Missing package export: ${subpath}`);
    }

    const declarationPath = `./dist/${path
      .relative('src', sourcePath)
      .replaceAll(path.sep, '/')
      .replace(/\.ts$/, '.d.ts')}`;

    expect(conditionalExport.types).toBe(declarationPath);
  });
});
