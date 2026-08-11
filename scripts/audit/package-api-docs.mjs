/**
 * 包 API 文档审计：检查指定包的公共导出是否都有 TSDoc 注释。
 *
 * 用法: node scripts/audit/package-api-docs.mjs <package-directory>
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Return true when a declaration belongs to the package being audited.
 *
 * The source-file check is deliberately kept at the declaration boundary. A
 * public class may extend a type from another package; its inherited members
 * are not declarations in this package and therefore are not part of this
 * package's documentation gate.
 */
const isOwnedDeclaration = (declaration, packageRootPrefix) =>
  path.resolve(declaration.getSourceFile().fileName).startsWith(packageRootPrefix);

/** Root exports may carry their TSDoc on the containing variable statement. */
const hasRootDocumentation = declaration => {
  let current = declaration;
  while (current && !ts.isSourceFile(current)) {
    if (ts.getJSDocCommentsAndTags(current).length > 0) return true;
    if (ts.isStatement(current)) return false;
    current = current.parent;
  }
  return false;
};

/** Members must have their own comment; a class/interface comment is not enough. */
const hasMemberDocumentation = declaration => ts.getJSDocCommentsAndTags(declaration).length > 0;

const hasModifier = (node, kind) => (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === kind);

const isPublicMember = node => {
  if (node.name && ts.isPrivateIdentifier(node.name)) return false;
  return !hasModifier(node, ts.SyntaxKind.PrivateKeyword) && !hasModifier(node, ts.SyntaxKind.ProtectedKeyword);
};

const getMemberName = (member, sourceFile) => {
  if (ts.isConstructorDeclaration(member)) return 'constructor';
  if (ts.isCallSignatureDeclaration(member)) return '[call]';
  if (ts.isConstructSignatureDeclaration(member)) return '[construct]';
  if (ts.isIndexSignatureDeclaration(member)) return '[index]';
  if (!member.name || ts.isPrivateIdentifier(member.name)) return null;
  return member.name.getText(sourceFile);
};

const addFinding = (findings, symbolPath, documented) => {
  const previous = findings.get(symbolPath);
  if (previous === true) return;
  findings.set(symbolPath, documented || previous === true);
};

/**
 * Build a compiler program for a package entry. Kept as a small exported
 * helper so the audit has a deterministic, directly testable core.
 */
const createPackageProgram = packageRoot => {
  const entry = path.join(packageRoot, 'src/index.ts');
  const program = ts.createProgram([entry], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    skipLibCheck: true
  });
  const source = program.getSourceFile(entry);
  assert.ok(source, `Cannot load package entry: ${entry}`);
  return { entry, program, source, checker: program.getTypeChecker() };
};

/**
 * Audit the directly declared public members of a class or interface.
 *
 * We intentionally inspect the declaration AST instead of
 * `type.getProperties()`: the latter includes inherited members, including
 * members declared by external dependencies. Inline object types are walked
 * recursively so nested public contracts are covered as well.
 */
const collectDeclarationMembers = ({ declaration, symbolPath, checker, packageRootPrefix, findings, active }) => {
  if (active.has(declaration)) return;
  active.add(declaration);

  if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
    for (const member of declaration.members) {
      if (!isPublicMember(member)) continue;
      const memberName = getMemberName(member, declaration.getSourceFile());
      if (!memberName) continue;

      const memberPath = `${symbolPath}.${memberName}`;
      addFinding(findings, memberPath, hasMemberDocumentation(member));
      collectTypeMembers({
        typeNode: member.type,
        symbolPath: memberPath,
        checker,
        packageRootPrefix,
        findings,
        active
      });
    }
  } else if (ts.isTypeAliasDeclaration(declaration)) {
    collectTypeMembers({
      typeNode: declaration.type,
      symbolPath,
      checker,
      packageRootPrefix,
      findings,
      active
    });
  }

  active.delete(declaration);
};

const collectTypeElementMembers = ({
  members,
  symbolPath,
  checker,
  packageRootPrefix,
  findings,
  active,
  sourceFile
}) => {
  for (const member of members) {
    if (!isPublicMember(member)) continue;
    const memberName = getMemberName(member, sourceFile);
    if (!memberName) continue;

    const memberPath = `${symbolPath}.${memberName}`;
    addFinding(findings, memberPath, hasMemberDocumentation(member));
    collectTypeMembers({
      typeNode: member.type,
      symbolPath: memberPath,
      checker,
      packageRootPrefix,
      findings,
      active
    });
  }
};

