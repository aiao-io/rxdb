/**
 * @file
 * @aiao/code-editor-languages
 *
 * CodeMirror 语言支持定义，包含所有支持的语言及其加载器
 */
import { LanguageDescription, LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

export type CodeEditorExtension = { readonly extension: CodeEditorExtension } | readonly CodeEditorExtension[];

export interface CodeEditorLanguageSupport {
  readonly extension: CodeEditorExtension;
}

export interface CodeEditorLanguageDescription {
  readonly name: string;
  readonly alias: readonly string[];
  readonly extensions: readonly string[];
  readonly filename: RegExp | undefined;
  readonly support: CodeEditorLanguageSupport | undefined;
  load(): Promise<CodeEditorLanguageSupport>;
}

type SqlModule = typeof import('@codemirror/lang-sql');
type SqlDialectName = 'SQLite' | 'StandardSQL' | 'PostgreSQL';

const sql = async (dialectName: SqlDialectName): Promise<LanguageSupport> => {
  const module: SqlModule = await import('@codemirror/lang-sql');
  return module.sql({ dialect: module[dialectName] });
};

/** {@link LanguageDescription.of} 的入参形状。 */
type LanguageDescriptionSpec = Parameters<typeof LanguageDescription.of>[0];

/** 上游 `@codemirror/language-data` 的描述，按小写名索引。 */
const upstreamByName = new Map(languages.map(language => [language.name.toLowerCase(), language]));

/**
 * 构造一个覆盖上游同名语言的描述，并把上游的 `alias` / `extensions` / `filename` 合并进来。
 *
 * @param spec 本仓的语言描述定义；`load` 是本仓自己的加载器，只有元数据来自上游
 * @returns 元数据是上游超集的语言描述
 *
 * @remarks
 * 本模块导出的 15 个描述**整体替换**了 `SUPPORT_LANGUAGES` 里的上游同名项。
 * 早先它们只写了本仓关心的扩展名，于是上游元数据被静默丢弃：`HTML` 丢掉 `xhtml`
 * 别名与 `.handlebars`/`.hbs`，`XML` 丢掉 `rss`/`wsdl`/`xsd` 别名与 `.xsl`/`.xsd`/`.svg`，
 * `Python` 丢掉 `.BUILD`/`.bzl` 与 `/^(BUCK|BUILD)$/` 文件名匹配，`Markdown` 丢掉 `.mkd`。
 * 对消费者而言就是 `LanguageDescription.matchFilename()` 在这些文件上突然失配（CE-002）。
 *
 * 合并而不是逐个补名单：上游升级新增别名时无需同步改这里。
 * 合并结果严格是超集，只会多匹配、不会少匹配。
 *
 * `alias` 里剔除语言名本身 —— {@link LanguageDescription.of} 会自动追加，
 * 不剔除就会留下重复项。
 */
const overrideLanguage = (spec: LanguageDescriptionSpec): LanguageDescription => {
  const normalizedName = spec.name.toLowerCase();
  const upstream = upstreamByName.get(normalizedName);
  if (!upstream) return LanguageDescription.of(spec);

  const alias = [...upstream.alias, ...(spec.alias ?? [])].map(item => item.toLowerCase());
  return LanguageDescription.of({
    ...spec,
    alias: [...new Set(alias)].filter(item => item !== normalizedName),
    extensions: [...new Set([...upstream.extensions, ...(spec.extensions ?? [])])],
    filename: spec.filename ?? upstream.filename
  });
};

export const CSS = overrideLanguage({
  name: 'CSS',
  extensions: ['css'],
  load: () => import('@codemirror/lang-css').then(m => m.css())
});

export const SQLite = overrideLanguage({
  name: 'SQLite',
  load: () => sql('SQLite')
});

export const SQL = overrideLanguage({
  name: 'SQL',
  extensions: ['sql'],
  load: () => sql('StandardSQL')
});

export const PostgreSQL = overrideLanguage({
  name: 'PostgreSQL',
  load: () => sql('PostgreSQL')
});

/**
 * JSON 语言描述，由 `@codemirror/lang-json` 提供**严格 JSON** 解析器。
 *
 * @remarks
 * `alias` 里的 `json5` 是**文件类型别名**，不代表支持 JSON5 语法。它来自上游
 * `@codemirror/language-data`——上游同样把 `json5` 绑在严格 JSON 解析器上，
 * CodeMirror 生态没有现成的 JSON5 parser。因此 `findLanguageByName('json5')`
 * 拿到的编辑器在遇到 JSON5 的注释、无引号键、尾逗号时**会产生错误节点**，
 * 表现为语法高亮中断与 lint 报错（CE-003）。
 *
 * 需要真正的 JSON5 编辑体验时，请自行实现 `CodeEditorLanguageDescription`
 * 并通过各端的 `languages` 属性传入 —— 本包不做静默降级。
 */
export const JSON = overrideLanguage({
  name: 'JSON',
  alias: ['json5'],
  extensions: ['json', 'map'],
  load: () => import('@codemirror/lang-json').then(m => m.json())
});

export const SCSS = overrideLanguage({
  name: 'SCSS',
  extensions: ['scss'],
  load: () => import('@codemirror/lang-sass').then(m => m.sass())
});

export const Sass = overrideLanguage({
  name: 'Sass',
  extensions: ['sass'],
  load: () => import('@codemirror/lang-sass').then(m => m.sass({ indented: true }))
});

export const TypeScript = overrideLanguage({
  name: 'TypeScript',
  alias: ['ts'],
  extensions: ['ts', 'mts', 'cts'],
  load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true }))
});

