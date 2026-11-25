import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// 英文站点的文案门禁：页面/组件/演示源码里的中文文案必须登记在 locale-copy.ts 的
// englishCopy 字典中，英文博客与 code.json 不得残留中文。
// 字面量提取使用 TypeScript 编译器 API（AST 遍历 StringLiteral / NoSubstitutionTemplateLiteral），
// JSX 文本节点（JSXText）单独遍历：JSXText 是纯文本、不穿插表达式，但会原样渲染到英文站，
// 因此含中文的 JSXText 必须经 copy() 渲染（登记在字典里也不行）；注释天然不是字面量，不会误报。

const root = resolve(import.meta.dirname, '../..');
const copyFile = join(root, 'website/src/lib/locale-copy.ts');
const blogDir = join(root, 'website/i18n/en/docusaurus-plugin-content-blog');
const componentDirs = ['website/src/pages', 'website/src/components', 'website/src/demos'].map(dir => join(root, dir));
const han = /\p{Script=Han}/u;

function tsxFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...tsxFiles(path));
    } else if (path.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

// 用 TS AST 提取 englishCopy 字典的键（属性名只认字面量与标识符，与文案提取同一套解析方式）
function englishCopyKeys() {
  const source = ts.createSourceFile(
    copyFile,
    readFileSync(copyFile, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const keys = new Set();
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'englishCopy' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        const name = property.name;
        if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
          keys.add(name.text);
        } else if (ts.isIdentifier(name)) {
          keys.add(name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(keys.size > 50, 'locale-copy.ts 的 englishCopy 字典未解析到足够多的键，检查解析实现');
  return keys;
}

// 用 TS AST 提取一个文件里所有含中文的字符串字面量
function cjkLiterals(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (han.test(node.text)) {
        found.push({
          text: node.text,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// 用 TS AST 提取一个文件里所有含中文的 JSX 文本节点（去空白后判定；JSXText 是纯文本，不穿插表达式）
function cjkJsxTexts(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = node => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (han.test(text)) {
        found.push({
          text,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// 去掉 frontmatter（首个 --- 块）后的正文，避免把元数据误判为正文
function postBody(content) {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(content);
  return match ? content.slice(match[0].length) : content;
}

test('英文站点的页面、组件与演示源码中的中文文案都登记在 englishCopy 字典中', () => {
  const keys = englishCopyKeys();
  const violations = [];
  let checked = 0;
  for (const dir of componentDirs) {
    for (const file of tsxFiles(dir)) {
      for (const { text, line } of cjkLiterals(file)) {
        checked += 1;
        if (!keys.has(text)) {
          violations.push(`${relative(root, file)}:${line}: ${text}`);
        }
      }
      for (const { text, line } of cjkJsxTexts(file)) {
        checked += 1;
        if (!keys.has(text)) {
          violations.push(`${relative(root, file)}:${line}: ${text}（JSX 文本节点未登记到 englishCopy 字典）`);
        } else {
          violations.push(
            `${relative(root, file)}:${line}: ${text}（JSX 文本节点已登记，但直接写在 JSX 里会在英文站原样渲染中文，需改为 copy() 调用）`
          );
        }
      }
    }
  }
  assert.ok(checked > 0, '未在页面、组件与演示源码中扫描到任何中文字面量，检查目录遍历是否正确');
  assert.deepEqual(
    violations,
    [],
    `以下中文文案未登记到 englishCopy 字典或未通过 copy() 渲染：\n  ${violations.join('\n  ')}`
  );
});

test('英文博客包含初始化文章、作者与标签文件，且文章正文不含中文', () => {
  const post = join(blogDir, '2025-08-12-init.md');
  assert.ok(existsSync(post), '缺少英文博客文章 i18n/en/docusaurus-plugin-content-blog/2025-08-12-init.md');
  assert.ok(existsSync(join(blogDir, 'authors.yml')), '缺少英文博客 authors.yml');
  assert.ok(existsSync(join(blogDir, 'tags.yml')), '缺少英文博客 tags.yml');
  assert.ok(!han.test(postBody(readFileSync(post, 'utf8'))), '英文博客文章 2025-08-12-init.md 的正文包含中文字符');
});

test('英文 code.json 的译文与说明不含中文', () => {
  const catalog = JSON.parse(readFileSync(join(root, 'website/i18n/en/code.json'), 'utf8'));
  const violations = [];
  for (const [key, value] of Object.entries(catalog)) {
    for (const field of ['message', 'description']) {
      if (typeof value?.[field] === 'string' && han.test(value[field])) {
        violations.push(`${key}.${field}`);
      }
    }
  }
  assert.deepEqual(violations, [], `code.json 以下键的值包含中文：\n  ${violations.join('\n  ')}`);
});
