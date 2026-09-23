import { PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { compileGeneratedConsumer, type GeneratedConsumerPluginStub } from '@aiao/rxdb-client-generator/testing';
import { describe, expect, it } from 'vitest';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import { TreeRepositoryGenerator } from '../../generator/TreeRepositoryGenerator.js';

@TreeEntity({
  name: 'Folder',
  properties: [{ name: 'title', type: PropertyType.string }],
  features: { tree: { hasChildren: true, type: 'adjacency-list' } }
})
class Folder extends TreeAdjacencyListEntityBase {}

/** 本包的桩声明：生成器包不认识树基类，`compileGeneratedConsumer` 由调用方喂。 */
const TREE_PLUGIN_STUB: GeneratedConsumerPluginStub = {
  declarations: {
    ITreeEntity: 'export interface ITreeEntity {}',
    TreeAdjacencyListEntityBase: `export declare abstract class TreeAdjacencyListEntityBase extends EntityBase {
  static findDescendants: <T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<T[]>;
  static countDescendants: <T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<number>;
  static findAncestors: <T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<T[]>;
  static countAncestors: <T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<number>;
}`
  },
  moduleSpecifier: '@aiao/rxdb-plugin-tree',
  reexportsFromCore: ['EntityBase']
};

const generateFolder = (): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator({ relationQueryDeep: 10 });
  generator.registerRepositoryGenerator(new TreeRepositoryGenerator());
  generator.addEntity(Folder);
  generator.exec();
  return generator;
};

const textOf = (generator: RxDBClientGenerator, fileName: string): string =>
  generator
    .getSourceFiles()
    .find(file => file.getFilePath() === fileName)
    ?.getText() ?? '';

describe('TreeRepositoryGenerator', () => {
  it('emits tree base class and query methods from the plugin package', () => {
    const generator = generateFolder();
    const javascript = textOf(generator, 'index.js');
    const declaration = textOf(generator, 'index.d.ts');

    // 基类与配套类型都来自插件包，不能落回 `@aiao/rxdb`
    expect(javascript).toContain("import { TreeAdjacencyListEntityBase } from '@aiao/rxdb-plugin-tree';");
    expect(javascript).not.toMatch(/import \{[^}]*TreeAdjacencyListEntityBase[^}]*\} from '@aiao\/rxdb';/);
    expect(declaration).toContain(
      "import type { FindTreeOptions, ITreeEntity, TreeAdjacencyListEntityBase } from '@aiao/rxdb-plugin-tree';"
    );
    expect(declaration).toContain(
      'export declare class Folder extends TreeAdjacencyListEntityBase implements ITreeEntity'
    );

    // 四个树查询的具象签名 + 基类泛型重载
    for (const method of ['findDescendants', 'countDescendants', 'findAncestors', 'countAncestors']) {
      expect(declaration).toContain(`static ${method}(options?: FindTreeOptions<typeof Folder,FolderTreeRuleGroup>)`);
      expect(declaration).toContain(
        `static ${method}<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>)`
      );
    }

    // 自报的两个类型符号
    expect(declaration).toContain('declare type FolderTreeRule =');
    expect(declaration).toContain('export declare type FolderTreeRuleGroup = RuleGroupBase<typeof Folder,');
  });

  it('compiles concrete tree queries against TreeAdjacencyListEntityBase static members', async () => {
    const generator = generateFolder();

    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import { Folder } from './generated/index.js';",
          "import type { Observable } from 'rxjs';",
          'const descendants: Observable<Folder[]> = Folder.findDescendants();',
          'declare class SpecializedFolder extends Folder {}',
          'const specialized: Observable<SpecializedFolder[]> = SpecializedFolder.findDescendants({});',
          'void descendants;',
          'void specialized;'
        ].join('\n'),
        { pluginStubs: [TREE_PLUGIN_STUB] }
      )
    ).resolves.toEqual([]);
  });

  it('resolves the hand-written TreeEntityBase alias to the adjacency-list base', () => {
    const generator = new RxDBClientGenerator();
    generator.registerRepositoryGenerator(new TreeRepositoryGenerator());
    generator.addEntity({
      extends: ['TreeEntityBase', 'EntityBase'],
      name: 'Bookmark',
      namespace: 'public',
      properties: [{ name: 'title', type: PropertyType.string }],
      repository: 'TreeRepository'
    });
    generator.exec();
    const declaration = textOf(generator, 'index.d.ts');

    // `TreeEntityBase` 只是 `@TreeEntity` 给手写实体的别名，
    // `abstractEntityMetadata` 把它解析成同一份邻接表声明，`ITreeEntity` 随之带出。
    expect(declaration).toContain(
      'export declare class Bookmark extends TreeAdjacencyListEntityBase implements ITreeEntity'
    );
    expect(declaration).toContain('export declare type BookmarkTreeRuleGroup =');
  });

  it('rejects a TreeRepository entity without children query rules', () => {
    const generator = new RxDBClientGenerator();
    generator.registerRepositoryGenerator(new TreeRepositoryGenerator());
    generator.addEntity({
      computedProperties: [],
      displayName: 'Orphan tree',
      extends: [],
      indexes: [],
      name: 'OrphanTree',
      namespace: 'public',
      properties: [{ name: 'id', primary: true, type: PropertyType.uuid }],
      relations: [],
      repository: 'TreeRepository'
    });

    expect(() => generator.exec()).toThrow(/TreeRepository.*children/i);
  });
});
