import { type EntityMetadataOptions, PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator, type SourceFile } from '@aiao/rxdb-client-generator';
import { TreeRepositoryGenerator } from '@aiao/rxdb-plugin-tree/generator';

export interface GeneratorSourceState {
  sources: SourceFile[];
  error: Error | null;
}

/** 生成器页的内置示例：普通 Repository 与树形 TreeRepository 各一个。 */
export const GENERATOR_DEMOS: readonly EntityMetadataOptions[] = [
  {
    name: 'Todo',
    displayName: 'Todo',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'completed', type: PropertyType.boolean, default: false }
    ]
  },
  {
    name: 'Menu',
    displayName: 'Menu',
    repository: 'TreeRepository',
    extends: ['TreeAdjacencyListEntityBase', 'EntityBase'],
    properties: [
      {
        name: 'title',
        type: PropertyType.string
      }
    ]
  }
];

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function generateSourceState(json: string): GeneratorSourceState {
  if (!json) return { sources: [], error: null };

  try {
    const generator = new RxDBClientGenerator();
    // 树的代码生成由插件包提供，生成器包只内置普通 Repository（RV-015）；Menu 示例离不开它
    generator.registerRepositoryGenerator(new TreeRepositoryGenerator());
    generator.addEntity(JSON.parse(json));
    generator.exec();
    return { sources: generator.getSourceFiles(), error: null };
  } catch (error: unknown) {
    return { sources: [], error: normalizeError(error) };
  }
}
