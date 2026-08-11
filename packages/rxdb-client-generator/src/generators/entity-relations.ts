/**
 * @fileoverview 实体关系属性生成器
 * 负责为实体类生成关系属性的TypeScript代码
 */
import { EntityMetadata, RelationKind } from '@aiao/rxdb';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import type { AddedInterface, OptionalKind, PropertyDeclarationStructure } from '../core/ts-morph-browser.js';
import { getIdType } from './utils.js';

/**
 * 生成实体的关系属性
 *
 * 根据实体元数据中的关系定义，生成相应的TypeScript属性声明：
 * - 对于一对一和多对一关系：生成关系可观察对象属性和ID属性
 * - 对于一对多和多对多关系：生成关系可观察集合属性
 *
 * 生成的属性会添加到类属性数组中，并将所需的导入添加到导入集合中
 *
 * @param options - 生成选项
 * @param options.metadata - 实体元数据，包含关系定义
 * @param options.classProperties - 类属性数组，生成的属性会添加到这里
 * @param options.rxdbNamedImports - rxdb导入集合，用于收集所需的导入
 */
export const generateEntityRelations = ({
  classProperties,
  metadata,
  rxdbNamedImports,
  generator,
  initDataInterface
}: {
  metadata: EntityMetadata;
  classProperties: OptionalKind<PropertyDeclarationStructure>[];
  rxdbNamedImports: Set<string>;
  generator: RxDBClientGenerator;
  initDataInterface: AddedInterface;
}) => {
  // 遍历实体的所有关系定义，为每种关系类型生成相应的属性
  Array.from(metadata.relationMap.values()).forEach(relation => {
    switch (relation.kind) {
      // 处理一对一和多对一关系
      // 这两种关系需要生成：
      // 1. 关系可观察对象属性（name$）- 用于访问关联实体
      // 2. 外键ID属性（nameId）- 存储关联实体的ID
      case RelationKind.ONE_TO_ONE:
      case RelationKind.MANY_TO_ONE:
        {
          // 根据关系是否可为空，生成不同的类型声明
          const type = `RelationEntityObservable<typeof ${relation.mappedEntity}>`;
          const relationName = relation.displayName || relation.name;

          // 添加关系可观察对象属性
          classProperties.push({
            name: relation.name + '$', // 关系属性名使用$后缀，表示可观察对象
            type: type,
            isReadonly: true, // 关系属性是只读的，通过set/remove方法修改
            docs: [relationName]
          });

          const relationMetadata = generator.getMetadata(relation.mappedEntity, relation.mappedNamespace);
          if (!relationMetadata) {
            throw new Error(`Relation metadata not found for ${relation.name}`);
          }
          const relationIdType = getIdType(relationMetadata);
          // 添加外键ID属性
          classProperties.push({
            name: relation.name + 'Id', // 外键ID属性
            // 当关系 nullable 时，id 既可能不存在（undefined），也可能为 null（根节点），或为有效 id
            // 使用 ?: 与 "| null" 组合表达三种状态
            type: relation.nullable ? `${relationIdType} | null` : relationIdType,
            isReadonly: false,
            hasQuestionToken: relation.nullable,
            docs: [relationName + ' id']
          });

          initDataInterface.addProperty({
            name: relation.name + 'Id',
            type: relation.nullable ? `${relationIdType} | null` : relationIdType,
            hasQuestionToken: true,
            docs: [relationName + ' id']
          });

          // 添加所需的导入
          rxdbNamedImports.add('RelationEntityObservable');
        }
        break;

      // 处理一对多和多对多关系
      // 这两种关系只需要生成关系可观察集合属性（name$）
      // 不需要外键ID属性，因为外键存储在关联实体或中间表中
      case RelationKind.ONE_TO_MANY:
      case RelationKind.MANY_TO_MANY:
        {
          const relationName = relation.displayName || relation.name;
          const type = `RelationEntitiesObservable<typeof ${relation.mappedEntity}>`;

          // 添加关系可观察集合属性
          classProperties.push({
            name: relation.name + '$', // 关系集合属性名使用$后缀
            isReadonly: true, // 关系属性是只读的，通过add/remove方法修改
            type,
            docs: [relationName]
          });

          // 添加所需的导入
          rxdbNamedImports.add('RelationEntitiesObservable');
        }
        break;
      default:
        break;
    }
  });
};
