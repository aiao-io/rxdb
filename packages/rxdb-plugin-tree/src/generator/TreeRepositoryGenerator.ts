/**
 * @fileoverview 树形结构 Repository 生成器
 * 继承基础 Repository 方法生成器，为树形结构实体生成特有的查询方法
 *
 * @module rxdb-plugin-tree/generator
 */

import { ENTITY_BASE_METADATA_OPTIONS, type EntityMetadata, type EntityMetadataOptions } from '@aiao/rxdb';
import {
  buildRules,
  generateEntityRules,
  type GeneratorContext,
  type RepositoryGeneratorSymbols,
  RepositoryMethodsGenerator
} from '@aiao/rxdb-client-generator';
import { TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS } from '../constants.js';

/**
 * 树形结构 Repository 方法生成器
 * 继承 Repository 基类方法，新增 TreeRepository 特有的查询方法
 */
export class TreeRepositoryGenerator extends RepositoryMethodsGenerator {
  override readonly name = 'TreeRepository';

  /**
   * 树实体的基类与配套类型都在 `@aiao/rxdb-plugin-tree`（US-025 阶段 E 起核心不再内置树）。
   *
   * @remarks
   * 这个值同时决定三处产物：`.js` 里 `TreeAdjacencyListEntityBase` 的 import 来源、
   * `.d.ts` 里 `ITreeEntity` 的 import 来源、以及基类签名带出的 `FindTreeOptions`。
   */
  override readonly entityBaseModuleSpecifier = '@aiao/rxdb-plugin-tree';

  /**
   * `TreeAdjacencyListEntityBase` 的装饰器实参是常量标识符，CLI 静态求值取不到它的值。
   *
   * @remarks
   * 生成器随身带上这份元数据，CLI 才能在分析 `extends TreeAdjacencyListEntityBase` 的实体时
   * 把它回填；否则生成器包得反向依赖本插件才拿得到（RV-015）。顺序为「自身 → 祖先」。
   *
   * `TreeEntityBase` 是 `@TreeEntity` 装饰器给手写实体用的别名，共用同一份声明。
   */
  override readonly abstractEntityMetadata: ReadonlyMap<string, EntityMetadataOptions[]> = new Map([
    ['TreeAdjacencyListEntityBase', [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]],
    ['TreeEntityBase', [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]]
  ]);

  /**
   * @inheritDoc
   *
   * @remarks
   * 不合并父类结果：`generateMethods` 没有调用 `super`，基类那一份符号由
   * `entity-definition` 单独跑的基类生成轮次自报。
   */
  override declareSymbols(metadata: EntityMetadata): RepositoryGeneratorSymbols {
    return {
      // `ITreeEntity` 只由邻接表基类带出：`TreeEntityBase` 的实体走默认的 `IEntity`
      entityInterfaces: metadata.extends[0]?.includes('TreeAdjacencyListEntityBase') ? ['ITreeEntity'] : [],
      types: [{ name: `${metadata.name}TreeRule` }, { exported: true, name: `${metadata.name}TreeRuleGroup` }]
    };
  }

  protected override generateMethods(context: GeneratorContext): void {
    // Tree 特有方法（基类方法已在 generator_entity_definition.ts 中单独生成）
    const { metadata, rxdbNamedImports, siblingNamedImports, generator, file, staticTypesInterface } = context;
    const { name: className } = metadata;

    // TreeRuleGroup 规则。
    const entityRules = generateEntityRules(generator, metadata).filter(
      d => d.key.startsWith('children.') && d.key !== 'children.id'
    );
    if (entityRules.length === 0) {
      throw new Error(`${className} TreeRepository requires children query rules`);
    }
    const rules = buildRules(entityRules, rxdbNamedImports, siblingNamedImports);
    const names = entityRules.map(r => `'${r.key}'`).join(' | ');

    file.addTypeAlias({
      name: `${className}TreeRule`,
      type: Array.from(new Set(rules)).join('\n| '),
      hasDeclareKeyword: true,
      docs: ['TreeRule']
    });
    file.addTypeAlias({
      name: `${className}TreeRuleGroup`,
      type: `RuleGroupBase<typeof ${className}, ${names}, ${className}TreeRule>`,
      hasDeclareKeyword: true,
      docs: ['TreeRuleGroup'],
      isExported: true
    });

    // 添加 entity 属性到静态类型（Tree 特有）
    staticTypesInterface.addProperty({
      name: 'entity',
      type: `${className}`,
      docs: ['查询的实体']
    });

    const treeOptions = `FindTreeOptions<typeof ${className},${className}TreeRuleGroup>`;

    this.addStaticMethod(context, {
      method: 'findDescendants',
      options: treeOptions,
      returnType: `${className}[]`,
      metHodDoc: '查询子孙实体（包含自身）',
      example: `// 查询某节点的所有后代\n${className}.findDescendants({ entityId: root.id }).subscribe(list => console.log(list));\n\n// 仅查询直接子节点（level 1）\n${className}.findDescendants({ entityId: root.id, level: 1 }).subscribe(children => console.log(children));`,
      baseSignature: {
        entityBase: 'TreeAdjacencyListEntityBase',
        options: 'FindTreeOptions<new () => T>',
        returnType: 'T[]'
      }
    });

    this.addStaticMethod(context, {
      method: 'countDescendants',
      options: treeOptions,
      returnType: `number`,
      metHodDoc: '统计子孙实体数量（不包含自身）',
      example: `// 统计某节点下的后代数量\n${className}.countDescendants({ entityId: root.id }).subscribe(count => console.log(count));`,
      baseSignature: {
        entityBase: 'TreeAdjacencyListEntityBase',
        options: 'FindTreeOptions<new () => T>',
        returnType: 'number'
      }
    });

    this.addStaticMethod(context, {
      method: 'findAncestors',
      options: treeOptions,
      returnType: `${className}[]`,
      metHodDoc: '查询祖先实体（包含自身）',
      example: `// 查询某节点的所有祖先（面包屑导航）\n${className}.findAncestors({ entityId: grand.id }).subscribe(ancestors => console.log(ancestors));\n\n// 仅查询直接父节点（level 1）\n${className}.findAncestors({ entityId: grand.id, level: 1 }).subscribe(parents => console.log(parents));`,
      baseSignature: {
        entityBase: 'TreeAdjacencyListEntityBase',
        options: 'FindTreeOptions<new () => T>',
        returnType: 'T[]'
      }
    });

    this.addStaticMethod(context, {
      method: 'countAncestors',
      options: treeOptions,
      returnType: `number`,
      metHodDoc: '统计祖先实体数量（不包含自身）',
      example: `// 统计某节点的祖先层级深度\n${className}.countAncestors({ entityId: grand.id }).subscribe(depth => console.log(depth));`,
      baseSignature: {
        entityBase: 'TreeAdjacencyListEntityBase',
        options: 'FindTreeOptions<new () => T>',
        returnType: 'number'
      }
    });
  }
}
