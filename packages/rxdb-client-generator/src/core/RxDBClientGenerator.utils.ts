/**
 * @fileoverview RxDB Client 生成器工具函数
 * 提供属性类型转换、元数据处理、代码生成辅助函数
 *
 * @module rxdb-client-generator/core/utils
 */

import {
  PropertyType,
  RelationKind,
  type EntityMetadata,
  type EntityPropertyMetadata,
  type KeyValuePropertyMetadata
} from '@aiao/rxdb';
import { isNil, kebabCase, omit } from '@aiao/utils';
import type { OptionalKind, PropertyDeclarationStructure } from './ts-morph-browser.js';

/**
 * 把一个命名导入登记到「模块 → 名字集合」表里。
 *
 * @remarks
 * 生成的代码不再只从 `@aiao/rxdb` 取类型：实体基类与它配套的接口随
 * {@link IRepositoryGenerator.entityBaseModuleSpecifier} 走（树实体在
 * `@aiao/rxdb-plugin-tree`），所以收集导入时必须按模块分桶。
 *
 * @param imports - 模块到命名导入集合的映射，原地修改
 * @param moduleSpecifier - 模块说明符
 * @param name - 命名导入
 */
export const addNamedImport = (imports: Map<string, Set<string>>, moduleSpecifier: string, name: string): void => {
  const names = imports.get(moduleSpecifier) ?? new Set<string>();
  names.add(name);
  imports.set(moduleSpecifier, names);
};

/**
 * 没有声明 {@link IRepositoryGenerator.entityBaseModuleSpecifier} 时，实体基类所在的模块。
 *
 * @remarks
 * 「核心实体的基类在 `@aiao/rxdb`」这件事此前写在四个地方（两处靠把名字塞进
 * `rxdbNamedImports` 隐式表达、两处写成 `?? '@aiao/rxdb'`）。包名要改时四处都得跟，
 * 漏一处产出的就是指向不存在模块的 import。
 */
export const DEFAULT_ENTITY_BASE_MODULE = '@aiao/rxdb';

/**
 * 按实体基类的归属模块登记一个命名导入。
 *
 * @remarks
 * 实体基类与它配套的接口同属一个模块：核心实体在 `@aiao/rxdb`，树实体在
 * `@aiao/rxdb-plugin-tree`。由 Repository 生成器用
 * {@link IRepositoryGenerator.entityBaseModuleSpecifier} 声明，核心生成器不写死包名。
 *
 * 没声明时走 `rxdbNamedImports`（它最终被整桶写成一条 `@aiao/rxdb` import），
 * 而不是在这里拼出 {@link DEFAULT_ENTITY_BASE_MODULE} —— 两条路径产出的 import
 * 语句相同，但前者与其余 rxdb 导入合并成一条，后者会多出一条重复的 import。
 *
 * @param imports - 模块到命名导入集合的映射，原地修改
 * @param rxdbNamedImports - `@aiao/rxdb` 的命名导入集合，原地修改
 * @param entityBaseModuleSpecifier - 实体基类所在模块；未声明即落回 `@aiao/rxdb`
 * @param name - 命名导入
 */
export const addEntityBaseNamedImport = (
  imports: Map<string, Set<string>>,
  rxdbNamedImports: Set<string>,
  entityBaseModuleSpecifier: string | undefined,
  name: string
): void => {
  if (entityBaseModuleSpecifier) {
    addNamedImport(imports, entityBaseModuleSpecifier, name);
    return;
  }
  rxdbNamedImports.add(name);
};

const IDENTIFIER_PATTERN = /^[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*$/u;
const NAMESPACE_PATTERN = /^[\p{L}\p{N}_$][\p{L}\p{N}_$-]*$/u;
const RESERVED_BINDINGS = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield'
]);

export const isGeneratedIdentifier = (value: string): boolean => IDENTIFIER_PATTERN.test(value);

export const assertGeneratedIdentifier = (value: string, label: string): void => {
  if (!isGeneratedIdentifier(value)) {
    throw new Error(`Invalid ${label} identifier: ${JSON.stringify(value)}`);
  }
};

export const assertGeneratedBindingIdentifier = (value: string, label: string): void => {
  assertGeneratedIdentifier(value, label);
  if (RESERVED_BINDINGS.has(value)) {
    throw new Error(`Invalid ${label} binding: ${JSON.stringify(value)}`);
  }
};

export const assertGeneratedNamespace = (value: string, label = 'namespace'): void => {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
};

type PropertyMetadata = EntityPropertyMetadata | KeyValuePropertyMetadata;

