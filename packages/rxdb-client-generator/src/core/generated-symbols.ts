import { PropertyType, RelationKind, type EntityMetadata } from '@aiao/rxdb';
import { isGeneratedComputedProperty } from '../generators/entity-properties.js';
import { RepositoryMethodsGenerator } from '../generators/RepositoryGeneratorBase.js';
import { TreeRepositoryGenerator } from '../generators/TreeRepositoryGenerator.js';
import type { RxDBClientGenerator } from './RxDBClientGenerator.js';
import { getFlatMapInterfaceName } from './RxDBClientGenerator.utils.js';
import type { MethodDeclarationStructure, OptionalKind, PropertyDeclarationStructure } from './ts-morph-browser.js';

const NAMESPACE_PUBLIC = 'public';
const REPOSITORY_TYPE_REPOSITORY = 'Repository';
const REPOSITORY_TYPE_TREE_REPOSITORY = 'TreeRepository';
const FIXED_RXDB_TYPE_IMPORTS = ['EntityType', 'IEntity', 'ITreeEntity', 'RuleGroupBase', 'UUID'];
const FIXED_RXJS_TYPE_IMPORTS = ['Observable'];

interface GeneratedSymbol {
  entity: string;
  kind: string;
  scope: string;
  source: string;
  symbol: string;
}

class GeneratedSymbolTable {
  readonly #symbols = new Map<string, GeneratedSymbol>();

  add(symbol: GeneratedSymbol): void {
    const key = `${symbol.scope}\0${symbol.symbol}`;
    const existing = this.#symbols.get(key);
    if (existing) {
      const collisionKind = symbol.kind === 'split output file' ? 'colliding output file' : symbol.kind;
      throw new Error(
        `Generated symbol collision for entity "${symbol.entity}": ${collisionKind} "${symbol.symbol}" from ` +
          `${existing.source} conflicts with ${symbol.source}`
      );
    }
    this.#symbols.set(key, symbol);
  }
}

const hasKeyValueInterface = (property: EntityMetadata['properties'][number]): boolean =>
  property.type === PropertyType.keyValue && 'properties' in property && property.properties.length > 0;

const hasStandardRepositoryOutput = (generator: RxDBClientGenerator): boolean =>
  generator.getRepositoryGenerator(REPOSITORY_TYPE_REPOSITORY)?.constructor === RepositoryMethodsGenerator;

const hasStandardTreeOutput = (generator: RxDBClientGenerator, metadata: EntityMetadata): boolean =>
  metadata.repository === REPOSITORY_TYPE_TREE_REPOSITORY &&
  generator.getRepositoryGenerator(REPOSITORY_TYPE_TREE_REPOSITORY)?.constructor === TreeRepositoryGenerator;

const addEntityMemberSymbols = (
  table: GeneratedSymbolTable,
  generator: RxDBClientGenerator,
  metadata: EntityMetadata
): void => {
  const scope = `entity:${metadata.name}:instance`;
  const addMember = (symbol: string, source: string): void => {
    table.add({ entity: metadata.name, kind: 'instance member', scope, source, symbol });
  };

  metadata.properties.forEach(property =>
    addMember(property.name, `entity property "${metadata.name}.${property.name}"`)
  );
  Array.from(metadata.computedPropertyMap.values())
    .filter(property => isGeneratedComputedProperty(metadata, property))
    .forEach(property => addMember(property.name, `computed property "${metadata.name}.${property.name}"`));
  generator
    .getSourceGetters(metadata)
    .forEach(getter => addMember(getter.name, `source getter "${metadata.name}.${getter.name}"`));

  metadata.relationMap.forEach(relation => {
    const source = `relation "${metadata.name}.${relation.name}" derived member`;
    addMember(`${relation.name}$`, source);
    if (relation.kind === RelationKind.ONE_TO_ONE || relation.kind === RelationKind.MANY_TO_ONE) {
      addMember(`${relation.name}Id`, source);
    }
  });

  if (!hasStandardRepositoryOutput(generator)) return;
  ['save', 'remove', 'reset'].forEach(symbol =>
    addMember(symbol, `Repository generator "Repository" instance property "${symbol}"`)
  );
};

const addEntityTypeSymbols = (
  table: GeneratedSymbolTable,
  generator: RxDBClientGenerator,
  metadata: EntityMetadata
): void => {
  const scope = generator.config.splitFiles ? `types:${metadata.name}` : 'types:index';
  const exportedScope = generator.config.splitFiles ? 'types:index:exports' : scope;
  const addType = (symbol: string, source: string, exported = false): void => {
    table.add({
      entity: metadata.name,
      kind: 'top-level type',
      scope,
      source,
      symbol
    });
    if (exported && exportedScope !== scope) {
      table.add({ entity: metadata.name, kind: 'top-level type', scope: exportedScope, source, symbol });
    }
  };

  addType(metadata.name, `entity declaration "${metadata.name}"`, true);
  addType(`${metadata.name}InitData`, `entity "${metadata.name}" initialization interface`, true);
  addType(`${metadata.name}StaticTypes`, `entity "${metadata.name}" static types interface`, true);

  if (hasStandardRepositoryOutput(generator)) {
    addType(`${metadata.name}Rule`, `Repository generator "Repository" rule type`);
    addType(`${metadata.name}RuleGroup`, `Repository generator "Repository" rule group type`, true);
    addType(`${metadata.name}OrderByField`, `Repository generator "Repository" order-by type`);
  }
  if (hasStandardTreeOutput(generator, metadata)) {
    addType(`${metadata.name}TreeRule`, `Repository generator "TreeRepository" rule type`);
    addType(`${metadata.name}TreeRuleGroup`, `Repository generator "TreeRepository" rule group type`, true);
  }

  const properties = [
    ...metadata.properties,
    ...Array.from(metadata.computedPropertyMap.values()).filter(property =>
      isGeneratedComputedProperty(metadata, property)
    )
  ];
  properties.forEach(property => {
    if (!hasKeyValueInterface(property)) return;
    addType(
      getFlatMapInterfaceName(property, metadata),
      `keyValue property "${metadata.name}.${property.name}" interface`,
      true
    );
  });
};

