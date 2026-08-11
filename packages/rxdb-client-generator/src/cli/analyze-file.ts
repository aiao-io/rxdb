/**
 * @fileoverview 实体文件分析器
 * 使用 ts-morph 解析实体类文件，提取装饰器元数据
 *
 * @module rxdb-client-generator/cli/analyze-file
 */

import type { EntityMetadataOptions } from '@aiao/rxdb';
import { OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import {
  type ClassDeclaration,
  type Decorator,
  type Symbol as MorphSymbol,
  Node,
  Project,
  ScriptTarget,
  type SourceFile,
  SyntaxKind,
  ts
} from 'ts-morph';
import {
  type EntitySourceGetter,
  REPOSITORY_TYPE_GRAPH_REPOSITORY,
  REPOSITORY_TYPE_REPOSITORY,
  REPOSITORY_TYPE_TREE_REPOSITORY
} from '../core/RxDBClientGenerator.js';
import { getEntityMetadataOptions, getTreeEntityMetadataOptions } from '../core/metadata.utils.js';

interface AnalyzeFileResult {
  decoratorName: string;
  metadataOptions: EntityMetadataOptions;
  extendMetadataOptions: EntityMetadataOptions[];
  implements: string[];
  sourceGetters: EntitySourceGetter[];
}

interface EntityDecoratorInfo {
  metadataOptions: EntityMetadataOptions;
  name: string;
}

interface StaticObject {
  [key: string]: StaticValue;
}

type StaticValue = boolean | number | string | null | StaticObject | StaticValue[];

const ENTITY_DECORATOR_PACKAGES = new Map([
  ['Entity', '@aiao/rxdb'],
  ['GraphEntity', '@aiao/rxdb-plugin-graph'],
  ['TreeEntity', '@aiao/rxdb']
]);
const ENTITY_DECORATOR_NAMES = new Set(ENTITY_DECORATOR_PACKAGES.keys());
const ENTITY_DECORATOR_MODULES = new Set(ENTITY_DECORATOR_PACKAGES.values());
const packageNameCache = new Map<string, string | undefined>();
const require = createRequire(import.meta.url);

const createConstantMap = (value: object): ReadonlyMap<string, string> => {
  const record = value as Record<string, unknown>;
  const result = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const constant = record[key];
    if (typeof constant === 'string') {
      result.set(key, constant);
    }
  }
  return result;
};

const SAFE_CONSTANTS = new Map<string, ReadonlyMap<string, string>>([
  ['OnDeleteAction', createConstantMap(OnDeleteAction)],
  ['PropertyType', createConstantMap(PropertyType)],
  ['RelationKind', createConstantMap(RelationKind)]
]);

let globalProject: Project | undefined;

/** 清除复用的 ts-morph Project 与符号来源缓存。 */
export const clearGlobalProject = (): void => {
  globalProject = undefined;
  packageNameCache.clear();
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const findClosestTsConfig = (filePath: string): string | undefined => {
  let current = dirname(filePath);
  while (true) {
    const tsConfigPath = resolve(current, 'tsconfig.json');
    if (existsSync(tsConfigPath)) return tsConfigPath;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
};

const resolvePackageSource = (packageName: string, fromPath: string): string | undefined => {
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [dirname(fromPath), process.cwd()] });
  } catch {
    return undefined;
  }

  const packageRoot = dirname(packageJsonPath);
  const sourceEntry = resolve(packageRoot, 'src/index.ts');
  if (existsSync(sourceEntry)) return sourceEntry;

  const manifest: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (!isRecord(manifest) || typeof manifest.types !== 'string') return undefined;
  return resolve(packageRoot, manifest.types);
};

/** 创建能解析实体依赖的 ts-morph Project，并预载全部输入文件。 */
export const createAnalysisProject = (filePaths: readonly string[]): Project => {
  const tsConfigFilePath = filePaths[0] ? findClosestTsConfig(filePaths[0]) : undefined;
  const project =
    tsConfigFilePath ?
      new Project({ skipAddingFilesFromTsConfig: true, tsConfigFilePath })
    : new Project({
        compilerOptions: {
          experimentalDecorators: true,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          paths: Object.fromEntries(
            [...ENTITY_DECORATOR_MODULES].flatMap(packageName => {
              const source = filePaths[0] ? resolvePackageSource(packageName, filePaths[0]) : undefined;
              return source ? [[packageName, [source]]] : [];
            })
          ),
          skipLibCheck: true,
          target: ts.ScriptTarget.ES2022
        }
      });

  project.addSourceFilesAtPaths([...filePaths]);
  project.resolveSourceFileDependencies();
  return project;
};

