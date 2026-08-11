/**
 * @fileoverview 基础 Repository 方法生成器
 * 提供通用的 Repository 属性和方法生成逻辑，子类可扩展自定义方法
 *
 * @module rxdb-client-generator/generators/repository-generator-base
 */

import { PropertyType } from '@aiao/rxdb';
import { capitalizeFirst } from '@aiao/utils';
import { generateEntityRules, RuleTypeData } from './entity-rules.js';
import type { GeneratorContext, IRepositoryGenerator } from './RepositoryGenerator.interface.js';
import { getIdType, type IdType } from './utils.js';
/** 匹配 `Partial<XxxKeyValue>` 里的接口名——关系递归下这个接口归对端实体所有。 */
const KEY_VALUE_INTERFACE_PATTERN = /^Partial<(\w+KeyValue)>$/;

export const buildRules = (
  entityRules: RuleTypeData[],
  rxdbNamedImports: Set<string>,
  siblingNamedImports?: Map<string, Set<string>>
) => {
  return entityRules.map(({ rule, entity, key, valueType, subRuleGroup }) => {
    rxdbNamedImports.add(rule);

    // 处理 EXISTS 规则 (带 subRuleGroup)
    if (subRuleGroup) {
      return `${rule}<'${key}', ${subRuleGroup}>`;
    }

    // 处理普通规则
    if (valueType) {
      if (key.includes('.')) {
        rxdbNamedImports.add(`Relation${rule}`);
        // key 带 '.' 表示这条规则来自关系递归，valueType 里的精确 keyValue 接口定义在对端实体文件里
        const keyValueInterface = KEY_VALUE_INTERFACE_PATTERN.exec(valueType)?.[1];
        if (keyValueInterface && siblingNamedImports) {
          const names = siblingNamedImports.get(entity) ?? new Set<string>();
          names.add(keyValueInterface);
          siblingNamedImports.set(entity, names);
        }
        return `Relation${rule}<'${key}', ${valueType}>`;
      } else {
        return `${rule}<${entity}, '${key}', ${valueType}>`;
      }
    } else {
      if (key.includes('.')) {
        rxdbNamedImports.add(`Relation${rule}`);
        return `Relation${rule}<'${key}'>`;
      } else {
        return `${rule}<${entity}, '${key}'>`;
      }
    }
  });
};

/**
 * 基础 Repository 生成器（抽象基类）
 * 提供通用工具方法，子类继承后生成各自的 Repository 属性和方法
 */
export abstract class RepositoryGeneratorBase implements IRepositoryGenerator {
  abstract readonly name: string;

  generate(context: GeneratorContext): void {
    this.generateProperties(context);
    this.generateMethods(context);
  }

  /**
   * 生成器钩子：生成特定的 Repository 属性
   * 子类可选择性覆盖此方法，生成特定的计算属性、索引等
   *
   * @example
   * ```typescript
   * // Tree Generator 可能需要生成树级别缓存属性
   * protected generateProperties(context: GeneratorContext): void {
   *   context.classProperties.push({
   *     name: 'maxDepth',
   *     type: 'number',
   *     isReadonly: true
   *   });
   * }
   * ```
   */
  protected generateProperties(context: GeneratorContext): void {
    void context;
  }

  /**
   * 子类实现：生成具体的 Repository 方法
   */
  protected abstract generateMethods(context: GeneratorContext): void;

