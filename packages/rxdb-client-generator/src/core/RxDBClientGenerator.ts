/**
 * @fileoverview RxDB Client 生成器核心实现
 * 负责实体元数据的管理、代码生成流程控制、Repository 生成器注册
 *
 * @module rxdb-client-generator/core
 */
import {
  ENTITY_BASE_METADATA_OPTIONS,
  EntityMetadata,
  EntityMetadataOptions,
  EntityRelationManyToManyMetadata,
  EntityType,
  getEntityMetadata,
  RelationKind,
  transitionMetadata,
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS
} from '@aiao/rxdb';
import { isFunction } from '@aiao/utils';
import { generateEntityDefinition } from '../generators/entity-definition.js';
import type { IRepositoryGenerator } from '../generators/RepositoryGenerator.interface.js';
import { RepositoryMethodsGenerator } from '../generators/RepositoryGeneratorBase.js';
import { TreeRepositoryGenerator } from '../generators/TreeRepositoryGenerator.js';
import { validateGeneratedOutputSymbols } from './generated-symbols.js';
import {
  assertGeneratedBindingIdentifier,
  assertGeneratedIdentifier,
  assertGeneratedNamespace,
  isGeneratedIdentifier,
  transitionMetadata as transitionMetadataUtil
} from './RxDBClientGenerator.utils.js';
import type { AddedInterface, SourceFile } from './ts-morph-browser.js';
import { Project, VariableDeclarationKind } from './ts-morph-browser.js';

/** 生成代码使用的默认 namespace。未提供 namespace 的实体归入此空间。 */
export const NAMESPACE_PUBLIC = 'public' as const;
/** 内置普通 Repository 生成器的注册名称。 */
export const REPOSITORY_TYPE_REPOSITORY = 'Repository' as const;
/** 内置树 Repository 生成器的注册名称。 */
export const REPOSITORY_TYPE_TREE_REPOSITORY = 'TreeRepository' as const;
/** 图 Repository 生成器的注册名称，供插件扩展使用。 */
export const REPOSITORY_TYPE_GRAPH_REPOSITORY = 'GraphRepository' as const;
const ENTITY_BASE_NAME = 'EntityBase' as const;
const TREE_ADJACENCY_LIST_BASE_NAME = 'TreeAdjacencyListEntityBase' as const;
const TREE_ENTITY_BASE_NAME = 'TreeEntityBase' as const;

/** RxDB 客户端生成器的代码形态与查询类型配置。 */
export interface RxDBClientGeneratorOptions {
  /**
   * 关系查询深度
   * 最小为 1
   * @default 3
   * @example 1 允许查询自己的基本属性 + 自己的关系的基本属性
   * @example 2 允许查询自己的基本属性 + 自己的关系的基本属性 + 自己关系的关系的基本属性
   */
  relationQueryDeep?: number;
  /**
   * 是否按 entity 名字拆分到独立文件，index 文件集合导出所有 entity
   * @default false
   */
  splitFiles?: boolean;
}

/** 从实体源码保留到生成运行时与声明文件的只读 getter。 */
export interface EntitySourceGetter {
  /** 生成到实体上的 getter 名称。 */
  readonly name: string;
  /** getter 的 TypeScript 返回类型文本。 */
  readonly returnType: string;
  /** getter 运行时实现的 JavaScript 表达式文本。 */
  readonly runtime: string;
  /** 追加到 getter 声明上的 TSDoc 行。 */
  readonly docs: string[];
}

/**
 * metadataMap 的键
 *
 * 不能用 `${namespace}_${name}` 拼接：`_` 在 namespace 与实体名里**都合法**
 * （NAMESPACE_PATTERN / IDENTIFIER_PATTERN 都放行），拼接因此不是单射 ——
 * `(ns=a_B, name=C)` 与 `(ns=a, name=B_C)` 得到同一个键，后写覆盖先写，
 * 关系解析随后解析到错误的实体且不报错（RCG-001）。
 * JSON 元组把两段分隔开，输入无法伪造出别人的键。
 */
const get_cache_key = (mappedEntity: string, mappedNamespace?: string) =>
  JSON.stringify([mappedNamespace || NAMESPACE_PUBLIC, mappedEntity]);

const RESERVED_ENTITY_BINDINGS = new Set(['ENTITIES', 'Entity', 'PropertyType', 'RelationKind', '__decorateClass']);