const createEvaluationError = (node: Node, reason: string): Error => {
  const sourceFile = node.getSourceFile();
  const { column, line } = sourceFile.getLineAndColumnAtPos(node.getStart());
  const expression = node.getText().replaceAll(/\s+/g, ' ').slice(0, 200);
  return new Error(
    `Cannot statically evaluate entity metadata at ${sourceFile.getFilePath()}:${line}:${column}: ${reason} ` +
      `[${node.getKindName()}: ${expression}]`
  );
};

const evaluatePropertyAccess = (node: Node): StaticValue => {
  if (!Node.isPropertyAccessExpression(node)) {
    throw createEvaluationError(node, 'Expected an approved enum member');
  }

  const owner = node.getExpression();
  if (!Node.isIdentifier(owner)) {
    throw createEvaluationError(node, 'Only direct enum property access is allowed');
  }

  const constants = SAFE_CONSTANTS.get(owner.getText());
  const member = node.getName();
  const value = constants?.get(member);
  if (value === undefined) {
    throw createEvaluationError(node, `Unsupported constant ${owner.getText()}.${member}`);
  }
  return value;
};

const getStaticPropertyName = (node: Node): string => {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
    return String(node.getLiteralValue());
  }
  throw createEvaluationError(node, 'Unsupported object property name');
};

const evaluateStaticExpression = (node: Node): StaticValue => {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) || Node.isNumericLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isTrueLiteral(node) || Node.isFalseLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isNullLiteral(node)) {
    return null;
  }
  if (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isTypeAssertion(node)
  ) {
    return evaluateStaticExpression(node.getExpression());
  }
  if (Node.isPrefixUnaryExpression(node)) {
    const value = evaluateStaticExpression(node.getOperand());
    if (typeof value !== 'number') {
      throw createEvaluationError(node, 'Unary plus and minus require a numeric literal');
    }
    if (node.getOperatorToken() === SyntaxKind.MinusToken) {
      return -value;
    }
    if (node.getOperatorToken() === SyntaxKind.PlusToken) {
      return value;
    }
    throw createEvaluationError(node, 'Only unary plus and minus are allowed');
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().map(element => evaluateStaticExpression(element));
  }
  if (Node.isObjectLiteralExpression(node)) {
    const result: StaticObject = {};
    for (const property of node.getProperties()) {
      if (!Node.isPropertyAssignment(property)) {
        throw createEvaluationError(property, 'Only explicit object property assignments are allowed');
      }
      const nameNode = property.getNameNode();
      if (Node.isComputedPropertyName(nameNode)) {
        throw createEvaluationError(property, 'Computed property names are not allowed');
      }
      Object.defineProperty(result, getStaticPropertyName(nameNode), {
        configurable: true,
        enumerable: true,
        value: evaluateStaticExpression(property.getInitializerOrThrow()),
        writable: true
      });
    }
    return result;
  }
  if (Node.isPropertyAccessExpression(node)) {
    return evaluatePropertyAccess(node);
  }

  throw createEvaluationError(node, 'Unsupported metadata expression');
};

const getMetadataOptions = (node: Node): EntityMetadataOptions => {
  const value = evaluateStaticExpression(node);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createEvaluationError(node, 'Entity metadata must be an object literal');
  }
  if (typeof value.name !== 'string') {
    throw createEvaluationError(node, 'Entity metadata name must be a string');
  }
  return { ...value, name: value.name as EntityMetadataOptions['name'] };
};

const getPackageName = (filePath: string): string | undefined => {
  const cached = packageNameCache.get(filePath);
  if (cached !== undefined || packageNameCache.has(filePath)) return cached;

  let current = dirname(filePath);
  while (true) {
    const packageJsonPath = resolve(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      const manifest: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const packageName = isRecord(manifest) && typeof manifest.name === 'string' ? manifest.name : undefined;
      packageNameCache.set(filePath, packageName);
      return packageName;
    }
    const parent = dirname(current);
    if (parent === current) {
      packageNameCache.set(filePath, undefined);
      return undefined;
    }
    current = parent;
  }
};

const getBuiltinMetadataOptions = (declaration: ClassDeclaration): EntityMetadataOptions[] | undefined => {
  if (getPackageName(declaration.getSourceFile().getFilePath()) !== '@aiao/rxdb') return undefined;

  const className = declaration.getName();
  return className ? getEntityMetadataOptions(className) || getTreeEntityMetadataOptions(className) : undefined;
};

const resolveAliasedSymbol = (symbol: MorphSymbol | undefined): MorphSymbol | undefined => {
  const visited = new Set<MorphSymbol>();
  while (symbol && !visited.has(symbol)) {
    visited.add(symbol);
    const aliased = symbol.getAliasedSymbol();
    if (!aliased || aliased === symbol) return symbol;
    symbol = aliased;
  }
  return symbol;
};