  /**
   * 共享工具：添加静态查询方法
   */
  protected addStaticMethod(
    context: GeneratorContext,
    config: {
      method: string;
      options: string;
      returnType: string;
      metHodDoc?: string;
      example?: string;
      optionsIsRequired?: boolean;
      resultWrapper?: 'Observable' | 'Promise';
      registerOptions?: boolean;
      baseSignature?: {
        entityBase: string;
        options: string;
        parameterName?: string;
        returnType: string;
      };
    }
  ): void {
    const { classMethods, staticTypesInterface, rxdbNamedImports } = context;

    const docs = [config.metHodDoc || `${config.method} 查询`, '@param options 查询选项'];
    if (config.example) {
      docs.push('@example', config.example);
    }

    classMethods.push({
      name: config.method,
      returnType: `${config.resultWrapper ?? 'Observable'}<${config.returnType}>`,
      docs,
      parameters: [
        {
          name: 'options',
          type: config.options,
          hasQuestionToken: !config.optionsIsRequired
        }
      ],
      isStatic: true
    });

    if (config.baseSignature) {
      const { entityBase, options, parameterName = 'options', returnType } = config.baseSignature;
      const entityBaseConstraint = getIdType(context.metadata) === 'bigint' ? `${entityBase}<bigint>` : entityBase;
      rxdbNamedImports.add(entityBase);
      classMethods.push({
        name: config.method,
        returnType: `Observable<${returnType}>`,
        parameters: [
          { name: 'this', type: 'new () => T' },
          { name: parameterName, type: options }
        ],
        typeParameters: [`T extends ${entityBaseConstraint}`],
        isStatic: true
      });
    }

    if (config.registerOptions !== false) {
      staticTypesInterface.addProperty({
        name: `${config.method.replace(/\$$/, '')}Options`,
        type: config.options,
        docs: ['查询选项']
      });
    }

    // 自动提取需要导入的类型（如 FindOneOptions, CountOptions 等）
    // 注意：这里提取的是泛型参数中使用的标准 Options 类型，不是生成的 XxxOptions 属性
    const needImport = config.options.match(/\b([A-Z]\w+Options)\b/g);
    if (needImport) {
      needImport.forEach(imp => {
        // 只添加标准的 RxDB Options 类型（以大写字母开头且不包含实体名）
        // 例如：FindOneOptions, CountOptions 等，但不包括 PersonFindOneOptions
        if (!/^[a-z]/.test(imp) && imp.match(/^(Find|Count|Get)/)) {
          rxdbNamedImports.add(imp);
        }
      });
    }
  }

  /**
   * 共享工具：添加实例方法
   */
  protected addInstanceMethod(
    context: GeneratorContext,
    config: {
      name: string;
      returnType: string;
      docs: string[];
    }
  ): void {
    context.classMethods.push({
      name: config.name,
      returnType: config.returnType,
      docs: config.docs
    });
  }

  /**
   * 共享工具：添加实例函数属性
   */
  protected addInstanceProperty(
    context: GeneratorContext,
    config: {
      name: string;
      type: string;
      docs: string[];
    }
  ): void {
    context.classProperties.push({
      name: config.name,
      type: config.type,
      docs: config.docs
    });
  }

  /**
   * 共享工具:获取 ID 类型
   */
  protected getIdType(metadata: GeneratorContext['metadata']): IdType {
    return getIdType(metadata);
  }
}

/**
 * Repository 生成器
 * 为所有 Entity 生成通用的 CRUD 属性和方法：get, find, findOne, save, remove 等
 */
export class RepositoryMethodsGenerator extends RepositoryGeneratorBase {
  readonly name: string = 'Repository';

