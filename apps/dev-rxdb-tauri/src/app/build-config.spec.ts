import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface AssetConfig {
  glob?: string;
  input?: string;
  output?: string;
}

interface ProjectConfig {
  targets: {
    build?: {
      options?: {
        allowedCommonJsDependencies?: string[];
        assets?: Array<string | AssetConfig>;
      };
    };
  };
}

const project = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../project.json'), 'utf8')) as ProjectConfig;
const buildOptions = project.targets.build?.options;

describe('Tauri build configuration', () => {
  it('ships only assets used by the wa-sqlite runtime', () => {
    expect(buildOptions?.assets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: expect.stringContaining('pglite')
        })
      ])
    );
  });

  it('allows only the CommonJS dependency confirmed by the production build', () => {
    expect(buildOptions?.allowedCommonJsDependencies).toEqual(['ms']);
  });
});