export const getPropertyTypeConfig = (property: EntityPropertyMetadata, metadata: EntityMetadata) => {
  const type = getEntityPropertyTsType(property, metadata);
  const hasQuestionToken = property.nullable ? true : false;

  let hasExclamationToken = true;
  if (!hasQuestionToken && Object.hasOwn(property, 'default')) {
    hasExclamationToken = false;
  }

  const result: Partial<OptionalKind<PropertyDeclarationStructure>> & {
    type: string;
    name: string;
  } = {
    type,
    name: property.name,
    hasQuestionToken,
    hasExclamationToken,
    isReadonly: property.readonly
  };

  if (!isNil(property.default)) {
    result.initializer = getEntityPropertyDefaultValue(property);
  }
  return result;
};

export const getFlatMapInterfaceName = (property: EntityPropertyMetadata, metadata: EntityMetadata) =>
  `${metadata.name}${property.name.charAt(0).toUpperCase() + property.name.slice(1)}KeyValue`;

export const getKeyValuePreciseType = (property: EntityPropertyMetadata, metadata: EntityMetadata): string => {
  if (property.type !== PropertyType.keyValue || property.properties.length === 0) {
    return 'KeyValue';
  }
  return getFlatMapInterfaceName(property, metadata);
};

export const getKeyValueInterfaceProperties = (property: EntityPropertyMetadata, metadata: EntityMetadata) => {
  if (property.type !== PropertyType.keyValue || property.properties.length === 0) {
    return [];
  }

  return property.properties.map(prop => ({
    name: prop.name,
    type: getEntityPropertyTsType(prop, metadata),
    hasQuestionToken: prop.nullable || false,
    docs: prop.displayName ? [prop.displayName] : undefined
  }));
};

export const getEntityPropertyTsType = (property: PropertyMetadata, metadata: EntityMetadata): string => {
  const propertyType = property.type as PropertyType;
  let type: string;

  switch (propertyType) {
    case PropertyType.uuid:
      type = 'UUID';
      break;
    case PropertyType.string:
      type = 'string';
      break;
    case PropertyType.enum:
      // `stringArray` 也可选携带 enum，`in` 判定不再蕴含值存在，必须同时检查值
      if (!('enum' in property) || property.enum === undefined) {
        throw new Error('Enum property is missing enum values');
      }
      type = property.enum.length > 0 ? property.enum.map(value => JSON.stringify(value)).join(' | ') : 'string';
      break;
    case PropertyType.number:
    case PropertyType.integer:
      type = 'number';
      break;
    case PropertyType.bigint:
      type = 'bigint';
      break;
    case PropertyType.binary:
      type = 'Uint8Array';
      break;
    case PropertyType.boolean:
      type = 'boolean';
      break;
    case PropertyType.date:
      type = 'Date';
      break;
    case PropertyType.stringArray:
      type = 'string[]';
      break;
    case PropertyType.numberArray:
      type = 'number[]';
      break;
    case PropertyType.keyValue:
      type = getKeyValuePreciseType(property as EntityPropertyMetadata, metadata);
      break;
    case PropertyType.json:
      type = 'Record<string, unknown>';
      break;
    default:
      throw new Error(`Unsupported property type: ${String(propertyType)}`);
  }

  return property.nullable ? `${type} | null` : type;
};

const escapeSingleQuoted = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0');

const getEntityPropertyDefaultValue = (property: EntityPropertyMetadata) => {
  switch (property.type) {
    case PropertyType.string:
    case PropertyType.enum:
      return `'${escapeSingleQuoted(String(property.default))}'`;
    case PropertyType.date:
      return property.default ? 'new Date()' : '';
    default:
      return '';
  }
};

const assertGeneratorPathMetadata = (metadata: EntityMetadata): void => {
  assertGeneratedBindingIdentifier(metadata.name, 'entity name');
  if (metadata.namespace) assertGeneratedNamespace(metadata.namespace);
};

export const getGeneratorEntityConfig = (metadata: EntityMetadata) => {
  assertGeneratorPathMetadata(metadata);
  let entityPath = 'entities/';
  const fileName = kebabCase(metadata.name) + '.ts';
  if (metadata.namespace) entityPath += metadata.namespace + '/';
  entityPath += fileName;
  return {
    entityPath,
    fileName
  };
};

export const getGeneratorEntityDefinitionConfig = (metadata: EntityMetadata) => {
  assertGeneratorPathMetadata(metadata);
  let entityPath = 'entities/';
  const fileName = kebabCase(metadata.name) + '.d.ts';
  if (metadata.namespace) entityPath += metadata.namespace + '/';
  entityPath += fileName;
  return {
    entityPath,
    fileName
  };
};

const propertyTypeMap = new Map<string, string>();
Object.keys(PropertyType).forEach(key => {
  const value = PropertyType[key as keyof typeof PropertyType];
  if (typeof value === 'string') propertyTypeMap.set(value, key);
});

