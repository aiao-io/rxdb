import { PostgreSQL as PostgreSQLDialect, SQLite as SQLiteDialect, StandardSQL } from '@codemirror/lang-sql';
import { LanguageDescription, LanguageSupport } from '@codemirror/language';
import { languages as upstreamLanguages } from '@codemirror/language-data';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CSS,
  findLanguageByName,
  HTML,
  JavaScript,
  JSON,
  JSX,
  Markdown,
  PostgreSQL,
  Python,
  Sass,
  SCSS,
  SQL,
  SQLite,
  SUPPORT_LANGUAGES,
  TSX,
  TypeScript,
  XML,
  type CodeEditorLanguageDescription
} from '../index.js';

const parserLoaderCases = [
  {
    description: CSS,
    languageName: 'css',
    source: '.button { color: red; }',
    expectedNodes: ['StyleSheet', 'RuleSet', 'Declaration']
  },
  {
    description: HTML,
    languageName: 'html',
    source: '<main>Hello</main>',
    expectedNodes: ['Document', 'Element', 'Text']
  },
  {
    description: XML,
    languageName: 'xml',
    source: '<?xml version="1.0"?><root />',
    expectedNodes: ['Document', 'ProcessingInst', 'SelfClosingTag']
  },
  {
    description: JavaScript,
    languageName: 'javascript',
    source: 'const value = 1;',
    expectedNodes: ['Script', 'VariableDeclaration', 'Number']
  },
  {
    description: JSX,
    languageName: 'javascript',
    source: 'const view = <Component />;',
    expectedNodes: ['Script', 'JSXElement', 'JSXIdentifier']
  },
  {
    description: TypeScript,
    languageName: 'typescript',
    source: 'const value: string = "ok";',
    expectedNodes: ['Script', 'TypeAnnotation', 'TypeName']
  },
  {
    description: TSX,
    languageName: 'typescript',
    source: 'const view: JSX.Element = <div />;',
    expectedNodes: ['Script', 'TypeAnnotation', 'JSXElement']
  },
  {
    description: JSON,
    languageName: 'json',
    source: '{"ok": true}',
    expectedNodes: ['JsonText', 'Property', 'True']
  },
  {
    description: SCSS,
    languageName: 'sass',
    source: '$color: red; .button { color: $color; }',
    expectedNodes: ['StyleSheet', 'SassVariableName', 'RuleSet']
  },
  {
    description: Sass,
    languageName: 'sass',
    source: '$color: red\n.button\n  color: $color',
    expectedNodes: ['StyleSheet', 'SassVariableName', 'RuleSet']
  },
  {
    description: Python,
    languageName: 'python',
    source: 'def greet(name):\n    return name',
    expectedNodes: ['Script', 'FunctionDefinition', 'ReturnStatement']
  },
  {
    description: Markdown,
    languageName: 'markdown',
    source: '# Heading\n\nText',
    expectedNodes: ['Document', 'ATXHeading1', 'Paragraph']
  }
] as const;

const sqlLoaderCases = [
  {
    description: SQLite,
    dialect: SQLiteDialect,
    source: 'PRAGMA table_info(users);',
    expectedNodes: ['Script', 'Statement', 'Identifier']
  },
  {
    description: SQL,
    dialect: StandardSQL,
    source: 'SELECT * FROM users;',
    expectedNodes: ['Script', 'Statement', 'Operator']
  },
  {
    description: PostgreSQL,
    dialect: PostgreSQLDialect,
    source: 'SELECT TRUE::boolean;',
    expectedNodes: ['Script', 'Statement', 'Bool', 'Type']
  }
] as const;

/** 覆盖了上游同名项的 15 个描述 —— CE-002 要求它们不得丢失上游元数据。 */
const overridingLanguages = [
  CSS,
  HTML,
  XML,
  JavaScript,
  JSX,
  TypeScript,
  TSX,
  JSON,
  SCSS,
  Sass,
  Python,
  Markdown,
  SQLite,
  SQL,
  PostgreSQL
] as const;

const upstreamByName = new Map(upstreamLanguages.map(language => [language.name.toLowerCase(), language]));

