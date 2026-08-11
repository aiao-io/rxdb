import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RxDBClientCLIentGeneratorOptions } from './cli.interface.js';

const resolveConfigOutDirKey = (outDir: string): string => {
  const absolute = resolve(outDir);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
};

export const validateUniqueConfigOutDirs = (configs: readonly RxDBClientCLIentGeneratorOptions[]): void => {
  const outDirs = new Map<string, number>();
  configs.forEach((configEntry, index) => {
    const key = resolveConfigOutDirKey(configEntry.outDir);
    const existing = outDirs.get(key);
    if (existing !== undefined) {
      throw new Error(
        'Config entries ' + existing + ' and ' + index + ' resolve to the same outDir: ' + configEntry.outDir
      );
    }
    outDirs.set(key, index);
  });
};