  protected generateMethods(context: GeneratorContext): void {
    const { metadata, file, rxdbNamedImports, siblingNamedImports, staticTypesInterface } = context;
    const { name: className } = metadata;
    const idType = getIdType(metadata);

    // 添加 idType 到静态类型接口
    staticTypesInterface.addProperty({
      name: 'idType',
      type: idType,
      docs: ['id 类型']
    });

    // RuleGroup（规则组）
    const entityRules = generateEntityRules(context.generator, metadata);
    const rules = buildRules(entityRules, rxdbNamedImports, siblingNamedImports);

    // 按多行管道格式生成，保证快照稳定且无行尾空格
    // 空联合必须落成 `never`：直接 join 出空串会渲染成 `type X = ;`（TS1110），
    // 而无属性实体（README 的入门写法 `@Entity({ properties: [] })`）正好命中这条路径。
    const names = entityRules.length > 0 ? '\n  |' + entityRules.map(r => `'${r.key}'`).join('\n  |') : 'never';
    const ruleUnion = Array.from(new Set(rules));
    file.addTypeAlias({
      name: `${className}Rule`,
      type: ruleUnion.length > 0 ? ruleUnion.join('\n| ') : 'never',
      hasDeclareKeyword: true,
      docs: ['rule']
    });
    file.addTypeAlias({
      name: `${className}RuleGroup`,
      // 关键：逗号后不加空格，直接换行，避免行尾空格
      type: `RuleGroupBase<typeof ${className},${names},\n${className}Rule>`,
      hasDeclareKeyword: true,
      docs: ['RuleGroupBase'],
      isExported: true
    });

    const orderByTypeName = `${className}OrderByField`;
    const selfProperties = Array.from(metadata.propertyMap.values())
      .filter(property => property.type !== PropertyType.binary)
      .map(property => property.name);
    file.addTypeAlias({
      name: orderByTypeName,
      type: selfProperties.length > 0 ? selfProperties.map(d => `"${d}"`).join(' | ') : 'never',
      hasDeclareKeyword: true,
      docs: ['OrderByField']
    });

    // 静态查询方法
    const getOptions = (method: string) => ({
      method,
      options: `${capitalizeFirst(method)}Options<typeof ${className},${className}RuleGroup,${orderByTypeName}>`
    });

    this.addStaticMethod(context, {
      method: 'get',
      options: `${idType}`,
      returnType: className,
      metHodDoc: '根据 ID 获取单个实体',
      example: `${className}.get('123').subscribe(entity => console.log(entity));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: idType === 'bigint' ? "T['id']" : 'UUID',
        parameterName: 'id',
        returnType: 'T'
      }
    });

    this.addStaticMethod(context, {
      ...getOptions('findOneOrFail'),
      returnType: className,
      metHodDoc: '查询单个实体,未找到时抛出错误',
      example: `${className}.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: 'FindOneOrFailOptions<new () => T>',
        returnType: 'T'
      }
    });

    this.addStaticMethod(context, {
      ...getOptions('find'),
      returnType: `${className}[]`,
      metHodDoc: '查询多个实体',
      example: `${className}.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: 'FindOptions<new () => T>',
        returnType: 'T[]'
      }
    });

    this.addStaticMethod(context, {
      ...getOptions('findOne'),
      returnType: `${className} | null`,
      metHodDoc: '查询单个实体,未找到时返回 null',
      example: `${className}.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: 'FindOneOptions<new () => T>',
        returnType: 'T | null'
      }
    });

    this.addStaticMethod(context, {
      ...getOptions('findAll'),
      returnType: `${className}[]`,
      metHodDoc: '查询所有实体',
      example: `${className}.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: 'FindAllOptions<new () => T>',
        returnType: 'T[]'
      }
    });

    this.addStaticMethod(context, {
      ...getOptions('findByCursor'),
      returnType: `${className}[]`,
      metHodDoc: '游标分页查询',
      example: `${className}.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: 'FindByCursorOptions<new () => T>',
        returnType: 'T[]'
      }
    });

    this.addStaticMethod(context, {
      method: 'count',
      options: `${capitalizeFirst('count')}Options<typeof ${className},${className}RuleGroup>`,
      returnType: 'number',
      metHodDoc: '统计实体数量',
      example: `${className}.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));`,
      optionsIsRequired: true,
      baseSignature: {
        entityBase: 'EntityBase',
        options: 'CountOptions<new () => T>',
        returnType: 'number'
      }
    });

    // 实例函数属性
    this.addInstanceProperty(context, {
      name: 'save',
      type: '() => Promise<this>',
      docs: ['保存']
    });

    this.addInstanceProperty(context, {
      name: 'remove',
      type: '() => Promise<this>',
      docs: ['删除']
    });

    this.addInstanceProperty(context, {
      name: 'reset',
      type: '() => void',
      docs: ['重置数据']
    });
  }
}