const addFixedDeclarationImportSymbols = (table: GeneratedSymbolTable, generator: RxDBClientGenerator): void => {
  const scopes =
    generator.config.splitFiles ?
      Array.from(generator.metadataSet, metadata => `types:${metadata.name}`)
    : ['types:index'];
  scopes.forEach(scope => {
    FIXED_RXDB_TYPE_IMPORTS.forEach(symbol =>
      table.add({
        entity: symbol,
        kind: 'declaration import',
        scope,
        source: `fixed RxDB import "${symbol}"`,
        symbol
      })
    );
    FIXED_RXJS_TYPE_IMPORTS.forEach(symbol =>
      table.add({
        entity: symbol,
        kind: 'declaration import',
        scope,
        source: `fixed RxJS import "${symbol}"`,
        symbol
      })
    );
  });
};

const addRxDBInterfaceSymbols = (table: GeneratedSymbolTable, metadataSet: ReadonlySet<EntityMetadata>): void => {
  const groups = new Map<string, EntityMetadata[]>();
  metadataSet.forEach(metadata => {
    const namespace = metadata.namespace || NAMESPACE_PUBLIC;
    const key = namespace === NAMESPACE_PUBLIC ? `${namespace}:${metadata.name}` : namespace;
    const group = groups.get(key);
    if (group) {
      group.push(metadata);
      return;
    }
    groups.set(key, [metadata]);
  });

  groups.forEach(group => {
    const first = group[0]!;
    const namespace = first.namespace || NAMESPACE_PUBLIC;
    const symbol = namespace === NAMESPACE_PUBLIC ? first.name : namespace;
    const source =
      namespace === NAMESPACE_PUBLIC ?
        `entity "${first.name}" RxDB interface member "${symbol}"`
      : `namespace "${namespace}" RxDB interface member "${symbol}"`;
    table.add({
      entity: first.name,
      kind: 'RxDB interface member',
      scope: 'module:@aiao/rxdb:RxDB',
      source,
      symbol
    });
  });
};

const addSplitFileSymbols = (table: GeneratedSymbolTable, metadataSet: ReadonlySet<EntityMetadata>): void => {
  metadataSet.forEach(metadata => {
    const addFile = (fileName: string, fileKind: string): void => {
      table.add({
        entity: metadata.name,
        kind: 'split output file',
        scope: 'split-files',
        source: `entity "${metadata.name}" split ${fileKind} file`,
        symbol: fileName.toLowerCase()
      });
    };
    addFile(`${metadata.name}.js`, 'JavaScript');
    addFile(`${metadata.name}.d.ts`, 'declaration');
  });
};

/** 在创建输出 Project 前校验能由元数据确定的全部生成符号。 */
export const validateGeneratedOutputSymbols = (generator: RxDBClientGenerator): void => {
  const table = new GeneratedSymbolTable();
  addFixedDeclarationImportSymbols(table, generator);
  generator.metadataSet.forEach(metadata => {
    addEntityMemberSymbols(table, generator, metadata);
    addEntityTypeSymbols(table, generator, metadata);
  });
  addRxDBInterfaceSymbols(table, generator.metadataSet);
  if (generator.config.splitFiles) addSplitFileSymbols(table, generator.metadataSet);
};

type ClassProperty = OptionalKind<PropertyDeclarationStructure>;
type ClassMethod = OptionalKind<MethodDeclarationStructure>;

/** 校验 Repository 插件实际写入的成员；同侧 method/method 视为合法重载。 */
export const validateGeneratedClassMembers = (
  entity: string,
  properties: readonly ClassProperty[],
  methods: readonly ClassMethod[],
  sources: WeakMap<object, string>
): void => {
  const members = new Map<string, { kind: 'method' | 'property'; source: string }>();
  const keyOf = (name: string, isStatic: boolean | undefined): string => `${isStatic ? 'static' : 'instance'}\0${name}`;

  properties.forEach(property => {
    const key = keyOf(property.name, property.isStatic);
    const source = sources.get(property) ?? `generated property "${property.name}"`;
    const existing = members.get(key);
    if (existing) {
      throw new Error(
        `Generated symbol collision for entity "${entity}": ${property.isStatic ? 'static' : 'instance'} member ` +
          `"${property.name}" from ${existing.source} conflicts with ${source}`
      );
    }
    members.set(key, { kind: 'property', source });
  });

  methods.forEach(method => {
    const key = keyOf(method.name, method.isStatic);
    const source = sources.get(method) ?? `generated method "${method.name}"`;
    const existing = members.get(key);
    if (existing?.kind === 'property') {
      throw new Error(
        `Generated symbol collision for entity "${entity}": ${method.isStatic ? 'static' : 'instance'} member ` +
          `"${method.name}" from ${existing.source} conflicts with ${source}`
      );
    }
    members.set(key, { kind: 'method', source: existing?.source ?? source });
  });
};