const getDecoratorCallee = (decorator: Decorator): Node => {
  const expression = decorator.getExpression();
  return Node.isCallExpression(expression) ? expression.getExpression() : expression;
};

const getDecoratorSymbolNode = (callee: Node): Node | undefined => {
  if (Node.isIdentifier(callee)) return callee;
  if (Node.isPropertyAccessExpression(callee)) return callee.getNameNode();
  return undefined;
};

interface DecoratorReferenceTraversal {
  exports: Set<string>;
  symbols: Set<MorphSymbol>;
}

const referencesEntityDecoratorExport = (
  sourceFile: SourceFile,
  exportName: string,
  traversal: DecoratorReferenceTraversal
): boolean => {
  const key = `${sourceFile.getFilePath()}:${exportName}`;
  if (traversal.exports.has(key)) return false;
  traversal.exports.add(key);

  const exportedSymbol = sourceFile.getExportSymbols().find(symbol => symbol.getName() === exportName);
  if (exportedSymbol && referencesEntityDecoratorSymbol(exportedSymbol, traversal)) return true;

  return sourceFile.getExportDeclarations().some(declaration => {
    const moduleName = declaration.getModuleSpecifierValue();
    const namedExport = declaration
      .getNamedExports()
      .find(specifier => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === exportName);
    const sourceName = namedExport?.getName() ?? exportName;
    if (namedExport === undefined && declaration.getNamedExports().length > 0) return false;
    if (moduleName && ENTITY_DECORATOR_MODULES.has(moduleName)) {
      return ENTITY_DECORATOR_NAMES.has(sourceName);
    }
    const target = declaration.getModuleSpecifierSourceFile();
    return target ? referencesEntityDecoratorExport(target, sourceName, traversal) : false;
  });
};

const referencesEntityDecoratorSymbol = (symbol: MorphSymbol, traversal: DecoratorReferenceTraversal): boolean => {
  if (traversal.symbols.has(symbol)) return false;
  traversal.symbols.add(symbol);

  for (const declaration of symbol.getDeclarations()) {
    if (Node.isImportSpecifier(declaration)) {
      const importDeclaration = declaration.getImportDeclaration();
      const moduleName = importDeclaration.getModuleSpecifierValue();
      const importedName = declaration.getName();
      if (ENTITY_DECORATOR_MODULES.has(moduleName) && ENTITY_DECORATOR_NAMES.has(importedName)) return true;
      const target = importDeclaration.getModuleSpecifierSourceFile();
      if (target && referencesEntityDecoratorExport(target, importedName, traversal)) return true;
    }
    if (Node.isExportSpecifier(declaration)) {
      const exportDeclaration = declaration.getExportDeclaration();
      const moduleName = exportDeclaration.getModuleSpecifierValue();
      const exportedName = declaration.getName();
      if (moduleName && ENTITY_DECORATOR_MODULES.has(moduleName) && ENTITY_DECORATOR_NAMES.has(exportedName)) {
        return true;
      }
      const target = exportDeclaration.getModuleSpecifierSourceFile();
      if (target && referencesEntityDecoratorExport(target, exportedName, traversal)) return true;
    }
  }

  const aliased = symbol.getAliasedSymbol();
  return aliased && aliased !== symbol ? referencesEntityDecoratorSymbol(aliased, traversal) : false;
};

const resolveEntityDecoratorName = (decorator: Decorator): string | undefined => {
  const callee = getDecoratorCallee(decorator);
  const symbolNode = getDecoratorSymbolNode(callee);
  const sourceSymbol = symbolNode?.getSymbol();
  const symbol = resolveAliasedSymbol(sourceSymbol);
  const name = symbol?.getName();
  const expectedPackage = name ? ENTITY_DECORATOR_PACKAGES.get(name) : undefined;
  const declarationPackages = new Set(
    (symbol?.getDeclarations() ?? []).map(declaration => getPackageName(declaration.getSourceFile().getFilePath()))
  );

  if (expectedPackage && declarationPackages.has(expectedPackage)) return name;

  const syntaxName = decorator.getName();
  const referencesEntityDecorator =
    sourceSymbol ? referencesEntityDecoratorSymbol(sourceSymbol, { exports: new Set(), symbols: new Set() }) : false;
  if (ENTITY_DECORATOR_NAMES.has(syntaxName) || referencesEntityDecorator) {
    throw createEvaluationError(
      decorator,
      `${syntaxName} must resolve to an entity decorator exported by ${[...ENTITY_DECORATOR_MODULES].join(' or ')}`
    );
  }
  return undefined;
};

