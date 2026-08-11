/**
 * @fileoverview 实体定义生成器
 * 负责生成实体的 TypeScript 类型定义（.d.ts 文件）
 *
 * @module rxdb-client-generator/generators/entity-definition
 */

import { EntityMetadata, RelationKind } from '@aiao/rxdb';
import { unionBy } from '@aiao/utils';
import { REPOSITORY_TYPE_REPOSITORY, RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { validateGeneratedClassMembers } from '../core/generated-symbols.js';
import type {
  MethodDeclarationStructure,
  OptionalKind,
  PropertyDeclarationStructure,
  SourceFile
} from '../core/ts-morph-browser.js';
import { generateEntityProperties, isGeneratedComputedProperty } from './entity-properties.js';
import { generateEntityRelations } from './entity-relations.js';
import { getIdType } from './utils.js';

const getMethodSignature = (method: OptionalKind<MethodDeclarationStructure>): string =>
  JSON.stringify([
    method.name,
    method.isStatic === true,
    method.typeParameters ?? [],
    (method.parameters ?? []).map(parameter => [
      parameter.name,
      parameter.type,
      parameter.hasQuestionToken === true,
      parameter.initializer,
      parameter.isRestParameter === true
    ]),
    method.returnType,
    method.hasQuestionToken === true,
    method.scope,
    method.isAsync === true
  ]);

/**
 * 生成一个实体的类型文件
 */
export const generateEntityDefinition = (
  generator: RxDBClientGenerator,
  metadata: EntityMetadata,
  file: SourceFile
) => {
  // 从 rxdb 到入的依赖
  const rxdbNamedImports = new Set<string>();
  const namedImportsByModule = new Map<string, Set<string>>();
  // 关系递归中引用到的对端实体类型名（split 模式下需从 ./<对端>.js 导入）
  const siblingNamedImports = new Map<string, Set<string>>();
  // 元数据。
  const { name: className } = metadata;

  // 类。
  const extendClassImport = metadata.extends[0] || '';
  const extendClassName =
    extendClassImport === 'EntityBase' && getIdType(metadata) === 'bigint' ? 'EntityBase<bigint>' : extendClassImport;
  const implementNames = [];
  if (extendClassName.includes('TreeAdjacencyListEntityBase')) {
    implementNames.push('ITreeEntity');
  } else if (extendClassName.includes('EntityBase')) {
    implementNames.push('IEntity');
  }
  if (extendClassImport) rxdbNamedImports.add(extendClassImport);
  const classDecl = file.addClass({
    name: className,
    isExported: true,
    extends: extendClassName,
    implements: implementNames.sort(),
    decorators: [],
    hasDeclareKeyword: true
  });
  // 类文档。
  classDecl.addJsDoc(metadata.displayName);

  // 属性
  const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];
  const classMethods: OptionalKind<MethodDeclarationStructure>[] = [];
  const memberSources = new WeakMap<object, string>();

  const markGeneratedMembers = (propertyStart: number, methodStart: number, generatorName: string): void => {
    classProperties
      .slice(propertyStart)
      .forEach(property =>
        memberSources.set(
          property,
          `Repository generator "${generatorName}" ${property.isStatic ? 'static' : 'instance'} property "${property.name}"`
        )
      );
    classMethods
      .slice(methodStart)
      .forEach(method =>
        memberSources.set(
          method,
          `Repository generator "${generatorName}" ${method.isStatic ? 'static' : 'instance'} method "${method.name}"`
        )
      );
  };

  generator.getSourceGetters(metadata).forEach(getter => {
    const property = {
      name: getter.name,
      type: getter.returnType,
      isReadonly: true,
      docs: getter.docs
    };
    classProperties.push(property);
    memberSources.set(property, `source getter "${metadata.name}.${getter.name}"`);
  });

  // 实体的静态类型
  const staticTypesProperty = {
    type: `${className}StaticTypes`,
    name: '[ENTITY_STATIC_TYPES]',
    isStatic: true
  };
  classProperties.push(staticTypesProperty);
  memberSources.set(staticTypesProperty, `entity "${className}" static types member`);

  rxdbNamedImports.add('ENTITY_STATIC_TYPES');

  // 构造函数接口
  const staticTypesInterface = file.addInterface({
    name: `${className}StaticTypes`,
    docs: ['静态类型'],
    isExported: true
  });

  // 基本属性
  const entityPropertyStart = classProperties.length;
  const initDataInterface = generateEntityProperties({
    classProperties,
    file,
    metadata,
    rxdbNamedImports
  });
  const generatedProperties = [
    ...metadata.properties.map(property => `entity property "${metadata.name}.${property.name}"`),
    ...Array.from(metadata.computedPropertyMap.values())
      .filter(property => isGeneratedComputedProperty(metadata, property))
      .map(property => `computed property "${metadata.name}.${property.name}"`)
  ];
  classProperties
    .slice(entityPropertyStart)
    .forEach((property, index) =>
      memberSources.set(property, generatedProperties[index] ?? `entity property "${metadata.name}.${property.name}"`)
    );

  // 关系属性
  const relationPropertyStart = classProperties.length;
  generateEntityRelations({
    classProperties,
    metadata,
    rxdbNamedImports,
    generator,
    initDataInterface
  });
  const relationSources = Array.from(metadata.relationMap.values()).flatMap(relation => {
    const source = `relation "${metadata.name}.${relation.name}" derived member`;
    return relation.kind === RelationKind.ONE_TO_ONE || relation.kind === RelationKind.MANY_TO_ONE ?
        [source, source]
      : [source];
  });
  classProperties
    .slice(relationPropertyStart)
    .forEach((property, index) =>
      memberSources.set(property, relationSources[index] ?? `relation derived member "${property.name}"`)
    );

  /**
   * Repository 生成（插件化机制）
   * 1. 如果有扩展 Repository（TreeRepository, GraphRepository），调用对应生成器
   * 2. 扩展生成器不负责基类方法，所以需要先生成基类属性和方法
   */
  const repoType = metadata.repository || REPOSITORY_TYPE_REPOSITORY;
  const repoGenerator = generator.getRepositoryGenerator(repoType);
  // 拿不到生成器就必须炸：静默跳过会产出没有任何查询方法、也没有 XxxRuleGroup 的半成品类，
  // 而别的实体只要关联到它就会引用这个从未声明的 RuleGroup（TS2304）。
  if (!repoGenerator) {
    throw new Error(`No repository generator registered for "${repoType}" (entity ${className})`);
  }

  // 如果是扩展 Repository（非基类），先生成基类属性和方法
  if (repoType !== REPOSITORY_TYPE_REPOSITORY) {
    const baseGenerator = generator.getRepositoryGenerator(REPOSITORY_TYPE_REPOSITORY);
    if (baseGenerator) {
      const propertyStart = classProperties.length;
      const methodStart = classMethods.length;
      baseGenerator.generate({
        metadata,
        classProperties,
        classMethods,
        rxdbNamedImports,
        namedImportsByModule,
        siblingNamedImports,
        generator,
        file,
        staticTypesInterface
      });
      markGeneratedMembers(propertyStart, methodStart, baseGenerator.name);
    }
  }

  // 生成当前 Repository 的属性和方法
  const propertyStart = classProperties.length;
  const methodStart = classMethods.length;
  repoGenerator.generate({
    metadata,
    classProperties,
    classMethods,
    rxdbNamedImports,
    namedImportsByModule,
    siblingNamedImports,
    generator,
    file,
    staticTypesInterface
  });
  markGeneratedMembers(propertyStart, methodStart, repoGenerator.name);

  validateGeneratedClassMembers(className, classProperties, classMethods, memberSources);

  // 添加所有属性
  classDecl.addProperties(
    classProperties.sort((a, b) => {
      if (a.isStatic && !b.isStatic) return -1;
      if (!a.isStatic && b.isStatic) return 1;
      if (a.isReadonly && !b.isReadonly) return -1;
      if (!a.isReadonly && b.isReadonly) return 1;
      return a.name.localeCompare(b.name);
    })
  );

  // 构造函数
  classDecl.addConstructor({
    parameters: [
      {
        name: 'initData',
        type: `${className}InitData`,
        hasQuestionToken: true
      }
    ],
    docs: ['初始化数据', '@param initData 初始化数据']
  });

  const unionClassMethods: OptionalKind<MethodDeclarationStructure>[] = unionBy(classMethods, getMethodSignature).sort(
    (a, b) => {
      if (a.isStatic && !b.isStatic) return -1;
      if (!a.isStatic && b.isStatic) return 1;
      return a.name.localeCompare(b.name);
    }
  );
  // 所有方法
  classDecl.addMethods(unionClassMethods);

  return {
    rxdbNamedImports,
    namedImportsByModule,
    siblingNamedImports
  };
};