const addNamedImport = (imports: Map<string, Set<string>>, moduleSpecifier: string, name: string): void => {
  const names = imports.get(moduleSpecifier) ?? new Set<string>();
  names.add(name);
  imports.set(moduleSpecifier, names);
};

const renderRuntimeImports = (imports: Map<string, Set<string>>): string =>
  Array.from(imports.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleSpecifier, names]) => `import { ${Array.from(names).sort().join(', ')} } from '${moduleSpecifier}';`)
    .join('\n');

const mergeNamedImports = (target: Map<string, Set<string>>, source: Map<string, Set<string>>): void => {
  source.forEach((names, moduleSpecifier) => {
    names.forEach(name => addNamedImport(target, moduleSpecifier, name));
  });
};

const addTypeImports = (file: SourceFile, imports: Map<string, Set<string>>): void => {
  Array.from(imports.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([moduleSpecifier, names]) => {
      file.addImportDeclaration({
        namedImports: Array.from(names).sort(),
        isTypeOnly: true,
        moduleSpecifier
      });
    });
};

const validatePropertyIdentifiers = (metadata: EntityMetadata): void => {
  const properties = [...metadata.properties, ...(metadata.computedProperties ?? [])];
  properties.forEach(property => {
    assertGeneratedIdentifier(property.name, `${metadata.name} property`);
    if ('properties' in property) {
      property.properties.forEach(nestedProperty => {
        assertGeneratedIdentifier(nestedProperty.name, `${metadata.name}.${property.name} property`);
      });
    }
  });
};

const validateRelationIdentifiers = (metadata: EntityMetadata): void => {
  metadata.relations?.forEach(relation => {
    assertGeneratedIdentifier(relation.name, `${metadata.name} relation`);
    assertGeneratedBindingIdentifier(relation.mappedEntity, `${metadata.name}.${relation.name} mapped entity`);
    assertGeneratedIdentifier(relation.mappedProperty, `${metadata.name}.${relation.name} mapped property`);
    assertGeneratedNamespace(
      relation.mappedNamespace || NAMESPACE_PUBLIC,
      `${metadata.name}.${relation.name} mapped namespace`
    );
  });
};

const assertGeneratedEntityBindings = (metadata: EntityMetadata): void => {
  assertGeneratedBindingIdentifier(metadata.name, 'entity name');
  if (RESERVED_ENTITY_BINDINGS.has(metadata.name)) {
    throw new Error(`Invalid entity name binding: ${JSON.stringify(metadata.name)}`);
  }

  assertGeneratedNamespace(metadata.namespace || NAMESPACE_PUBLIC);
  metadata.extends.forEach(extendName => assertGeneratedBindingIdentifier(extendName, `${metadata.name} extends`));
  validatePropertyIdentifiers(metadata);
  validateRelationIdentifiers(metadata);
};

const validateSourceGetters = (metadata: EntityMetadata, sourceGetters: readonly EntitySourceGetter[]): void => {
  const generatedMemberNames = new Set<string>([
    ...metadata.properties.map(property => property.name),
    ...(metadata.computedProperties ?? []).map(property => property.name),
    ...(metadata.relations ?? []).map(relation => relation.name)
  ]);

  sourceGetters.forEach(getter => {
    if (generatedMemberNames.has(getter.name)) {
      throw new Error(`Source getter ${metadata.name}.${getter.name} collides with a generated entity member`);
    }
  });
};

const validateMetadataSet = (metadataSet: ReadonlySet<EntityMetadata>, splitFiles: boolean): void => {
  const namespacesByName = new Map<string, string>();

  metadataSet.forEach(metadata => {
    assertGeneratedEntityBindings(metadata);
    // split 模式下实体文件名直接取实体名，与固定的 barrel index.js/index.d.ts 撞名。
    // 大小写不敏感的文件系统（macOS/Windows）上 Index.js 同样会覆盖 index.js。
    if (splitFiles && metadata.name.toLowerCase() === 'index') {
      throw new Error(`Entity name ${JSON.stringify(metadata.name)} collides with the generated barrel index file`);
    }
    const namespace = metadata.namespace || NAMESPACE_PUBLIC;
    const existingNamespace = namespacesByName.get(metadata.name);
    if (existingNamespace) {
      throw new Error(`Duplicate entity name ${metadata.name} in namespaces ${existingNamespace} and ${namespace}`);
    }
    namespacesByName.set(metadata.name, namespace);
  });
};

