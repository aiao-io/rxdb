import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Node, Project } from 'ts-morph';

const ROOT = process.cwd();

const checks = [
  {
    name: 'rxdb-admin',
    entries: [
      ['packages/rxdb-admin/src/i18n/zh-hans.ts', 'adminZhHansMessages'],
      ['packages/rxdb-admin/src/i18n/en.ts', 'adminEnMessages']
    ]
  },
  {
    name: 'devtools-panel',
    entries: [
      ['modules/rxdb-devtools-panel/src/i18n/messages.ts', 'panelZhMessages'],
      ['modules/rxdb-devtools-panel/src/i18n/messages.ts', 'panelEnMessages']
    ]
  },
  {
    name: 'rxdb-model',
    entries: [
      ['packages/rxdb-model/src/messages.ts', 'modelZhHansMessages'],
      ['packages/rxdb-model/src/messages.ts', 'modelEnMessages']
    ]
  },
  {
    name: 'demo/workspace',
    entries: [
      ['modules/demo-i18n/workspace.ts', 'workspaceZhMessages'],
      ['modules/demo-i18n/workspace.ts', 'workspaceEnMessages']
    ]
  },
  {
    name: 'demo/common',
    entries: [
      ['modules/demo-i18n/common.ts', 'commonZhMessages'],
      ['modules/demo-i18n/common.ts', 'commonEnMessages']
    ]
  },
  {
    name: 'demo/search',
    entries: [
      ['modules/demo-i18n/search.ts', 'searchZhMessages'],
      ['modules/demo-i18n/search.ts', 'searchEnMessages']
    ]
  },
  {
    name: 'demo/working-tree',
    entries: [
      ['modules/demo-i18n/working-tree.ts', 'workingTreeZhMessages'],
      ['modules/demo-i18n/working-tree.ts', 'workingTreeEnMessages']
    ]
  },
  {
    name: 'demo/tree-menu',
    entries: [
      ['modules/demo-i18n/tree-menu.ts', 'treeMenuZhMessages'],
      ['modules/demo-i18n/tree-menu.ts', 'treeMenuEnMessages']
    ]
  },
  {
    name: 'demo/file-manager',
    entries: [
      ['modules/demo-i18n/file-manager.ts', 'fileManagerZhMessages'],
      ['modules/demo-i18n/file-manager.ts', 'fileManagerEnMessages']
    ]
  },
  {
    name: 'demo/entities',
    entries: [
      ['modules/demo-i18n/entities.ts', 'entitiesZhMessages'],
      ['modules/demo-i18n/entities.ts', 'entitiesEnMessages']
    ]
  },
  {
    name: 'demo/headless',
    entries: [
      ['modules/demo-i18n/headless.ts', 'headlessZhMessages'],
      ['modules/demo-i18n/headless.ts', 'headlessEnMessages']
    ]
  },
  {
    name: 'demo/files',
    entries: [
      ['modules/demo-i18n/files.ts', 'fileZhMessages'],
      ['modules/demo-i18n/files.ts', 'fileEnMessages']
    ]
  },
  {
    name: 'demo/encrypted',
    entries: [
      ['modules/demo-i18n/encrypted.ts', 'encryptedZhMessages'],
      ['modules/demo-i18n/encrypted.ts', 'encryptedEnMessages']
    ]
  },
  {
    name: 'demo/remote-cache',
    entries: [
      ['modules/demo-i18n/remote-cache.ts', 'remoteCacheZhMessages'],
      ['modules/demo-i18n/remote-cache.ts', 'remoteCacheEnMessages']
    ]
  },
  {
    name: 'demo/todo',
    entries: [
      ['modules/demo-i18n/todo.ts', 'todoZhMessages'],
      ['modules/demo-i18n/todo.ts', 'todoEnMessages']
    ]
  },
  {
    name: 'demo/generator',
    entries: [
      ['modules/demo-i18n/generator.ts', 'generatorZhMessages'],
      ['modules/demo-i18n/generator.ts', 'generatorEnMessages']
    ]
  },
  {
    name: 'demo/history',
    entries: [
      ['modules/demo-i18n/history.ts', 'historyZhMessages'],
      ['modules/demo-i18n/history.ts', 'historyEnMessages']
    ]
  },
  ...['angular', 'react', 'vue'].flatMap(framework => [
    {
      name: `admin-template-${framework}/application`,
      entries: [
        [`apps/rxdb-admin-template-${framework}/src/app/i18n/page-messages.ts`, 'pageZhMessages'],
        [`apps/rxdb-admin-template-${framework}/src/app/i18n/page-messages.ts`, 'pageEnMessages']
      ]
    },
    {
      name: `admin-template-${framework}/domain`,
      entries: [
        [`apps/rxdb-admin-template-${framework}/src/app/i18n/domain-messages.ts`, 'domainZhMessages'],
        [`apps/rxdb-admin-template-${framework}/src/app/i18n/domain-messages.ts`, 'domainEnMessages']
      ]
    },
    {
      name: `admin-template-${framework}/model`,
      entries: [
        [`apps/rxdb-admin-template-${framework}/src/app/i18n/domain-messages.ts`, 'domainModelZhMessages'],
        [`apps/rxdb-admin-template-${framework}/src/app/i18n/domain-messages.ts`, 'domainModelEnMessages']
      ]
    }
  ])
];

