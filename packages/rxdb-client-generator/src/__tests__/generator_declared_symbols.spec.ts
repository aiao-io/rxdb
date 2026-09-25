import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { GEO_ENTITY_BASE, GEO_REPOSITORY, GeoRepositoryGenerator } from './helpers/fixture-repository-generator.js';

const createGenerator = (entityName: string): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.registerRepositoryGenerator(new GeoRepositoryGenerator());
  generator.addEntity({
    extends: [GEO_ENTITY_BASE],
    name: entityName as Capitalize<string>,
    namespace: 'public',
    properties: [],
    repository: GEO_REPOSITORY
  });
  return generator;
};

const getDeclarationText = (generator: RxDBClientGenerator): string =>
  generator
    .getSourceFiles()
    .find(file => file.getFilePath().endsWith('.d.ts'))!
    .getText();

describe('repository generator declared symbols', () => {
  it('reserves plugin declared types in the pre-flight collision table', () => {
    const generator = createGenerator('Place');
    generator.addEntity({
      extends: ['EntityBase'],
      name: 'PlaceGeoRuleGroup' as Capitalize<string>,
      namespace: 'public',
      properties: [],
      repository: 'Repository'
    });

    expect(() => generator.exec()).toThrow(/Generated symbol collision .*PlaceGeoRuleGroup/s);
  });

  it('reserves plugin declared entity interfaces as declaration imports', () => {
    const generator = createGenerator('IGeoEntity');

    expect(() => generator.exec()).toThrow(/Generated symbol collision .*IGeoEntity/s);
  });

  it('implements plugin declared entity interfaces on the generated class', () => {
    const generator = createGenerator('Place');
    generator.exec();

    const text = getDeclarationText(generator);
    expect(text).toContain('implements IGeoEntity');
    expect(text).toMatch(/import type \{[^}]*IGeoEntity[^}]*\} from '@fixture\/geo'/);
  });
});