const addRxDBEntityProperties = (rxDBInterface: AddedInterface, metadataSet: ReadonlySet<EntityMetadata>): void => {
  const groups = new Map<string, EntityMetadata[]>();

  metadataSet.forEach(metadata => {
    const namespace = metadata.namespace || NAMESPACE_PUBLIC;
    const key = namespace === NAMESPACE_PUBLIC ? `${namespace}:${metadata.name}` : namespace;
    const group = groups.get(key);
    if (group) {
      group.push(metadata);
    } else {
      groups.set(key, [metadata]);
    }
  });

  groups.forEach(group => {
    const first = group[0]!;
    const namespace = first.namespace || NAMESPACE_PUBLIC;
    if (namespace === NAMESPACE_PUBLIC) {
      rxDBInterface.addProperty({
        name: first.name,
        type: `typeof ${first.name}`,
        docs: [first.displayName]
      });
      return;
    }

    rxDBInterface.addProperty({
      name: isGeneratedIdentifier(namespace) ? namespace : JSON.stringify(namespace),
      type: `{\n${group.map(metadata => `${metadata.name}: typeof ${metadata.name};`).join('\n')}\n}`,
      docs: [first.displayName]
    });
  });
};

/**
 * RxDB Client 生成器
 */
export class RxDBClientGenerator {
  /**
   * Repository 生成器注册表
   * 用于支持可扩展的 Repository 类型
   */
  private repositoryGenerators = new Map<string, IRepositoryGenerator>();
  private readonly sourceGetters = new Map<EntityMetadata, readonly EntitySourceGetter[]>();
  private pendingProject?: Project;

  entityMetadataOptionsMap = new Map<string, EntityMetadataOptions[]>([
    [ENTITY_BASE_NAME, [ENTITY_BASE_METADATA_OPTIONS]],
    [TREE_ADJACENCY_LIST_BASE_NAME, [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]],
    [TREE_ENTITY_BASE_NAME, [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]]
  ]);
  metadataOptionsSet: Set<EntityMetadataOptions> = new Set();
  metadataSet: Set<EntityMetadata> = new Set();
  metadataMap: Map<string, EntityMetadata> = new Map();
  project!: Project;

  config: Required<RxDBClientGeneratorOptions> = {
    relationQueryDeep: 3,
    splitFiles: false
  };

  constructor(options?: RxDBClientGeneratorOptions) {
    // 逐字段判定而非 Object.assign：后者会把显式 undefined 一起抄进来抹掉默认值，
    // relationQueryDeep 变 undefined 后 `patch.length >= undefined` 恒为 false，深度限制失效。
    if (options?.relationQueryDeep !== undefined) {
      if (!Number.isInteger(options.relationQueryDeep) || options.relationQueryDeep < 1) {
        throw new Error(`relationQueryDeep must be an integer >= 1, got ${String(options.relationQueryDeep)}`);
      }
      this.config.relationQueryDeep = options.relationQueryDeep;
    }
    if (options?.splitFiles !== undefined) {
      if (typeof options.splitFiles !== 'boolean') {
        throw new Error(`splitFiles must be a boolean, got ${String(options.splitFiles)}`);
      }
      this.config.splitFiles = options.splitFiles;
    }

    // 注册内置 Repository 生成器
    this.registerRepositoryGenerator(new RepositoryMethodsGenerator());
    this.registerRepositoryGenerator(new TreeRepositoryGenerator());
  }