const collectTypeMembers = ({ typeNode, symbolPath, checker, packageRootPrefix, findings, active }) => {
  if (!typeNode) return;

  if (ts.isTypeLiteralNode(typeNode)) {
    collectTypeElementMembers({
      members: typeNode.members,
      symbolPath,
      checker,
      packageRootPrefix,
      findings,
      active,
      sourceFile: typeNode.getSourceFile()
    });
    return;
  }

  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
    for (const child of typeNode.types) {
      collectTypeMembers({ typeNode: child, symbolPath, checker, packageRootPrefix, findings, active });
    }
    return;
  }

  if (ts.isParenthesizedTypeNode(typeNode) || ts.isTypeOperatorNode(typeNode) || ts.isOptionalTypeNode(typeNode)) {
    collectTypeMembers({
      typeNode: typeNode.type,
      symbolPath,
      checker,
      packageRootPrefix,
      findings,
      active
    });
    return;
  }

  if (ts.isArrayTypeNode(typeNode)) {
    collectTypeMembers({
      typeNode: typeNode.elementType,
      symbolPath,
      checker,
      packageRootPrefix,
      findings,
      active
    });
    return;
  }

  if (ts.isTupleTypeNode(typeNode)) {
    for (const element of typeNode.elements) {
      collectTypeMembers({
        typeNode: ts.isNamedTupleMember(element) ? element.type : element,
        symbolPath,
        checker,
        packageRootPrefix,
        findings,
        active
      });
    }
    return;
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const referenced = checker.getSymbolAtLocation(typeNode.typeName);
    if (referenced) {
      const resolved = referenced.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(referenced) : referenced;
      for (const declaration of resolved.declarations ?? []) {
        if (!isOwnedDeclaration(declaration, packageRootPrefix)) continue;
        collectDeclarationMembers({
          declaration,
          symbolPath,
          checker,
          packageRootPrefix,
          findings,
          active
        });
      }
    }

    for (const argument of typeNode.typeArguments ?? []) {
      collectTypeMembers({ typeNode: argument, symbolPath, checker, packageRootPrefix, findings, active });
    }
    return;
  }

  if (ts.isFunctionTypeNode(typeNode)) {
    collectTypeMembers({
      typeNode: typeNode.type,
      symbolPath: `${symbolPath}.[call]`,
      checker,
      packageRootPrefix,
      findings,
      active
    });
    return;
  }

  if (ts.isConstructorTypeNode(typeNode)) {
    collectTypeMembers({
      typeNode: typeNode.type,
      symbolPath: `${symbolPath}.[construct]`,
      checker,
      packageRootPrefix,
      findings,
      active
    });
    return;
  }

  if (ts.isMappedTypeNode(typeNode)) {
    collectTypeMembers({
      typeNode: typeNode.type,
      symbolPath,
      checker,
      packageRootPrefix,
      findings,
      active
    });
  }
};

/** Return root exports and recursively discovered public member paths without documentation. */
export const findUndocumentedPublicApi = (packageRootInput, { includeMembers = false } = {}) => {
  const packageRoot = path.resolve(packageRootInput);
  const packageRootPrefix = `${packageRoot}${path.sep}`;
  const { source, checker } = createPackageProgram(packageRoot);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  assert.ok(moduleSymbol, `Cannot resolve package module: ${path.join(packageRoot, 'src/index.ts')}`);

  const findings = new Map();
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const ownedDeclarations = (resolved.declarations ?? []).filter(declaration =>
      isOwnedDeclaration(declaration, packageRootPrefix)
    );
    if (ownedDeclarations.length === 0) continue;

    const symbolPath = symbol.getName();
    addFinding(findings, symbolPath, ownedDeclarations.some(hasRootDocumentation));
    if (includeMembers) {
      for (const declaration of ownedDeclarations) {
        collectDeclarationMembers({
          declaration,
          symbolPath,
          checker,
          packageRootPrefix,
          findings,
          active: new Set()
        });
      }
    }
  }

  return [...findings.entries()]
    .filter(([, documented]) => !documented)
    .map(([symbolPath]) => symbolPath)
    .sort();
};

/** Run the CLI audit and throw a useful, complete list on failure. */
export const auditPackageApiDocs = (packageRootInput, options = {}) => {
  const undocumented = findUndocumentedPublicApi(packageRootInput, options);
  if (undocumented.length > 0) {
    throw new Error(`Undocumented package exports or members: ${undocumented.join(', ')}`);
  }

  const packageRoot = path.resolve(packageRootInput);
  process.stdout.write(`Public API documentation passed: ${path.basename(packageRoot)}\n`);
  return undocumented;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const includeMembers = args.includes('--members');
    const packageRoot = args.find(argument => !argument.startsWith('--')) ?? '.';
    auditPackageApiDocs(packageRoot, { includeMembers });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
