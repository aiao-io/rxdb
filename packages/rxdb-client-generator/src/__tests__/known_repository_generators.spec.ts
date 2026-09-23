import { describe, expect, it } from 'vitest';
import {
  describeMissingGeneratorForPackage,
  describeMissingGeneratorForRepository
} from '../core/known-repository-generators.js';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';

describe('known repository generator hints', () => {
  it('names the config entry for a known plugin package', () => {
    expect(describeMissingGeneratorForPackage('@aiao/rxdb-plugin-tree')).toContain(
      '@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator'
    );
    expect(describeMissingGeneratorForPackage('@aiao/rxdb-plugin-graph')).toContain(
      '@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'
    );
  });

  it('stays silent for packages it does not know', () => {
    expect(describeMissingGeneratorForPackage('@acme/rxdb-plugin-geo')).toBe('');
    expect(describeMissingGeneratorForRepository('GeoRepository')).toBe('');
  });

  it('points a missing TreeRepository generator at the plugin subpath', () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      extends: ['TreeAdjacencyListEntityBase'],
      name: 'Folder',
      namespace: 'public',
      properties: [],
      repository: 'TreeRepository'
    });

    expect(() => generator.exec()).toThrow(/@aiao\/rxdb-plugin-tree\/generator#TreeRepositoryGenerator/);
  });
});