  /**
   * 添加实体配置或带元数据的实体类。
   *
   * 实体名在本次生成器实例中必须唯一；重复实体或无法生成合法绑定标识符的输入会立即抛错。
   *
   * @param value 实体元数据配置或由 `@Entity` 装饰的实体类
   * @param options 继承的抽象元数据配置；省略时按 `extends` 的第一个父类型自动查找
   * @param sourceGetters 需要追加到生成实体上的 getter 定义
   * @throws {Error} 实体名、属性、关系或 getter 与生成成员冲突时抛出
   */
  addEntity(
    value: EntityMetadataOptions | EntityType,
    options?: EntityMetadataOptions[],
    sourceGetters: readonly EntitySourceGetter[] = []
  ) {
    let meta: EntityMetadata;
    if (isFunction(value)) {
      meta = getEntityMetadata(value);
    } else {
      const meta_options = value as EntityMetadataOptions;
      meta_options.extends?.forEach(extendName =>
        assertGeneratedBindingIdentifier(extendName, `${meta_options.name} extends`)
      );
      options =
        options || (meta_options.extends?.length && this.entityMetadataOptionsMap.get(meta_options.extends[0])) || [];
      meta = transitionMetadata(meta_options, options);
    }

    assertGeneratedEntityBindings(meta);
    validateSourceGetters(meta, sourceGetters);
    const duplicate = Array.from(this.metadataSet).find(metadata => metadata.name === meta.name && metadata !== meta);
    if (duplicate) {
      throw new Error(
        `Duplicate entity name ${meta.name} in namespaces ${duplicate.namespace || NAMESPACE_PUBLIC} and ${meta.namespace || NAMESPACE_PUBLIC}`
      );
    }

    this.metadataSet.add(meta);
    this.setMetadata(meta);
    this.sourceGetters.set(meta, sourceGetters);
  }

  /**
   * 读取实体附加的 getter 定义。
   *
   * @param metadata 已登记的实体元数据
   * @returns 登记过的 getter 快照；没有附加 getter 时返回空数组
   */
  getSourceGetters(metadata: EntityMetadata): readonly EntitySourceGetter[] {
    return this.sourceGetters.get(metadata) ?? [];
  }

  /**
   * 按 `(namespace, name)` 登记 metadata
   *
   * 键一律由 {@link get_cache_key} 构造。此前写入侧是手写拼接、读取侧走
   * `get_cache_key`，两边连 namespace 的兜底都不一致（写入侧 `undefined` 会
   * 变成字面量 `"undefined_Name"`）—— 任何调用方都不应再自行拼接（RCG-001）。
   */
  setMetadata(metadata: EntityMetadata): void {
    this.metadataMap.set(get_cache_key(metadata.name, metadata.namespace), metadata);
  }

  /**
   * 按实体名称和 namespace 查找已登记的元数据。
   *
   * @param mappedEntity 实体绑定名称
   * @param mappedNamespace namespace；省略时使用 {@link NAMESPACE_PUBLIC}
   * @returns 对应元数据；不存在时返回 `undefined`
   */
  getMetadata(mappedEntity: string, mappedNamespace?: string): EntityMetadata | undefined {
    return this.metadataMap.get(get_cache_key(mappedEntity, mappedNamespace));
  }

  /**
   * 登记可被后续实体继承的抽象元数据。
   *
   * @param abstractEntityName 抽象实体绑定名称
   * @param metadataOptions 抽象实体的元数据选项，按父类顺序应用
   */
  registerAbstractMetadata(abstractEntityName: string, metadataOptions: EntityMetadataOptions[]): void {
    this.entityMetadataOptionsMap.set(abstractEntityName, metadataOptions);
    metadataOptions.forEach(value => {
      this.setMetadata(transitionMetadata(value));
    });
  }

  /**
   * 注册 Repository 生成器
   * 用于扩展支持自定义 Repository 类型
   *
   * @param generator Repository 生成器实例
   * @example
   * ```typescript
   * const generator = new RxDBClientGenerator();
   * generator.registerRepositoryGenerator(new GeoRepositoryGenerator());
   * ```
   */
  registerRepositoryGenerator(generator: IRepositoryGenerator): void {
    this.repositoryGenerators.set(generator.name, generator);
  }

  /**
   * 获取 Repository 生成器
   * @param name Repository 名称
   * @returns 对应的生成器，如果不存在则返回 undefined
   */
  getRepositoryGenerator(name: string): IRepositoryGenerator | undefined {
    return this.repositoryGenerators.get(name);
  }

  /**
   * 执行生成器并在内存中创建生成文件。
   *
   * 调用完成后通过 {@link getSourceFiles} 读取文件文本；本类不会直接写入用户磁盘。
   * 同一实例执行失败时不会替换上一次成功的 `project`。
   *
   * @throws {Error} 元数据或生成符号校验失败时抛出
   */
  exec(): void {
    validateMetadataSet(this.metadataSet, this.config.splitFiles);
    validateGeneratedOutputSymbols(this);
    const project = new Project();
    this.pendingProject = project;
    try {
      this.generateAllEntityDefinition();
      this.generateEntityJsFile();
      this.project = project;
    } finally {
      this.pendingProject = undefined;
    }
  }