const relationKindMap = new Map<string, string>();
Object.keys(RelationKind).forEach(key => {
  const value = RelationKind[key as keyof typeof RelationKind];
  if (typeof value === 'string') relationKindMap.set(value, key);
});

type RenderContext = 'metadata' | 'plain' | 'property' | 'relation';

/**
 * 序列化作用域。
 *
 * @remarks
 * 失败必须报到「哪个实体的哪个字段」，而值本身不认识自己的归属，所以遍历一路带着这两个名字。
 * `member` 是最近一层 `properties` / `relations` 成员的 `name`（关系上就是关系名，见 G3）；
 * 不在任何成员内时为空串，此时靠 `path` 定位。
 */
interface RenderScope {
  readonly context: RenderContext;
  readonly entityName: string;
  readonly member: string;
  readonly path: string;
}

/**
 * 普通对象判据。
 *
 * @remarks
 * 只认 `Object.prototype` 与 `null` 原型。放宽到「任何 object」会让 `Map` / `Set` / 类实例
 * 走 `Object.entries` 塌成 `{}`——那正是本次重写要消灭的静默改写。
 */
const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

const getChildContext = (context: RenderContext, key: string): RenderContext => {
  if (context === 'metadata' && (key === 'properties' || key === 'computedProperties')) return 'property';
  if (context === 'metadata' && key === 'relations') return 'relation';
  if (context === 'property' && key === 'properties') return 'property';
  return 'plain';
};

const renderToken = (context: RenderContext, key: string, value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  if (context === 'property' && key === 'type') {
    const enumKey = propertyTypeMap.get(value);
    if (enumKey) return `PropertyType.${enumKey}`;
  }

  if (context === 'relation' && key === 'kind') {
    const enumKey = relationKindMap.get(value);
    if (enumKey) return `RelationKind.${enumKey}`;
  }

  return undefined;
};

/**
 * 渲染对象字面量的键。
 *
 * @remarks
 * `__proto__` 必须走计算属性：`{ __proto__: v }` 与 `{ "__proto__": v }` 在对象字面量里都是
 * **原型设置语法**，生成出来的代码会改掉对象原型并丢掉这个自有键；只有 `{ ["__proto__"]: v }`
 * 才定义成普通属性。`options` / `keyValueSchema` 的键是业务字符串，元数据里出现它并不违法。
 */
const renderKey = (key: string): string => {
  if (key === '__proto__') return `['${key}']`;
  return isGeneratedIdentifier(key) ? key : JSON.stringify(key);
};

/** 失败标识：`default` 是函数工厂，生成期无法还原。 */
const UNSUPPORTED_DEFAULT_FACTORY = 'unsupportedDefaultFactory';
/** 失败标识：值无法确定性地还原成生成代码里的字面量。 */
const UNSUPPORTED_DEFAULT_VALUE = 'unsupportedDefaultValue';

const describeScope = (scope: RenderScope): string =>
  scope.member ?
    `entity "${scope.entityName}" field "${scope.member}" (at ${scope.path})`
  : `entity "${scope.entityName}" (at ${scope.path})`;

const unsupportedDefaultValue = (scope: RenderScope, reason: string): Error =>
  new Error(
    `${UNSUPPORTED_DEFAULT_VALUE}: ${describeScope(scope)} holds ${reason}. ` +
      'Only JSON-safe constants, bigint, Uint8Array and valid Date values can be generated.'
  );

const unsupportedDefaultFactory = (scope: RenderScope): Error =>
  new Error(
    `${UNSUPPORTED_DEFAULT_FACTORY}: ${describeScope(scope)} holds a function. ` +
      "Replace it with a constant, 'CURRENT_TIMESTAMP', or assign the value when creating the record."
  );

/**
 * 描述非普通对象的类型名。
 *
 * @remarks
 * 只取构造函数名。**不得**改用 `String(value)`：对函数它会把整段源码塞进错误信息，
 * 与 G2「禁止用 `Function#toString()` 猜测源码」同源。
 */
const describeNonPlainObject = (value: object): string => {
  const name = (Object.getPrototypeOf(value) as { constructor?: { name?: unknown } } | null)?.constructor?.name;
  return typeof name === 'string' && name ? `a ${name} instance` : 'a non-plain object';
};

/**
 * 把元数据值渲染成生成代码里的字面量。
 *
 * @param value - 待渲染的值
 * @param indentSize - 当前缩进宽度
 * @param scope - 实体名 / 成员名 / 键路径，仅用于失败定位
 * @param ancestors - 祖先链，用于检测循环引用；同层重复引用不算环，因此进出成对增删
 * @throws {Error} 值为函数（`unsupportedDefaultFactory`）或无法确定性还原（`unsupportedDefaultValue`）
 */