const applyRepositoryType = (decorator: EntityDecoratorInfo): EntityDecoratorInfo => {
  switch (decorator.name) {
    case 'Entity':
      decorator.metadataOptions.repository ??= REPOSITORY_TYPE_REPOSITORY;
      break;
    case 'TreeEntity':
      decorator.metadataOptions.repository = REPOSITORY_TYPE_TREE_REPOSITORY;
      break;
    case 'GraphEntity':
      decorator.metadataOptions.repository = REPOSITORY_TYPE_GRAPH_REPOSITORY;
      break;
  }
  return decorator;
};

const extractEntityDecorators = (node: Node): EntityDecoratorInfo[] => {
  if (!Node.isDecoratable(node)) return [];

  return node.getDecorators().flatMap(decorator => {
    const name = resolveEntityDecoratorName(decorator);
    if (!name) return [];

    const expression = decorator.getExpression();
    if (!Node.isCallExpression(expression)) {
      throw createEvaluationError(decorator, `${name} must be called with one metadata object`);
    }

    const args = expression.getArguments();
    if (args.length !== 1) {
      throw createEvaluationError(decorator, `${name} requires exactly one metadata object`);
    }

    return [applyRepositoryType({ name, metadataOptions: getMetadataOptions(args[0]) })];
  });
};

const transpileGetter = (source: string): string => {
  const output = ts.transpileModule(`class EntitySource {\n${source}\n}`, {
    compilerOptions: { target: ScriptTarget.ES2022 }
  }).outputText;
  const bodyStart = output.indexOf('{');
  const bodyEnd = output.lastIndexOf('}');
  if (bodyStart < 0 || bodyEnd <= bodyStart) {
    throw new Error('Failed to transpile entity getter');
  }
  return output.slice(bodyStart + 1, bodyEnd).trim();
};

/** 分析实体文件并返回可生成的静态元数据。 */
export default (filePath: string, project?: Project): AnalyzeFileResult[] => {
  if (!project) {
    globalProject ??= createAnalysisProject([filePath]);
    project = globalProject;
  }

  const sourceFile = project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
  project.resolveSourceFileDependencies();
  const classes = sourceFile.getClasses();

  const collectClassMetadata = (
    declaration: ClassDeclaration,
    visited = new Set<string>()
  ): EntityMetadataOptions[] => {
    const className = declaration.getName();
    const builtinMetadata = getBuiltinMetadataOptions(declaration);
    if (builtinMetadata) return builtinMetadata;

    const key = `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;
    if (visited.has(key)) {
      throw createEvaluationError(declaration, `Circular class inheritance detected for ${className ?? '<anonymous>'}`);
    }
    visited.add(key);

    const extendsClause = declaration.getExtends();
    const baseClass = declaration.getBaseClass();
    if (extendsClause && !baseClass) {
      throw createEvaluationError(declaration, `Cannot resolve base class ${extendsClause.getExpression().getText()}`);
    }

    const parentMetadata = baseClass ? collectClassMetadata(baseClass, visited) : [];
    const decorators = extractEntityDecorators(declaration);
    if (decorators.length > 1) {
      throw createEvaluationError(declaration, `Class ${className ?? '<anonymous>'} has multiple entity decorators`);
    }
    const metadataOptions = decorators[0]?.metadataOptions;
    return metadataOptions ? [...parentMetadata, metadataOptions] : parentMetadata;
  };

  const result: AnalyzeFileResult[] = [];
  for (const declaration of classes) {
    const className = declaration.getName();
    if (!className) continue;

    const decorators = extractEntityDecorators(declaration);
    if (decorators.length > 1) {
      throw createEvaluationError(declaration, `Class ${className} has multiple entity decorators`);
    }
    const entityDecorator = decorators[0];
    if (!entityDecorator) continue;

    const baseClass = declaration.getBaseClass();
    const extendsClause = declaration.getExtends();
    if (extendsClause && !baseClass) {
      throw createEvaluationError(declaration, `Cannot resolve base class ${extendsClause.getExpression().getText()}`);
    }

    result.push({
      decoratorName: entityDecorator.name,
      metadataOptions: entityDecorator.metadataOptions,
      implements: declaration.getImplements().map(implemented => implemented.getText()),
      extendMetadataOptions: baseClass ? collectClassMetadata(baseClass) : [],
      sourceGetters: declaration.getGetAccessors().map(getter => ({
        name: getter.getName(),
        returnType: getter.getReturnTypeNode()?.getText() ?? getter.getReturnType().getText(getter),
        runtime: transpileGetter(getter.getText()),
        docs: getter
          .getJsDocs()
          .map(doc => doc.getDescription().trim())
          .filter(Boolean)
      }))
    });
  }
  return result;
};