  /**
   * 获取最近一次成功执行生成器创建的文件。
   *
   * @returns 生成文件集合，包含 `index` barrel 和实体实现/声明文件
   * @throws {Error} 尚未调用 {@link exec} 时抛出
   */
  getSourceFiles(): SourceFile[] {
    return this.project.getSourceFiles();
  }

  /**
   * 生成实体的 js 文件
   * 公开此方法以便测试使用
   */
  generateEntityJsFile() {
    const { metadataSet } = this;

    // 校验 many-to-many 关系映射
    const identityOf = (namespace: string | undefined, entity: string, property: string) =>
      `${namespace || NAMESPACE_PUBLIC}.${entity}.${property}`;

    /**
     * 找出 relation 在对端的反向关系
     *
     * 谓词必须包含「对端指回本端」：只比 kind/name/mappedProperty 的话，
     * A.bs→B.as、B.as→C.bs、C.bs→B.as 这种三实体错连会**整体通过**——
     * B.as 的 name 与 mappedProperty 都对得上，它实际指向 C 却从不被检查（RCG-007）。
     */
    const findMappedRelation = (metadata: EntityMetadata, relation: EntityRelationManyToManyMetadata) => {
      const mappedMetadata = this.getMetadata(relation.mappedEntity, relation.mappedNamespace);
      if (!mappedMetadata?.relations) {
        return undefined;
      }
      const namespace = metadata.namespace || NAMESPACE_PUBLIC;
      return mappedMetadata.relations.find(
        d =>
          d.kind === RelationKind.MANY_TO_MANY &&
          d.name === relation.mappedProperty &&
          d.mappedProperty === relation.name &&
          d.mappedEntity === metadata.name &&
          (d.mappedNamespace || NAMESPACE_PUBLIC) === namespace
      );
    };

    metadataSet.forEach(metadata => {
      metadata.relations?.forEach(relation => {
        if (relation.kind === RelationKind.MANY_TO_MANY) {
          const manyToMany = relation as EntityRelationManyToManyMetadata;
          const mappedRelation = findMappedRelation(metadata, manyToMany);
          if (!mappedRelation) {
            // 两端 identity 都要报出来：只报本端的话，使用者不知道该去查哪一端
            throw new Error(
              `mapped relation not found for ${identityOf(metadata.namespace, metadata.name, relation.name)} <-> ` +
                `${identityOf(manyToMany.mappedNamespace, manyToMany.mappedEntity, manyToMany.mappedProperty)}`
            );
          }
        }
      });
    });

    if (this.config.splitFiles) {
      this.generateEntityJsFilesSplit();
    } else {
      this.generateEntityJsFileSingle();
    }
  }

  private getOutputProject(): Project {
    const project = this.pendingProject ?? this.project;
    if (!project) throw new Error('Generator output project is not initialized');
    return project;
  }

  private generateEntityJsFileSingle() {
    const { metadataSet } = this;
    const project = this.getOutputProject();
    let fileStr = '';
    const namedImportsByModule = new Map<string, Set<string>>([['@aiao/rxdb', new Set(['Entity', '__decorateClass'])]]);

    metadataSet.forEach(metadata => {
      const extendName = metadata.extends[0];
      const { name: className } = metadata;
      const decoratorArguments = transitionMetadataUtil(metadata);
      if (extendName) {
        const moduleSpecifier =
          this.getRepositoryGenerator(metadata.repository)?.entityBaseModuleSpecifier ?? '@aiao/rxdb';
        addNamedImport(namedImportsByModule, moduleSpecifier, extendName);
      }
      if (metadata.properties.length || metadata.computedProperties?.length) {
        addNamedImport(namedImportsByModule, '@aiao/rxdb', 'PropertyType');
      }
      if (metadata.relations?.length) addNamedImport(namedImportsByModule, '@aiao/rxdb', 'RelationKind');
      const sourceGetters = this.getSourceGetters(metadata).map(getter => getter.runtime);
      const classBody = sourceGetters.length ? `{\n${sourceGetters.join('\n')}\n}` : '{}';
      fileStr += `\nlet ${className} = class ${extendName ? 'extends ' + extendName : ''} ${classBody};`;
      fileStr += `\n${className} = __decorateClass(
[
  Entity(${decoratorArguments})
],
${className}
);`;
    });
    fileStr = renderRuntimeImports(namedImportsByModule) + fileStr;

    const names = Array.from(metadataSet.values())
      .map(d => d.name)
      .sort()
      .join(', ');
    fileStr += `\nconst ENTITIES = [ ${names} ];`;
    fileStr += `\nexport { ENTITIES, ${names} };`;

    project.createSourceFile('index.js', fileStr);
  }