const renderMetadataValue = (
  value: unknown,
  indentSize: number,
  scope: RenderScope,
  ancestors: Set<object>
): string => {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      // JSON 往返把 NaN / Infinity 静默写成 null，是本次重写要消灭的改写之一
      if (!Number.isFinite(value)) throw unsupportedDefaultValue(scope, `the non-finite number ${String(value)}`);
      return JSON.stringify(value);
    case 'bigint':
      return `${value.toString()}n`;
    case 'function':
      throw unsupportedDefaultFactory(scope);
    case 'symbol':
    case 'undefined':
      throw unsupportedDefaultValue(scope, `a ${typeof value} value`);
  }

  // instanceof 分派必须排在 isPlainRecord 之前：两者都会被「object」判据吞掉（G4.1）
  if (value instanceof Uint8Array) {
    // Buffer 等子类同样命中 instanceof，但渲染出来的是 `new Uint8Array([...])`——
    // 生成代码里的类型与实体声明的不再是同一个，偏差要到运行期调子类独有方法时才炸。
    // 不改渲染成 `Buffer.from([...])`：那会把 Node 专有的全局塞进可能跑在浏览器的生成代码里
    if (Object.getPrototypeOf(value) !== Uint8Array.prototype) {
      throw unsupportedDefaultValue(scope, `${describeNonPlainObject(value)} (a Uint8Array subclass)`);
    }
    return `new Uint8Array([${Array.from(value).join(', ')}])`;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw unsupportedDefaultValue(scope, 'an invalid Date');
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }

  if (ancestors.has(value)) throw unsupportedDefaultValue(scope, 'a circular reference');

  const indent = ' '.repeat(indentSize + 2);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    ancestors.add(value);
    const values = value.map((item, index) => {
      const itemScope: RenderScope = { ...scope, path: `${scope.path}[${index}]` };
      return `${indent}${renderMetadataValue(item, indentSize + 2, itemScope, ancestors)}`;
    });
    ancestors.delete(value);
    return `[\n${values.join(',\n')}\n${' '.repeat(indentSize)}]`;
  }

  if (!isPlainRecord(value)) throw unsupportedDefaultValue(scope, describeNonPlainObject(value));

  // 显式 undefined 的键按 JSON 往返时代的语义跳过：`{ default: undefined }` 与「没有 default」
  // 在元数据消费侧（`property.default !== undefined`）等价，丢弃它不损失语义
  const entries = Object.entries(value).filter(([, childValue]) => childValue !== undefined);
  if (entries.length === 0) return '{}';

  const { context } = scope;
  const member =
    (context === 'property' || context === 'relation') && typeof value['name'] === 'string' ?
      value['name']
    : scope.member;

  ancestors.add(value);
  const renderedEntries = entries.map(([key, childValue]) => {
    const renderedKey = renderKey(key);
    const token = renderToken(context, key, childValue);
    const childScope: RenderScope = {
      context: getChildContext(context, key),
      entityName: scope.entityName,
      member,
      path: `${scope.path}.${key}`
    };
    const renderedValue = token ?? renderMetadataValue(childValue, indentSize + 2, childScope, ancestors);
    return `${indent}${renderedKey}: ${renderedValue}`;
  });
  ancestors.delete(value);
  return `{\n${renderedEntries.join(',\n')}\n${' '.repeat(indentSize)}}`;
};

/**
 * 把实体元数据序列化成回填 `Entity(...)` 的字面量源码。
 *
 * @remarks
 * 遍历只走 `Object.entries`（自有可枚举属性）。**不得**改用 `Reflect.ownKeys` /
 * `Object.getOwnPropertyNames`：12 个 `enumerable: false` 的派生成员会一次性泄漏进生成结果，
 * 其中五个还是惰性 getter，一次纯序列化会变成带计算的副作用；而函数值 `isForeignKey`
 * 会当场撞上函数禁令，把每个实体的生成都变成失败（G4.3）。
 *
 * @param metadata - 已由 `@aiao/rxdb` 的 `transitionMetadata()` 合并过的实体元数据
 * @returns 可直接作为装饰器实参的对象字面量源码
 * @throws {Error} 存在函数 `default`（`unsupportedDefaultFactory`）或不可还原的值（`unsupportedDefaultValue`）
 */
export function transitionMetadata(metadata: EntityMetadata): string {
  // 这三个键名今天是冗余的：`omit` 内部的对象展开只拷自有可枚举属性，
  // 12 个派生成员在那一步就已经被排除。保留是为了让意图留在代码里，不是承重结构（G4.3）
  const metadataOptions = omit(metadata, ['propertyMap', 'relationMap', 'indexMap']);
  const scope: RenderScope = {
    context: 'metadata',
    entityName: typeof metadata.name === 'string' ? metadata.name : '<unnamed entity>',
    member: '',
    path: 'metadata'
  };

  return renderMetadataValue(metadataOptions, 0, scope, new Set());
}
