/**
 * @fileoverview 工作台源码格式化：按仓库 .prettierrc 基线在浏览器里惰性运行 Prettier。
 *
 * @module formatter
 */

/** 一次格式化尝试的结果。 */
export type WorkbenchFormatOutcome =
  | { readonly kind: 'formatted'; readonly text: string }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'unsupported' };

/** 传给 Prettier 的选项子集，与仓库 .prettierrc 基线一致。 */
interface WorkbenchFormatOptions {
  parser: string;
  filepath: string;
  printWidth: number;
  semi: boolean;
  singleQuote: boolean;
  trailingComma: 'none';
  arrowParens: 'avoid';
  experimentalTernaries: boolean;
  jsxSingleQuote?: boolean;
  bracketSpacing?: boolean;
  singleAttributePerLine?: boolean;
  htmlWhitespaceSensitivity?: 'ignore' | 'strict';
}

type EngineFormat = (source: string, options: WorkbenchFormatOptions) => Promise<string>;

const parsers: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'babel',
  jsx: 'babel',
  mjs: 'babel',
  cjs: 'babel',
  json: 'json',
  css: 'css',
  html: 'html',
  vue: 'vue',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml'
};

/** 与仓库 .prettierrc 基线一致的核心选项；仓库私有插件（sort-json / tailwind 等）不在浏览器端运行。 */
const baseOptions = {
  arrowParens: 'avoid',
  experimentalTernaries: true,
  printWidth: 120,
  semi: true,
  singleQuote: true,
  trailingComma: 'none'
} satisfies Omit<WorkbenchFormatOptions, 'parser' | 'filepath'>;

const languageOptions: Readonly<Record<string, Partial<WorkbenchFormatOptions>>> = {
  html: { htmlWhitespaceSensitivity: 'ignore' },
  tsx: { jsxSingleQuote: true },
  vue: { singleAttributePerLine: true },
  yaml: { bracketSpacing: false },
  yml: { bracketSpacing: false }
};

let engine: Promise<EngineFormat> | undefined;

function loadEngine(): Promise<EngineFormat> {
  engine ??= (async () => {
    const [{ format }, babel, estree, typescript, postcss, html, markdown, yaml] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
      import('prettier/plugins/typescript'),
      import('prettier/plugins/postcss'),
      import('prettier/plugins/html'),
      import('prettier/plugins/markdown'),
      import('prettier/plugins/yaml')
    ]);
    const plugins = [babel, estree, typescript, postcss, html, markdown, yaml];
    return (source, options) => format(source, { ...options, plugins });
  })();
  return engine;
}

/** 单个文件的扩展名是否有可用格式化器。 */
export const workbenchFormatExtensions = new Set(Object.keys(parsers));

/**
 * 用 Prettier 格式化单个源码文件。
 *
 * @param path 项目内文件路径；用于扩展名推断与解析器选择
 * @param source 当前编辑缓冲内容
 * @returns 结果；`formatted` 文本与原文不同，`unchanged` 已符合格式，`unsupported` 没有可用格式化器
 * @throws 内容有语法错误时原样抛出 Prettier 错误，不做降级
 */
export async function formatWorkbenchSource(path: string, source: string): Promise<WorkbenchFormatOutcome> {
  const extension = path.split('.').at(-1) ?? '';
  const parser = parsers[extension];
  if (!parser) return { kind: 'unsupported' };
  const formatted = await (
    await loadEngine()
  )(source, {
    ...baseOptions,
    ...languageOptions[extension],
    parser,
    filepath: path
  });
  return formatted === source ? { kind: 'unchanged' } : { kind: 'formatted', text: formatted };
}