  private generateEntityJsFilesSplit() {
    const { metadataSet } = this;
    const project = this.getOutputProject();
    const names: string[] = [];

    metadataSet.forEach(metadata => {
      const extendName = metadata.extends[0];
      const { name: className } = metadata;
      const decoratorArguments = transitionMetadataUtil(metadata);
      const namedImportsByModule = new Map<string, Set<string>>([
        ['@aiao/rxdb', new Set(['Entity', '__decorateClass'])]
      ]);

      if (extendName) {
        const moduleSpecifier =
          this.getRepositoryGenerator(metadata.repository)?.entityBaseModuleSpecifier ?? '@aiao/rxdb';
        addNamedImport(namedImportsByModule, moduleSpecifier, extendName);
      }
      if (metadata.properties.length || metadata.computedProperties?.length) {
        addNamedImport(namedImportsByModule, '@aiao/rxdb', 'PropertyType');
      }
      if (metadata.relations?.length) addNamedImport(namedImportsByModule, '@aiao/rxdb', 'RelationKind');

      let entityStr = renderRuntimeImports(namedImportsByModule);
      const sourceGetters = this.getSourceGetters(metadata).map(getter => getter.runtime);
      const classBody = sourceGetters.length ? `{\n${sourceGetters.join('\n')}\n}` : '{}';
      entityStr += `\nlet ${className} = class ${extendName ? 'extends ' + extendName : ''} ${classBody};`;
      entityStr += `\n${className} = __decorateClass(
[
  Entity(${decoratorArguments})
],
${className}
);`;
      entityStr += `\nexport { ${className} };`;

      project.createSourceFile(`${className}.js`, entityStr);
      names.push(className);
    });

    names.sort();

    let indexStr = names.map(name => `import { ${name} } from './${name}.js';`).join('\n');
    indexStr += `\nconst ENTITIES = [ ${names.join(', ')} ];`;
    indexStr += `\nexport { ENTITIES, ${names.join(', ')} };`;

    project.createSourceFile('index.js', indexStr);
  }

  /**
   * 生成所有 entity 的定义到 index.d.ts 文件里
   * @private
   */
  private generateAllEntityDefinition() {
    if (this.config.splitFiles) {
      this.generateEntityDefinitionFilesSplit();
    } else {
      this.generateEntityDefinitionFileSingle();
    }
  }

