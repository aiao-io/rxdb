import type { BuildOptions, BuildResult, Loader, Plugin } from 'esbuild-wasm';
import { compileScript, compileStyleAsync, compileTemplate, parse } from 'vue/compiler-sfc';
import { declaredDependencies } from './compiler-dependencies.js';
import type { CompiledProject, CompileProjectInput, ProjectTemplate } from './compiler-types.js';

export type { CompiledProject, CompileProjectInput, ProjectTemplate } from './compiler-types.js';

export interface CompileProjectOptions {
  build: (options: BuildOptions) => Promise<BuildResult>;
  angularTransform?: (source: string, filename: string, resolveTemplate: (url: string) => string) => Promise<string>;
  runtimeFiles?: Readonly<Record<string, string>>;
  runtimeImports?: Readonly<Record<string, string>>;
}

const externalModules: Record<ProjectTemplate, readonly string[]> = {
  vanilla: [],
  react: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  vue: ['vue'],
  angular: [
    '@angular/compiler',
    '@angular/core',
    '@angular/common',
    '@angular/platform-browser',
    'rxjs',
    'rxjs/operators'
  ]
};

const loaders: Record<string, Loader> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  svg: 'dataurl',
  png: 'dataurl',
  jpg: 'dataurl',
  jpeg: 'dataurl',
  gif: 'dataurl',
  webp: 'dataurl',
  ico: 'dataurl',
  woff: 'dataurl',
  woff2: 'dataurl',
  ttf: 'dataurl',
  txt: 'text'
};

