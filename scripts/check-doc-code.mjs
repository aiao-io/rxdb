/**
 * 文档-代码同步检查：验证 @aiao/* import 路径是否指向有效的 workspace 包，可选语法检查。
 *
 * 用法：
 *   node scripts/check-doc-code.mjs                    # import 检查
 *   node scripts/check-doc-code.mjs --strict           # + 语法检查
 *   node scripts/check-doc-code.mjs website/docs/xxx   # 指定目录
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
const DOCS_DIR = join(ROOT, 'website', 'docs');
const PACKAGES_DIR = join(ROOT, 'packages');

const validPackageNames = new Set(
  readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      try {
        return JSON.parse(readFileSync(join(PACKAGES_DIR, d.name, 'package.json'), 'utf-8')).name;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);

const MIGRATION_DIR = join(DOCS_DIR, 'migration');

/**
 * 已经不在 `packages/` 里、但迁移文档必须叫得出名字的包：`name → 替代品`。
 *
 * 迁移页要写「旧代码长什么样」，那段 import 指向的正是一个故意删掉的包。这类引用只在
 * `website/docs/migration/` 下放行；其余文档写到它仍然报错，且直接把替代品报出来——
 * 比「not found in packages/」更省一次翻查。
 */
const RETIRED_PACKAGES = new Map([
  ['@aiao/rxdb-adapter-desktop', '@aiao/rxdb-adapter-electron / @aiao/rxdb-adapter-tauri']
]);

// 信息串的尾巴用 `[^\n]*` 而不是 `.*`，前导也钉成 `[ \t]`：`\s` 会吃掉换行，于是围栏行后面
// 紧跟的**第一行**被算进信息串而不是块体——而 import 通常正写在那一行，等于漏检。
const CODE_BLOCK_RE = /^```(?:typescript|ts|tsx|javascript|js|jsx)(?:[ \t][^\n]*)?$\n([\s\S]*?)^```$/gm;
const IMPORT_RE = /(?:import|from)\s+['"](@aiao\/[^/'"]+)/g;

function extractCodeBlocks(content, filePath) {
  const blocks = [];
  let match;
  CODE_BLOCK_RE.lastIndex = 0;
  while ((match = CODE_BLOCK_RE.exec(content)) !== null) {
    const line = content.slice(0, match.index).split('\n').length;
    blocks.push({ code: match[1], line, file: filePath });
  }
  return blocks;
}

function checkImports(code, filePath) {
  const errors = [];
  const inMigrationDocs = filePath.startsWith(MIGRATION_DIR);
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(code)) !== null) {
    const name = match[1];
    if (validPackageNames.has(name)) continue;

    const replacement = RETIRED_PACKAGES.get(name);
    if (replacement === undefined) {
      errors.push({ type: 'import', message: `Invalid package: "${name}" not found in packages/` });
      continue;
    }
    if (inMigrationDocs) continue;
    errors.push({ type: 'import', message: `Retired package: "${name}" — use ${replacement}` });
  }
  return errors;
}

function shouldSkipSyntax(code) {
  if (code.includes('@Component') && code.includes('template')) return true;
  if (code.includes('<script setup')) return true;
  if (code.includes('// ...') || code.includes('...existing')) return true;
  if (/^\s*</.test(code.trim())) return true;
  return false;
}

/** 用 TS transpile 试解析代码块语法（--strict 模式）。放行找不到模块/名字等文档噪音。 */
function checkSyntax(code, fileName) {
  if (shouldSkipSyntax(code)) return [];

  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      strict: false,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      isolatedModules: true,
      experimentalDecorators: true
    },
    reportDiagnostics: true,
    fileName
  });

  const errors = [];
  for (const diag of result.diagnostics ?? []) {
    const msg = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    if (msg.includes('Cannot find module')) continue;
    if (msg.includes('Cannot find name')) continue;
    if (msg.includes('Unable to resolve signature')) continue;
    if (msg.includes('Property assignment expected')) continue;
    errors.push({ type: 'syntax', message: msg, line: diag.start });
  }
  return errors;
}

function collectMdFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      files.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return files;
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const dirs = args.filter(a => !a.startsWith('--'));
const targetDirs = dirs.length > 0 ? dirs.map(d => resolve(ROOT, d)) : [DOCS_DIR];

let totalBlocks = 0;
let totalErrors = 0;
let filesWithErrors = 0;

for (const dir of targetDirs) {
  for (const file of collectMdFiles(dir)) {
    const content = readFileSync(file, 'utf-8');
    const blocks = extractCodeBlocks(content, file);
    if (blocks.length === 0) continue;

    let fileHasError = false;
    for (const block of blocks) {
      totalBlocks++;
      const relPath = relative(ROOT, block.file);
      const importErrors = checkImports(block.code, block.file);
      const syntaxErrors = strict ? checkSyntax(block.code, `${relPath}#L${block.line}.tsx`) : [];
      const allErrors = [...importErrors, ...syntaxErrors];

      if (allErrors.length > 0) {
        if (!fileHasError) {
          fileHasError = true;
          filesWithErrors++;
          console.error(`\n✗ ${relPath}`);
        }
        for (const err of allErrors) {
          totalErrors++;
          console.error(`  L${block.line}: [${err.type}] ${err.message}`);
        }
      }
    }
  }
}

console.log(`\n─── Doc Code Check${strict ? ' (strict)' : ''} ───`);
console.log(`Code blocks: ${totalBlocks}`);
console.log(`Errors: ${totalErrors} in ${filesWithErrors} files`);

if (totalErrors > 0) process.exit(1);
console.log('✓ All code blocks passed.');