  private generateEntityDefinitionFileSingle() {
    const { metadataSet } = this;
    const project = this.getOutputProject();
    const indexDefinitionFile = project.createSourceFile('index.d.ts');

    // namespace（命名空间）
    const rxDBModule = indexDefinitionFile.addModule({
      name: '"@aiao/rxdb"',
      hasDeclareKeyword: true,
      docs: ['rxdb']
    });

    // interface（接口）
    const rxDBInterface = rxDBModule.addInterface({
      name: 'RxDB',
      docs: ['RxDB']
    });

    // imports（导入）
    const imports = new Set<string>(['EntityType', 'IEntity', 'ITreeEntity', 'RuleGroupBase', 'UUID']);
    const namedImportsByModule = new Map<string, Set<string>>();

    // 生成所有 entity
    metadataSet.forEach(metadata => {
      const { rxdbNamedImports, namedImportsByModule: entityNamedImports } = generateEntityDefinition(
        this,
        metadata,
        indexDefinitionFile
      );
      rxdbNamedImports.forEach((namedImport: string) => imports.add(namedImport));
      mergeNamedImports(namedImportsByModule, entityNamedImports);
    });

    addRxDBEntityProperties(rxDBInterface, metadataSet);

    // RxDB 导入
    indexDefinitionFile.addImportDeclaration({
      namedImports: Array.from(imports).sort(),
      isTypeOnly: true,
      moduleSpecifier: '@aiao/rxdb'
    });
    addTypeImports(indexDefinitionFile, namedImportsByModule);
    // rxjs imports（rxjs 导入）
    indexDefinitionFile.addImportDeclaration({
      namedImports: ['Observable'],
      isTypeOnly: true,
      moduleSpecifier: 'rxjs'
    });
    // ENTITIES 常量
    indexDefinitionFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      hasDeclareKeyword: true,
      isExported: true,
      declarations: [{ name: 'ENTITIES', type: `EntityType[]` }]
    });
  }

  private addSiblingTypeImports(
    entityFile: SourceFile,
    metadata: EntityMetadata,
    siblingNamedImports: Map<string, Set<string>>
  ): void {
    const importsByEntity = new Map<string, Set<string>>();

    metadata.relationMap.forEach(relation => {
      const sibling = Array.from(this.metadataSet).find(
        candidate => candidate.name === relation.mappedEntity && candidate.namespace === relation.mappedNamespace
      );
      if (!sibling || sibling === metadata) return;

      const namedImports = importsByEntity.get(sibling.name) ?? new Set<string>();
      namedImports.add(sibling.name);
      namedImports.add(`${sibling.name}RuleGroup`);
      // 关系递归里引用到的对端精确类型（如 PostMetaKeyValue）同样定义在对端文件
      siblingNamedImports.get(sibling.name)?.forEach(name => namedImports.add(name));
      importsByEntity.set(sibling.name, namedImports);
    });

    importsByEntity.forEach((namedImports, entityName) => {
      entityFile.addImportDeclaration({
        namedImports: Array.from(namedImports).sort(),
        isTypeOnly: true,
        moduleSpecifier: `./${entityName}.js`
      });
    });
  }

  private generateEntityDefinitionFilesSplit() {
    const { metadataSet } = this;
    const project = this.getOutputProject();
    const indexDefinitionFile = project.createSourceFile('index.d.ts');

    // module augmentation（模块扩展）
    const rxDBModule = indexDefinitionFile.addModule({
      name: '"@aiao/rxdb"',
      hasDeclareKeyword: true,
      docs: ['rxdb']
    });
    const rxDBInterface = rxDBModule.addInterface({
      name: 'RxDB',
      docs: ['RxDB']
    });

    const names: string[] = [];

    metadataSet.forEach(metadata => {
      const { name: className } = metadata;
      names.push(className);

      // 生成独立 entity 定义文件
      const entityFile = project.createSourceFile(`${className}.d.ts`);
      const entityImports = new Set<string>(['EntityType', 'IEntity', 'ITreeEntity', 'RuleGroupBase', 'UUID']);

      const { rxdbNamedImports, namedImportsByModule, siblingNamedImports } = generateEntityDefinition(
        this,
        metadata,
        entityFile
      );
      rxdbNamedImports.forEach((namedImport: string) => entityImports.add(namedImport));

      entityFile.addImportDeclaration({
        namedImports: Array.from(entityImports).sort(),
        isTypeOnly: true,
        moduleSpecifier: '@aiao/rxdb'
      });
      addTypeImports(entityFile, namedImportsByModule);
      entityFile.addImportDeclaration({
        namedImports: ['Observable'],
        isTypeOnly: true,
        moduleSpecifier: 'rxjs'
      });

      this.addSiblingTypeImports(entityFile, metadata, siblingNamedImports);
    });

    addRxDBEntityProperties(rxDBInterface, metadataSet);
    names.sort();

    // index.d.ts: 从各 entity 文件导入类型（供 module augmentation 的 typeof 使用）
    names.forEach(name => {
      indexDefinitionFile.addImportDeclaration({
        namedImports: [name],
        isTypeOnly: true,
        moduleSpecifier: `./${name}.js`
      });
    });

    // index.d.ts: 从各 entity 文件 re-export
    names.forEach(name => {
      indexDefinitionFile.addExportDeclaration({
        moduleSpecifier: `./${name}.js`
      });
    });

    // rxdb imports（rxdb 导入）
    indexDefinitionFile.addImportDeclaration({
      namedImports: ['EntityType'],
      isTypeOnly: true,
      moduleSpecifier: '@aiao/rxdb'
    });

    // ENTITIES 常量
    indexDefinitionFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      hasDeclareKeyword: true,
      isExported: true,
      declarations: [{ name: 'ENTITIES', type: `EntityType[]` }]
    });
  }
}