const customLanguage = {
  name: 'Custom',
  alias: ['custom-alias'],
  extensions: ['custom'],
  filename: /\.custom$/,
  support: undefined,
  load: () => Promise.resolve({ extension: [] })
} satisfies CodeEditorLanguageDescription;

describe('code-editor languages', () => {
  describe('SUPPORT_LANGUAGES', () => {
    it('包含全部自定义语言且名称不重复', () => {
      const customLanguages = [
        CSS,
        HTML,
        XML,
        JavaScript,
        JSX,
        TypeScript,
        TSX,
        JSON,
        SCSS,
        Sass,
        Python,
        Markdown,
        SQLite,
        SQL,
        PostgreSQL
      ];
      const names = SUPPORT_LANGUAGES.map(language => language.name.toLowerCase());

      expect(SUPPORT_LANGUAGES).toEqual(expect.arrayContaining(customLanguages));
      expect(new Set(names).size).toBe(names.length);
      expect(Object.isFrozen(SUPPORT_LANGUAGES)).toBe(true);
    });

    // CE-001：`SUPPORT_LANGUAGES` 曾被标注成结构化的 `CodeEditorLanguageDescription[]`，
    // 而 CodeMirror 的 `LanguageDescription` 带私有字段（`loadFunc` / `loading`），
    // 结构类型无法回流到标称类型 —— 下面两行在修复前是 TS2345，跑 `tsc -p tsconfig.spec.json`
    // 才会暴露（四项门禁只看 tsconfig.lib.json）。
    it('可直接喂给 CodeMirror 的 LanguageDescription 静态方法', () => {
      expect(LanguageDescription.matchFilename(SUPPORT_LANGUAGES, 'main.ts')).toBe(TypeScript);
      expect(LanguageDescription.matchLanguageName(SUPPORT_LANGUAGES, 'sqlite')).toBe(SQLite);
    });

    // CE-005：整个包的用例此前只覆盖 15 个自定义描述，把内置语言全删掉仍旧全绿 ——
    // 「上游语言也在 SUPPORT_LANGUAGES 里」这条契约没有任何测试守着。
    it('保留未被覆盖的上游语言并可加载真实解析器', async () => {
      const rust = LanguageDescription.matchLanguageName(SUPPORT_LANGUAGES, 'rust');

      expect(findLanguageByName('Rust')).toBe(rust);
      expect(findLanguageByName('yaml')).not.toBeNull();
      expect(rust).not.toBeNull();

      const support = await rust!.load();
      const tree = support.language.parser.parse('fn main() {}').toString();

      expect(support).toBeInstanceOf(LanguageSupport);
      expect(tree).not.toContain('⚠');
      expect(tree).toContain('FunctionItem');
    });
  });

  // CE-002：15 个自定义描述整体替换了上游同名项，只写了本仓关心的几个扩展名，
  // 上游的别名 / 扩展名 / filename 正则被静默丢弃 —— `xhtml`、`rss`、`*.svg`、
  // `*.hbs`、`BUILD`/`BUCK` 全部失配。
  describe('覆盖上游语言时保留上游元数据', () => {
    it.each(overridingLanguages)('$name 的 alias 与 extensions 是上游的超集', description => {
      const upstream = upstreamByName.get(description.name.toLowerCase());

      expect(upstream, `上游不存在同名语言 ${description.name}`).toBeDefined();
      expect(description.alias).toEqual(expect.arrayContaining([...upstream!.alias]));
      expect(description.extensions).toEqual(expect.arrayContaining([...upstream!.extensions]));
    });

    it('自身没有 filename 时沿用上游的 filename 正则', () => {
      expect(Python.filename).toEqual(upstreamByName.get('python')!.filename);
    });

    it.each([
      { filename: 'icon.svg', expected: XML },
      { filename: 'transform.xsl', expected: XML },
      { filename: 'schema.xsd', expected: XML },
      { filename: 'card.hbs', expected: HTML },
      { filename: 'notes.mkd', expected: Markdown },
      { filename: 'rules.bzl', expected: Python },
      { filename: 'BUILD', expected: Python },
      { filename: 'BUCK', expected: Python }
    ])('matchFilename($filename) 命中 $expected.name', ({ filename, expected }) => {
      expect(LanguageDescription.matchFilename(SUPPORT_LANGUAGES, filename)).toBe(expected);
    });

    it.each([
      { alias: 'xhtml', expected: HTML },
      { alias: 'rss', expected: XML },
      { alias: 'wsdl', expected: XML }
    ])('findLanguageByName($alias) 命中 $expected.name', ({ alias, expected }) => {
      expect(findLanguageByName(alias)).toBe(expected);
    });
  });

  describe('语言 loader', () => {
    it.each(parserLoaderCases)(
      '$description.name loader 应加载对应解析器并解析代表性语法',
      async ({ description, languageName, source, expectedNodes }) => {
        const support = await description.load();
        const tree = support.language.parser.parse(source).toString();

        expect(support).toBeInstanceOf(LanguageSupport);
        expect(support.language.name).toBe(languageName);
        expect(tree).not.toContain('⚠');
        for (const node of expectedNodes) {
          expect(tree).toContain(node);
        }
      }
    );

    it.each(sqlLoaderCases)(
      '$description.name loader 应绑定正确 SQL 方言并解析代表性语法',
      async ({ description, dialect, source, expectedNodes }) => {
        const support = await description.load();
        const tree = support.language.parser.parse(source).toString();

        expect(support).toBeInstanceOf(LanguageSupport);
        expect(support.language).toBe(dialect.language);
        expect(tree).not.toContain('⚠');
        for (const node of expectedNodes) {
          expect(tree).toContain(node);
        }
      }
    );
  });

  // CE-003：`json5` 别名承诺的能力（注释 / 无引号键 / 尾逗号）解析器一条都不支持。
  // 决策是保留别名——它来自上游 `@codemirror/language-data`，上游同样绑严格 JSON 解析器，
  // 删掉等于主动分叉——改为把真实能力写进契约，并用测试锁死「别名在 + 解析器严格」这一对。
  describe('JSON5 别名契约', () => {
    it('json5 是 JSON 描述的文件类型别名，与上游一致', () => {
      expect(findLanguageByName('json5')).toBe(JSON);
      expect(upstreamByName.get('json')!.alias).toContain('json5');
    });

    it.each([
      { label: '行注释', source: '{\n  // comment\n  "a": 1\n}' },
      { label: '无引号键', source: '{ a: 1 }' },
      { label: '尾逗号', source: '{ "a": 1, }' }
    ])('解析 JSON5 的 $label 会产生错误节点（严格 JSON 解析器）', async ({ source }) => {
      const support = await JSON.load();

      expect(support.language.parser.parse(source).toString()).toContain('⚠');
    });

    it('README 说明了 json5 只是别名而非 JSON5 解析器', () => {
      const readme = readFileSync(join(import.meta.dirname, '../../README.md'), 'utf8');

      expect(readme).toContain('`json5`');
      expect(readme).toContain('@codemirror/lang-json');
    });
  });

  describe('findLanguageByName', () => {
    it('按名称查找时忽略大小写', () => {
      expect(findLanguageByName('jAvAsCrIpT')).toBe(JavaScript);
    });

    it('按别名查找时忽略大小写', () => {
      expect(findLanguageByName('JS')).toBe(JavaScript);
    });

    it('未知名称和空名称返回 null', () => {
      expect(findLanguageByName('unknown-language')).toBeNull();
      expect(findLanguageByName('')).toBeNull();
    });

    it('扩展名不是名称查找契约的一部分', () => {
      expect(JavaScript.extensions).toContain('mjs');
      expect(findLanguageByName('mjs')).toBeNull();
    });

    it('只在调用方提供的语言列表中查找', () => {
      expect(findLanguageByName('CuStOm-AlIaS', [customLanguage])).toBe(customLanguage);
      expect(findLanguageByName('JavaScript', [customLanguage])).toBeNull();
      expect(findLanguageByName('Custom', [])).toBeNull();
    });
  });
});