function projectPath(path: string, directory = '/'): string {
  if (!path || /[\\\0?#]/.test(path)) throw new Error(`不支持的项目路径：${path}`);
  const parts: string[] = [];
  const joined = path.startsWith('/') ? path : `${directory}/${path}`;
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue;
    if (part.toLowerCase() === '.git') throw new Error('编译快照不允许包含 .git');
    if (part !== '..') parts.push(part);
    else if (parts.length) parts.pop();
    else throw new Error(`项目路径越界：${path}`);
  }
  return `/${parts.join('/')}`;
}

function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

function extension(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
}

function textContent(content: string | Uint8Array): string {
  return typeof content === 'string' ? content : new TextDecoder('utf-8', { fatal: true }).decode(content);
}

function snapshotFiles(input: CompileProjectInput): Map<string, string | Uint8Array> {
  const files = new Map<string, string | Uint8Array>();
  const names = new Set<string>();
  for (const [name, content] of Object.entries(input.files)) {
    const path = projectPath(name);
    if (names.has(path.toLowerCase())) throw new Error(`项目文件存在大小写碰撞：${name}`);
    files.set(path, content);
    names.add(path.toLowerCase());
  }
  return files;
}

function resolveFile(files: Map<string, string | Uint8Array>, path: string): string {
  const candidates = [
    path,
    ...['.ts', '.tsx', '.js', '.jsx', '.vue', '.json'].map(suffix => path + suffix),
    `${path}/index.ts`,
    `${path}/index.js`
  ];
  const result = candidates.find(candidate => files.has(candidate));
  if (!result) throw new Error(`找不到项目模块或资源：${path}`);
  return result;
}

function scopeHash(path: string): string {
  let hash = 2166136261;
  for (const character of path) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

async function compileVue(source: string, path: string): Promise<{ contents: string; css: string; loader: Loader }> {
  const { descriptor, errors } = parse(source, { filename: path });
  if (errors.length) throw new Error(`${path}: ${errors.map(String).join('\n')}`);
  const blocks = [descriptor.script, descriptor.scriptSetup, descriptor.template, ...descriptor.styles];
  if (blocks.some(block => block?.src || (block?.lang && !['ts', 'js', 'html', 'css'].includes(block.lang)))) {
    throw new Error(`${path}: 受控 Vue 模板不支持外部 SFC 块或预处理器`);
  }
  if (descriptor.customBlocks.length) throw new Error(`${path}: 不支持自定义 SFC 块`);
  const id = scopeHash(path);
  const scoped = descriptor.styles.some(style => style.scoped);
  const hasScript = !!(descriptor.script || descriptor.scriptSetup);
  const script =
    hasScript ?
      compileScript(descriptor, { id, genDefaultAs: '__sfc__', inlineTemplate: !!descriptor.scriptSetup })
    : undefined;
  let contents = script?.content ?? 'const __sfc__ = {};';
  if (!descriptor.scriptSetup && descriptor.template) {
    const template = compileTemplate({ source: descriptor.template.content, filename: path, id, scoped });
    if (template.errors.length) throw new Error(`${path}: ${template.errors.map(String).join('\n')}`);
    contents += `\n${template.code}\n__sfc__.render = render;`;
  }
  const styles = await Promise.all(
    descriptor.styles.map(style =>
      compileStyleAsync({ source: style.content, filename: path, id: `data-v-${id}`, scoped: style.scoped })
    )
  );
  const styleErrors = styles.flatMap(style => style.errors);
  if (styleErrors.length) throw new Error(`${path}: ${styleErrors.map(String).join('\n')}`);
  if (scoped) contents += `\n__sfc__.__scopeId = ${JSON.stringify(`data-v-${id}`)};`;
  contents += `\nimport ${JSON.stringify(`workbench-style:${path}`)};\nexport default __sfc__;`;
  return {
    contents,
    css: styles.map(style => style.code).join('\n'),
    loader: descriptor.scriptSetup?.lang === 'ts' || descriptor.script?.lang === 'ts' ? 'ts' : 'js'
  };
}

function runtimePath(path: string, importer?: string): string {
  const normalized = projectPath(path, importer ? parentPath(`/${importer}`) : '/');
  if (!normalized.startsWith('/runtime/')) throw new Error(`运行时资源越界：${path}`);
  return normalized.slice(1);
}

function packageName(specifier: string): string {
  return specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');
}

function projectPlugin(
  input: CompileProjectInput,
  files: Map<string, string | Uint8Array>,
  options: CompileProjectOptions,
  declared?: ReadonlySet<string>
): Plugin {
  const styles = new Map<string, string>();
  const allowed = new Set(externalModules[input.template]);
  return {
    name: 'browser-workbench-snapshot',
    setup(api) {
      api.onResolve({ filter: /^workbench-entry$/ }, () => ({ path: '/entry', namespace: 'workbench-entry' }));
      api.onLoad({ filter: /.*/, namespace: 'workbench-entry' }, () => ({
        contents: [
          ...(input.styles ?? []).map(path => `import ${JSON.stringify(projectPath(path))};`),
          ...(input.inlineCSS ? ['import "workbench-inline-style";'] : []),
          `import ${JSON.stringify(projectPath(input.entry))};`
        ].join('\n'),
        loader: 'js',
        resolveDir: '/'
      }));
      api.onResolve({ filter: /^workbench-inline-style$/ }, () => ({
        path: '/inline.css',
        namespace: 'workbench-inline-style'
      }));
      api.onLoad({ filter: /.*/, namespace: 'workbench-inline-style' }, () => ({
        contents: input.inlineCSS ?? '',
        loader: 'css',
        resolveDir: '/'
      }));
      api.onResolve({ filter: /^workbench-style:/ }, args => ({
        path: args.path.slice('workbench-style:'.length),
        namespace: 'workbench-vue-style'
      }));
      api.onResolve({ filter: /.*/, namespace: 'workbench-runtime' }, args => {
        if (!args.path.startsWith('.')) throw new Error(`运行时只允许已缓存的相对 chunk：${args.path}`);
        return { path: runtimePath(args.path, args.importer), namespace: 'workbench-runtime' };
      });
      api.onLoad({ filter: /.*/, namespace: 'workbench-runtime' }, args => {
        const contents = options.runtimeFiles?.[args.path];
        if (contents === undefined) throw new Error(`运行时资源未缓存：${args.path}`);
        return { contents, loader: 'js', resolveDir: parentPath(`/${args.path}`) };
      });
      api.onResolve({ filter: /.*/ }, args => {
        if (allowed.has(args.path)) {
          if (declared && !declared.has(packageName(args.path)))
            throw new Error(`package.json 未声明运行依赖 ${packageName(args.path)}`);
          if (options.runtimeFiles === undefined) return { path: args.path, external: true };
          const path = options.runtimeImports?.[args.path];
          if (!path) throw new Error(`运行时入口未缓存：${args.path}`);
          return { path: runtimePath(path), namespace: 'workbench-runtime' };
        }
        if (args.kind !== 'entry-point' && !args.path.startsWith('.') && !args.path.startsWith('/'))
          throw new Error(`未声明的依赖：${args.path}`);
        const directory = args.importer ? parentPath(args.importer) : '/';
        return { path: resolveFile(files, projectPath(args.path, directory)), namespace: 'workbench' };
      });
      api.onLoad({ filter: /.*/, namespace: 'workbench-vue-style' }, args => {
        const content = styles.get(args.path);
        if (content === undefined) throw new Error(`SFC 样式编译结果缺失：${args.path}`);
        return { contents: content, loader: 'css', resolveDir: parentPath(args.path) };
      });
      api.onLoad({ filter: /.*/, namespace: 'workbench' }, async args => {
        const content = files.get(args.path);
        if (content === undefined) throw new Error(`项目文件缺失：${args.path}`);
        const type = extension(args.path);
        if (type === 'vue') {
          if (input.template !== 'vue') throw new Error(`${args.path}: 当前模板不支持 Vue SFC`);
          const result = await compileVue(textContent(content), args.path);
          styles.set(args.path, result.css);
          return { contents: result.contents, loader: result.loader, resolveDir: parentPath(args.path) };
        }
        const loader = loaders[type];
        if (!loader) throw new Error(`${args.path}: 不支持此文件类型`);
        if (input.template !== 'angular' || !['ts', 'js'].includes(type))
          return { contents: content, loader, resolveDir: parentPath(args.path) };
        if (!options.angularTransform) throw new Error('Angular 模板需要独立编译适配器');
        return {
          contents: await options.angularTransform(textContent(content), args.path, url => {
            const path = projectPath(url, parentPath(args.path));
            const template = files.get(path);
            if (template === undefined) throw new Error(`${args.path}: templateUrl 找不到项目模块或资源：${path}`);
            return textContent(template);
          }),
          loader: 'js',
          resolveDir: parentPath(args.path)
        };
      });
    }
  };
}

/** 将不可变项目快照编译为预览所需的 ESM 与 CSS。 */
export async function compileProject(
  input: CompileProjectInput,
  options: CompileProjectOptions
): Promise<CompiledProject> {
  const declared = declaredDependencies(input);
  const files = snapshotFiles(input);
  resolveFile(files, projectPath(input.entry));
  if (input.template === 'angular' && !options.angularTransform) throw new Error('Angular 模板需要独立编译适配器');
  const result = await options.build({
    entryPoints: ['workbench-entry'],
    absWorkingDir: '/',
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    charset: 'utf8',
    outfile: '/workbench-output/project.js',
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: 'inline',
    logLevel: 'silent',
    plugins: [projectPlugin(input, files, options, declared)]
  });
  const javascript = result.outputFiles?.find(file => file.path.endsWith('.js'));
  if (!javascript) throw new Error('编译器没有生成项目 JavaScript');
  return { js: javascript.text, css: result.outputFiles?.find(file => file.path.endsWith('.css'))?.text ?? '' };
}