export const JavaScript = overrideLanguage({
  name: 'JavaScript',
  alias: ['ecmascript', 'js', 'node'],
  extensions: ['js', 'mjs', 'cjs'],
  load: () => import('@codemirror/lang-javascript').then(m => m.javascript())
});

export const JSX = overrideLanguage({
  name: 'JSX',
  extensions: ['jsx'],
  load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true }))
});

export const TSX = overrideLanguage({
  name: 'TSX',
  extensions: ['tsx'],
  load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true, jsx: true }))
});

export const HTML = overrideLanguage({
  name: 'HTML',
  extensions: ['html', 'htm'],
  load: () => import('@codemirror/lang-html').then(m => m.html())
});

export const XML = overrideLanguage({
  name: 'XML',
  extensions: ['xml'],
  load: () => import('@codemirror/lang-xml').then(m => m.xml())
});

export const Python = overrideLanguage({
  name: 'Python',
  alias: ['py'],
  extensions: ['py', 'pyw'],
  load: () => import('@codemirror/lang-python').then(m => m.python())
});

export const Markdown = overrideLanguage({
  name: 'Markdown',
  alias: ['md'],
  extensions: ['md', 'markdown'],
  load: () => import('@codemirror/lang-markdown').then(m => m.markdown())
});

const CUSTOM_LANGUAGES: readonly LanguageDescription[] = [
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

const customLanguageNames = new Set(CUSTOM_LANGUAGES.map(language => language.name.toLowerCase()));

const builtInLanguages = languages.filter(language => !customLanguageNames.has(language.name.toLowerCase()));

/**
 * 全部内置语言描述：上游 `@codemirror/language-data` 的语言，加上本仓覆盖的 15 个。
 *
 * @remarks
 * 类型刻意保持 CodeMirror 的 `LanguageDescription`，而不是本包的结构化
 * {@link CodeEditorLanguageDescription}。后者缺少 `LanguageDescription` 的私有字段
 * （`loadFunc` / `loading`），标称类型无法回流，把这个数组喂给
 * `LanguageDescription.matchFilename()` / `matchLanguageName()` 会直接编译失败（CE-001）——
 * 而按文件名匹配语言正是消费者最常见的用法。
 *
 * `satisfies` 保证它仍然满足本包对外承诺的结构约束（三端的 `languages` 属性用它做**入参**类型），
 * 同时把推断出的类型留在 `readonly LanguageDescription[]`。
 */
export const SUPPORT_LANGUAGES = Object.freeze([
  ...builtInLanguages,
  ...CUSTOM_LANGUAGES
]) satisfies readonly CodeEditorLanguageDescription[];

export const findLanguageByName = (
  name: string,
  supportedLanguages: readonly CodeEditorLanguageDescription[] = SUPPORT_LANGUAGES
): CodeEditorLanguageDescription | null => {
  const normalizedName = name.toLowerCase();
  for (const language of supportedLanguages) {
    if (language.name.toLowerCase() === normalizedName) {
      return language;
    }
    if (language.alias?.some(alias => alias.toLowerCase() === normalizedName)) {
      return language;
    }
  }
  return null;
};
