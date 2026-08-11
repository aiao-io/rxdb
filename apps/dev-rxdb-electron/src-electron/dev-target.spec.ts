import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TargetConfig {
  continuous?: boolean;
  dependsOn?: string[];
  options?: {
    command?: string;
  };
}

interface ProjectConfig {
  targets: Record<string, TargetConfig>;
}

const project = JSON.parse(readFileSync(resolve(import.meta.dirname, '../project.json'), 'utf8')) as ProjectConfig;

describe('Electron development targets', () => {
  it('models renderer and main watchers as continuous dependencies', () => {
    expect(project.targets['serve']?.continuous).toBe(true);
    expect(project.targets['watch-main']?.continuous).toBe(true);
    expect(project.targets['prepare-electron-package']?.dependsOn).toEqual(['serve', 'watch-main']);
    expect(project.targets['dev']?.dependsOn).toEqual(['prepare-electron-package']);
  });

  it('prepares the package directory before Electron waits for build outputs', () => {
    expect(project.targets['prepare-electron-package']?.options?.command).toContain('wait-on tcp:4120');
    expect(project.targets['prepare-electron-package']?.options?.command).toContain('src-electron/main.js');
    expect(project.targets['prepare-electron-package']?.options?.command).toContain('mkdir -p');
    expect(project.targets['dev']?.options?.command).toContain('electron dist/apps/dev-rxdb-electron --serve');
  });
});
