/**
 * @fileoverview 树形结构 Repository 生成器
 * 继承基础 Repository 方法生成器，为树形结构实体生成特有的查询方法
 *
 * @module rxdb-client-generator/generators/tree-repository
 */

import { capitalizeFirst } from '@aiao/utils';
import { generateEntityRules } from './entity-rules.js';
import type { GeneratorContext } from './RepositoryGenerator.interface.js';
import { buildRules, RepositoryMethodsGenerator } from './RepositoryGeneratorBase.js';

/**
 * 树形结构 Repository 方法生成器
 * 继承 Repository 基类方法，新增 TreeRepository 特有的查询方法
 */
export class TreeRepositoryGenerator extends RepositoryMethodsGenerator {
  override readonly name = 'TreeRepository';

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

    rxdbNamedImports.add(capitalizeFirst(`FindTreeOptions`));

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