function unwrap(expression) {
  let current = expression;
  while (current && (Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isTypeAssertion(current) || Node.isParenthesizedExpression(current))) {
    current = current.getExpression();
  }
  return current;
}

function propertyKey(property) {
  if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) || Node.isMethodDeclaration(property)) {
    const name = property.getNameNode();
    if (Node.isIdentifier(name) || Node.isStringLiteral(name) || Node.isNumericLiteral(name)) return name.getText().replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

function resolveObjectKeys(sourceFile, exportName, resolving = new Set()) {
  if (resolving.has(exportName)) throw new Error(`循环引用：${sourceFile.getFilePath()}#${exportName}`);
  resolving.add(exportName);

  const declaration = sourceFile.getVariableDeclaration(exportName);
  if (!declaration) throw new Error(`未找到导出变量：${sourceFile.getFilePath()}#${exportName}`);
  const initializer = unwrap(declaration.getInitializer());
  if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
    throw new Error(`导出变量不是对象字面量：${sourceFile.getFilePath()}#${exportName}`);
  }

  const keys = new Set();
  for (const property of initializer.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      const spread = unwrap(property.getExpression());
      if (!Node.isIdentifier(spread)) throw new Error(`暂不支持非标识符 spread：${property.getText()}`);
      for (const key of resolveObjectKeys(sourceFile, spread.getText(), resolving)) keys.add(key);
      continue;
    }
    const key = propertyKey(property);
    if (key !== undefined) keys.add(key);
  }

  resolving.delete(exportName);
  return keys;
}

function formatKeys(keys) {
  return [...keys].sort((left, right) => left.localeCompare(right)).join(', ');
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: true }
});
const errors = [];

for (const check of checks) {
  const resolvedEntries = check.entries.map(([file, exportName]) => {
    const filePath = path.join(ROOT, file);
    if (!existsSync(filePath)) throw new Error(`文案文件不存在：${file}`);
    const sourceFile = project.addSourceFileAtPath(filePath);
    return { file, exportName, sourceFile, keys: resolveObjectKeys(sourceFile, exportName) };
  });
  const [left, right] = resolvedEntries;
  const missing = [...left.keys].filter(key => !right.keys.has(key)).sort((a, b) => a.localeCompare(b));
  const extra = [...right.keys].filter(key => !left.keys.has(key)).sort((a, b) => a.localeCompare(b));
  const status = missing.length === 0 && extra.length === 0 ? 'PASS' : 'FAIL';
  console.log(`${status} ${check.name}: ${left.keys.size} / ${right.keys.size} keys`);
  if (missing.length > 0) {
    errors.push(`${check.name}: ${relative(path.join(ROOT, left.file))} 缺少 ${right.exportName} 中的键：${formatKeys(missing)}`);
  }
  if (extra.length > 0) {
    errors.push(`${check.name}: ${relative(path.join(ROOT, right.file))} 多出 ${right.exportName} 中的键：${formatKeys(extra)}`);
  }
}

if (errors.length > 0) {
  console.error('\n文案目录完整性检查失败：');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
